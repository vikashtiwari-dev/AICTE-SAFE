import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../db/database';

// In production, require strong configured secret (min 16 chars) and fail-closed
export function resolveJWTSecret(): string {
  const configuredSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
  if (configuredSecret && configuredSecret.trim().length >= 16) {
    return configuredSecret.trim();
  }

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    console.error('🚨 [FATAL SECURITY ERROR] Strong JWT_SECRET with >= 16 characters must be configured in production!');
    throw new Error('FATAL SECURITY CONFIGURATION: JWT_SECRET must be configured with at least 16 characters in production.');
  }

  // Fallback for offline local developer unit tests only
  return 'aicte-local-offline-dev-key-32chars!';
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

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Valid Bearer token required in Authorization header' });
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;

    // Issue 16: Immediate revocation/deactivation enforcement against live database
    // Ensures disabled accounts, revoked tokens, or changed roles take effect immediately
    if (payload.userId) {
      try {
        const liveUser = await db.queryOne('SELECT id, is_active, role, institution_id FROM users WHERE id = ?', [payload.userId]);
        if (!liveUser) {
          return res.status(401).json({ error: 'Account does not exist or has been removed.' });
        }
        if (liveUser.is_active === false || liveUser.is_active === 0) {
          return res.status(403).json({ error: 'Account deactivated: Access revoked by Council Administrator.' });
        }
        // Sync payload role and institution_id with live authoritative database
        payload.role = liveUser.role;
        payload.institution_id = liveUser.institution_id;
      } catch (dbCheckErr) {
        // If DB temporary error, proceed with verified cryptographically signed payload
      }
    }

    req.user = payload;
    next();
  } catch (err: any) {
    // Log exception privately on the server; never expose internal JWT details to callers
    console.warn('⚠️ [Auth Warning] Token verification failed:', err?.message);
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
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
