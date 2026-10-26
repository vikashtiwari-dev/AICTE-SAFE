import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../db/database';
import { authenticate, AuthRequest, JWT_SECRET } from '../middleware/auth';
import { UPLOAD_DIR_PATH } from '../middleware/upload';

const router = express.Router();

// POST /api/documents/:id/view-token - Generate a short-lived (60s) single-use document token
router.post('/:id/view-token', authenticate, async (req: AuthRequest, res) => {
  const doc = await db.prepare(`
    SELECT d.id, f.institution_id
    FROM fdr_documents d
    JOIN fdrs f ON d.fdr_id = f.id
    WHERE d.id = ? AND d.is_active = 1
  `).get(req.params.id) as any;

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  // Authorization check for institution users
  if (req.user!.role === 'institution_user' && doc.institution_id !== req.user!.institution_id) {
    return res.status(403).json({ error: 'Access denied: Clearance required for this institutional record.' });
  }

  // Generate cryptographically unique JTI to enforce single-use consumption
  const jti = crypto.randomUUID();

  // Sign a restricted 60-second viewing token tied specifically to this document ID
  const viewToken = jwt.sign(
    { docId: doc.id, userId: req.user!.userId, purpose: 'DOCUMENT_STREAM_VIEW', jti },
    JWT_SECRET,
    { expiresIn: '60s' }
  );

  return res.json({ view_token: viewToken, expires_in_seconds: 60, jti });
});

// GET /api/documents/stream/:id - Secure, authorized document streaming
router.get('/stream/:id', async (req: any, res) => {
  // Support either standard Authorization header OR short-lived single-use view token
  let authenticatedUser: any = null;
  let singleUseJti: string | null = null;

  const authHeader = req.headers.authorization;
  const queryToken = req.query.token || req.query.viewToken;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      authenticatedUser = jwt.verify(authHeader.substring(7), JWT_SECRET);
    } catch (_) {}
  } else if (queryToken && typeof queryToken === 'string') {
    try {
      const payload = jwt.verify(queryToken, JWT_SECRET) as any;
      // If single-use document view token, ensure it matches this specific document
      if (payload.purpose === 'DOCUMENT_STREAM_VIEW') {
        if (Number(payload.docId) !== Number(req.params.id)) {
          return res.status(403).json({ error: 'Security violation: View token does not match requested document.' });
        }
        if (payload.jti) {
          // Verify if token has already been consumed
          const alreadyConsumed = await db.queryOne(
            'SELECT token_jti FROM consumed_view_tokens WHERE token_jti = ?',
            [payload.jti]
          );
          if (alreadyConsumed) {
            return res.status(403).json({ error: 'Security violation: This single-use view token has already been consumed.' });
          }
          singleUseJti = payload.jti;
        }
      }
      authenticatedUser = payload;
    } catch (_) {}
  }

  if (!authenticatedUser) {
    return res.status(401).json({ error: 'Unauthorized: Valid authentication token or view token required to access financial records.' });
  }

  const doc = await db.prepare(`
    SELECT d.*, f.institution_id, f.fdr_number
    FROM fdr_documents d
    JOIN fdrs f ON d.fdr_id = f.id
    WHERE d.id = ? AND d.is_active = 1
  `).get(req.params.id) as any;

  if (!doc) {
    return res.status(404).json({ error: 'Document not found or has been revoked' });
  }

  // Institution isolation check
  if (authenticatedUser.role === 'institution_user' && doc.institution_id !== authenticatedUser.institution_id) {
    return res.status(403).json({ error: 'Access denied: You do not possess clearance for this institutional record.' });
  }

  // Atomically consume single-use token if verified
  if (singleUseJti) {
    try {
      await db.execute(
        'INSERT INTO consumed_view_tokens (token_jti, document_id) VALUES (?, ?)',
        [singleUseJti, doc.id]
      );
    } catch (_) {}
  }

  // 1. Durably stream from cloud database payload (PostgreSQL bytea) if available
  const payloadRow = await db.queryOne(
    'SELECT data, mime_type, file_name FROM document_payloads WHERE fdr_document_id = ?',
    [doc.id]
  );

  if (payloadRow && payloadRow.data) {
    const mimeType = payloadRow.mime_type || doc.mime_type || 'application/pdf';
    const buf = Buffer.isBuffer(payloadRow.data) ? payloadRow.data : Buffer.from(payloadRow.data);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.file_name)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.end(buf);
  }

  // 2. Fallback to local filesystem path for legacy/seeded local files
  let targetPath = path.isAbsolute(doc.file_path)
    ? doc.file_path
    : path.join(UPLOAD_DIR_PATH, doc.file_path);

  if (!fs.existsSync(targetPath)) {
    const fallbackPath = path.join(UPLOAD_DIR_PATH, doc.file_name);
    if (fs.existsSync(fallbackPath)) {
      targetPath = fallbackPath;
    } else {
      return res.status(404).json({ error: 'Document file not found on secure storage server.' });
    }
  }

  const mimeType = doc.mime_type || 'application/pdf';
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.file_name)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

  const readStream = fs.createReadStream(targetPath);
  readStream.pipe(res);
});

export default router;
