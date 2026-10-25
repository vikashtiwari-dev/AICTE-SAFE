import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const JWT_SECRET = process.env.JWT_SECRET || 'aicte-fdr-secret-key-2024-regulatory-safe-production';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('⚠️ [SECURITY WARNING] JWT_SECRET environment variable is not explicitly set! Using fallback key. Set JWT_SECRET in production.');
}

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    username: string;
    role: string;
    institution_id?: number;
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.query && typeof req.query.token === 'string') {
    // Support authenticated document streaming via query token
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized - Token required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden - insufficient permissions for this operation' });
    }
    next();
  };
}

/**
 * DPDP Act 2023 compliant sensitive account masking
 */
export function maskAccountNumber(accNumber?: string | null, role?: string): string {
  if (!accNumber) return 'Confidential / N/A';
  if (role === 'admin' || role === 'bureau_officer') {
    return accNumber; // authorized regulatory oversight
  }
  const clean = accNumber.trim();
  if (clean.length <= 4) return '••••' + clean;
  return '•••• •••• ' + clean.slice(-4);
}
