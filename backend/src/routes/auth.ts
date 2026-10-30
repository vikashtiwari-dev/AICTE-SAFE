import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, executeMutation } from '../db/database';
import { authenticate, AuthRequest, JWT_SECRET } from '../middleware/auth';
import { authLimiter, sanitizeError } from '../middleware/security';

const router = express.Router();

const DISALLOWED_PRODUCTION_PASSWORDS = new Set([
  'admin123',
  'officer123',
  'inst123',
  'viewer123',
  'password123',
  'test1234',
  '12345678',
  'admin@123',
]);

// POST /api/auth/login (with rate limiting against brute-force)
router.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  if (isProduction && process.env.ALLOW_DEMO_CREDENTIALS !== 'true' && DISALLOWED_PRODUCTION_PASSWORDS.has(password.toLowerCase())) {
    return res.status(403).json({
      error: 'DEFAULT_CREDENTIALS_BLOCKED',
      message: 'Default demo credentials (e.g., admin123, officer123) are disabled in production per SIH PS 26265 security guidelines. Please authenticate using authorized institutional credentials.'
    });
  }

  try {
    const user = await db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username) as any;
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login in authoritative database
    try {
      await executeMutation('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
    } catch (err: any) {
      console.warn('Notice: last_login update failed:', err.message);
    }

    const payload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      institution_id: user.institution_id,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        institution_id: user.institution_id,
      },
    });
  } catch (err: any) {
    console.error('CRITICAL /api/auth/login error:', err);
    return res.status(500).json(sanitizeError(err, 'Authentication processing error'));
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await db.prepare('SELECT id, username, full_name, email, role, institution_id FROM users WHERE id = ?').get(req.user!.userId) as any;
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json(user);
  } catch (err: any) {
    return res.status(500).json(sanitizeError(err, 'Failed to fetch user session'));
  }
});

export default router;
