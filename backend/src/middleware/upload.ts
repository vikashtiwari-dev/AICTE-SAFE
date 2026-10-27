import multer from 'multer';
import path from 'path';
import fs from 'fs';

const UPLOAD_DIR = process.env.VERCEL
  ? path.join('/tmp', 'uploads')
  : path.join(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('File type rejected. Only secure document formats are permitted: PDF, JPG, PNG, DOCX.'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB maximum
});

export interface FileValidationResult {
  valid: boolean;
  mimeType?: string;
  format?: 'PDF' | 'JPEG' | 'PNG' | 'DOCX';
  error?: string;
}

/**
 * Deep format-aware validator:
 * 1. Validates magic signatures & file structure
 * 2. Checks trailer/EOF markers (%%EOF for PDF, EOI for JPEG, IEND for PNG)
 * 3. Inspects DOCX zip central directory and WordprocessingML structure
 * 4. Enforces decompression zip bomb limits (max 30MB uncompressed, max 15:1 ratio)
 * 5. Rejects embedded executable scripts (.exe, .bat, .js, .sh, etc.)
 */
export function validateDocumentFile(filePath: string, originalName?: string): FileValidationResult {
  if (!fs.existsSync(filePath)) {
    return { valid: false, error: 'Uploaded file does not exist on disk' };
  }

  const stat = fs.statSync(filePath);
  if (stat.size < 16) {
    return { valid: false, error: 'File is empty or too small to be a valid document' };
  }
  if (stat.size > 10 * 1024 * 1024) {
    return { valid: false, error: 'File exceeds maximum 10 MB size limit' };
  }

  let fd: number | null = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const headerBuf = Buffer.alloc(Math.min(stat.size, 4096));
    fs.readSync(fd, headerBuf, 0, headerBuf.length, 0);

    const tailLen = Math.min(stat.size, 4096);
    const tailBuf = Buffer.alloc(tailLen);
    fs.readSync(fd, tailBuf, 0, tailLen, stat.size - tailLen);
    fs.closeSync(fd);
    fd = null;

    // 1. PDF VALIDATION
    if (headerBuf.subarray(0, 4).toString('ascii') === '%PDF') {
      const headerStr = headerBuf.toString('ascii', 0, 1024);
      if (!/%PDF-[12]\.[0-9]/.test(headerStr)) {
        return { valid: false, error: 'Malformed PDF: Unrecognized or corrupted PDF version header' };
      }
      // Must contain %%EOF near the end
      const tailStr = tailBuf.toString('ascii');
      if (!tailStr.includes('%%EOF')) {
        return { valid: false, error: 'Malformed or truncated PDF: Missing %%EOF end-of-file trailer' };
      }
      // Malicious payload check: detect dangerous launch actions
      if (headerStr.includes('/Launch') || headerStr.includes('/EmbeddedFiles')) {
        return { valid: false, error: 'Security rejection: PDF contains prohibited executable launch actions' };
      }
      return { valid: true, mimeType: 'application/pdf', format: 'PDF' };
    }

    // 2. JPEG VALIDATION
    if (headerBuf[0] === 0xFF && headerBuf[1] === 0xD8 && headerBuf[2] === 0xFF) {
      // Must end with EOI marker: FF D9
      const lastBytes = tailBuf.subarray(tailBuf.length - 128);
      let foundEoi = false;
      for (let i = 0; i < lastBytes.length - 1; i++) {
        if (lastBytes[i] === 0xFF && lastBytes[i + 1] === 0xD9) {
          foundEoi = true;
          break;
        }
      }
      if (!foundEoi) {
        return { valid: false, error: 'Malformed or truncated JPEG: Missing EOI (End of Image) marker' };
      }
      return { valid: true, mimeType: 'image/jpeg', format: 'JPEG' };
    }

    // 3. PNG VALIDATION
    if (
      headerBuf[0] === 0x89 && headerBuf[1] === 0x50 && headerBuf[2] === 0x4E && headerBuf[3] === 0x47 &&
      headerBuf[4] === 0x0D && headerBuf[5] === 0x0A && headerBuf[6] === 0x1A && headerBuf[7] === 0x0A
    ) {
      // Must have IHDR chunk right after 8-byte signature
      const chunkType = headerBuf.subarray(12, 16).toString('ascii');
      if (chunkType !== 'IHDR') {
        return { valid: false, error: 'Malformed PNG: First chunk must be IHDR' };
      }
      const width = headerBuf.readUInt32BE(16);
      const height = headerBuf.readUInt32BE(20);
      if (width === 0 || height === 0 || width > 20000 || height > 20000) {
        return { valid: false, error: `Invalid PNG dimensions (${width}x${height})` };
      }
      // Must contain IEND chunk near end
      if (!tailBuf.includes(Buffer.from('IEND'))) {
        return { valid: false, error: 'Malformed or truncated PNG: Missing IEND trailer chunk' };
      }
      return { valid: true, mimeType: 'image/png', format: 'PNG' };
    }

    // 4. DOCX VALIDATION (Zip Package with OpenXML WordprocessingML structure & Zip Bomb protection)
    if (headerBuf[0] === 0x50 && headerBuf[1] === 0x4B && headerBuf[2] === 0x03 && headerBuf[3] === 0x04) {
      // Must contain End of Central Directory record: PK\x05\x06
      if (!tailBuf.includes(Buffer.from([0x50, 0x4B, 0x05, 0x06]))) {
        return { valid: false, error: 'Malformed DOCX: Missing ZIP End of Central Directory record' };
      }

      // Read zip archive to validate central directory headers safely
      const zipBuf = fs.readFileSync(filePath);
      let offset = 0;
      let totalUncompressedSize = 0;
      let hasContentTypes = false;
      let hasWordDocument = false;
      let fileCount = 0;

      while (offset < zipBuf.length - 30) {
        // Look for Local File Header signature: PK\x03\x04
        if (zipBuf[offset] === 0x50 && zipBuf[offset + 1] === 0x4B && zipBuf[offset + 2] === 0x03 && zipBuf[offset + 3] === 0x04) {
          fileCount++;
          if (fileCount > 500) {
            return { valid: false, error: 'DOCX rejected: Exceeds maximum 500 embedded zip entries limit' };
          }
          const compressedSize = zipBuf.readUInt32LE(offset + 18);
          const uncompressedSize = zipBuf.readUInt32LE(offset + 22);
          const nameLen = zipBuf.readUInt16LE(offset + 26);
          const extraLen = zipBuf.readUInt16LE(offset + 28);

          if (offset + 30 + nameLen > zipBuf.length) break;
          const entryName = zipBuf.toString('utf8', offset + 30, offset + 30 + nameLen);

          // Dangerous script extensions inside zip package
          const lowerName = entryName.toLowerCase();
          if (/\.(exe|bat|cmd|vbs|js|sh|ps1|dll|scr|jar)$/i.test(lowerName)) {
            return { valid: false, error: `Malicious content: ZIP archive contains prohibited executable file "${entryName}"` };
          }

          if (entryName === '[Content_Types].xml') hasContentTypes = true;
          if (entryName.startsWith('word/document.xml') || entryName.startsWith('word/') || entryName.startsWith('_rels/.rels')) {
            hasWordDocument = true;
          }

          totalUncompressedSize += uncompressedSize;
          offset += 30 + nameLen + extraLen + compressedSize;
        } else {
          offset++;
        }
      }

      // Enforce Zip Bomb Decompression Limits:
      // Max uncompressed size: 30 MB; Max compression ratio: 15:1
      if (totalUncompressedSize > 30 * 1024 * 1024) {
        return { valid: false, error: `DOCX rejected: Total uncompressed size (${Math.round(totalUncompressedSize / (1024 * 1024))}MB) exceeds 30MB limit (Decompression Bomb Protection)` };
      }
      if (stat.size > 0 && (totalUncompressedSize / stat.size) > 15) {
        return { valid: false, error: 'DOCX rejected: Unusually high compression ratio exceeds 15:1 threshold (Decompression Bomb Protection)' };
      }

      if (!hasContentTypes || !hasWordDocument) {
        return { valid: false, error: 'Rejected: Archive is a generic ZIP file, not an authentic WordprocessingML (.docx) document' };
      }

      return { valid: true, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', format: 'DOCX' };
    }

    return { valid: false, error: 'Unrecognized file format. Only verified PDF, JPEG, PNG, and DOCX documents are permitted.' };
  } catch (err: any) {
    return { valid: false, error: `Format verification failed: ${err.message}` };
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) {}
    }
  }
}

/**
 * Backward-compatible boolean wrapper for file validation
 */
export function validateFileMagic(filePath: string): boolean {
  return validateDocumentFile(filePath).valid;
}

export const UPLOAD_DIR_PATH = UPLOAD_DIR;
