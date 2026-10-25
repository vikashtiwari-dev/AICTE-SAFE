import express from 'express';
import path from 'path';
import fs from 'fs';
import { db } from '../db/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { UPLOAD_DIR_PATH } from '../middleware/upload';

const router = express.Router();

// GET /api/documents/stream/:id - Secure, authorized document streaming
router.get('/stream/:id', authenticate, (req: AuthRequest, res) => {
  const doc = db.prepare(`
    SELECT d.*, f.institution_id, f.fdr_number
    FROM fdr_documents d
    JOIN fdrs f ON d.fdr_id = f.id
    WHERE d.id = ? AND d.is_active = 1
  `).get(req.params.id) as any;

  if (!doc) {
    return res.status(404).json({ error: 'Document not found or has been revoked' });
  }

  // Authorization check
  if (req.user!.role === 'institution_user' && doc.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Access denied: You do not possess clearance for this institutional record.' });
  }

  // Resolve absolute file path
  let targetPath = path.isAbsolute(doc.file_path)
    ? doc.file_path
    : path.join(UPLOAD_DIR_PATH, doc.file_path);

  if (!fs.existsSync(targetPath)) {
    // Check fallback in uploads dir by file_name
    const fallbackPath = path.join(UPLOAD_DIR_PATH, doc.file_name);
    if (fs.existsSync(fallbackPath)) {
      targetPath = fallbackPath;
    } else {
      return res.status(404).json({ error: 'Document file not found on secure storage server.' });
    }
  }

  const mimeType = doc.mime_type || 'application/pdf';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=300'); // 5 minutes private cache

  const readStream = fs.createReadStream(targetPath);
  readStream.pipe(res);
});

export default router;

