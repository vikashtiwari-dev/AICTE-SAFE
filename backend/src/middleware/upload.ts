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

/**
 * Validates file magic header bytes to ensure uploaded file is not an executable,
 * script, or malicious binary masquerading with a legitimate extension.
 * Fails closed on any error or unrecognized header.
 */
export function validateFileMagic(filePath: string): boolean {
  let fd: number | null = null;
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < 4) return false;

    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(Math.min(stat.size, 2048));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    fd = null;

    // PDF signature: %PDF (hex 25 50 44 46)
    if (buffer.subarray(0, 4).toString('ascii') === '%PDF') return true;

    // JPEG signature: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true;

    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
        buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) return true;

    // Office Open XML / DOCX signature: PK\x03\x04 and contains OpenXML structure ('[Content_Types].xml' or 'word/')
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      const headerStr = buffer.toString('binary');
      if (headerStr.includes('[Content_Types].xml') || headerStr.includes('word/')) {
        return true;
      }
      return false; // Reject arbitrary zip files masquerading as docx
    }

    // Legacy OLE2 Composite (DOC): D0 CF 11 E0 A1 B1 1A E1
    if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) return true;

    return false;
  } catch (err) {
    // Fail closed: reject file if header cannot be verified
    console.warn('File magic verification exception:', err);
    return false;
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) {}
    }
  }
}

export const UPLOAD_DIR_PATH = UPLOAD_DIR;
