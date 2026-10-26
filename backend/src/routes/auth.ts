import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, executeMutation } from '../db/database';
import { authenticate, AuthRequest, JWT_SECRET } from '../middleware/auth';
import { authLimiter } from '../middleware/security';

const router = express.Router();

// POST /api/auth/login (with rate limiting against brute-force)
router.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

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
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  const user = await db.prepare('SELECT id, username, full_name, email, role, institution_id FROM users WHERE id = ?').get(req.user!.userId) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  return res.json(user);
});

export default router;
