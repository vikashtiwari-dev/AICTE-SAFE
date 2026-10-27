import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Strict rate limiter for authentication endpoints (prevent brute-force credential stuffing)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts from this IP. Please try again after 15 minutes.',
    status: 429
  }
});

// Strict rate limiter for confidential document streaming and view token generation
export const documentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 document operations per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Document access rate limit exceeded. Please wait before streaming additional financial records.',
    status: 429
  }
});

// Strict rate limiter for sensitive regulatory verification, OCR extraction, and release orders
export const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // 60 verification actions per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Regulatory verification request threshold exceeded. Please throttle verification queries.',
    status: 429
  }
});

// Standard API rate limiter for general regulatory endpoints
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // 600 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'API request threshold exceeded. Please throttle your queries.',
    status: 429
  }
});

/**
 * Sanitizes server error responses:
 * In production, strips internal database connection details, credentials, and SQL syntax details.
 */
export function sanitizeError(err: any, fallbackMessage: string): { error: string; details?: string } {
  const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  if (isProduction) {
    return { error: fallbackMessage };
  }
  return { error: fallbackMessage, details: err?.message || String(err) };
}

// Strict rate limiter for public institution onboarding requests (anti-spam / abuse prevention)
export const onboardingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 onboarding submissions per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many onboarding requests submitted from this IP. Please wait before submitting additional applications.',
    status: 429
  }
});

// Production-ready Helmet security headers conforming to GIGW & IT Act standards
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
});
