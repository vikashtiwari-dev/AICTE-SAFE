import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// In production, reject static default fallback secrets to prevent token forgery
function resolveJWTSecret(): string {
  const configuredSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
  if (configuredSecret && configuredSecret.trim().length >= 16) {
    return configuredSecret.trim();
  }

  if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
    console.error('🚨 [FATAL SECURITY ERROR] JWT_SECRET must be configured with >= 16 chars in production!');
    process.exit(1);
  }

  // Generate a persistent, cryptographically secure random secret for this runtime instance
  const ephemeralSecret = crypto.randomBytes(32).toString('hex');
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️ [SECURITY NOTICE] Production runtime auto-generated an ephemeral 256-bit JWT signing key to prevent forged fallback tokens.');
  }
  return ephemeralSecret;
}

export const JWT_SECRET = resolveJWTSecret();

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    username: string;
    role: string;
    institution_id?: number;
  };
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Valid Bearer token required in Authorization header' });
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = payload;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Invalid or expired token', message: err.message });
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
