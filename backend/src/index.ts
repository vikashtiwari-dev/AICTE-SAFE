import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { initializeDatabase, db } from './db/database';
import { startCronJobs } from './services/cronService';
import { securityHeaders, apiLimiter } from './middleware/security';

import authRoutes from './routes/auth';
import fdrRoutes from './routes/fdrs';
import institutionRoutes from './routes/institutions';
import alertRoutes from './routes/alerts';
import releaseRoutes from './routes/releases';
import reportRoutes from './routes/reports';
import disputeRoutes from './routes/disputes';
import notificationRoutes from './routes/notifications';
import invocationRoutes from './routes/invocations';
import certificateRoutes from './routes/certificates';
import bulkRoutes from './routes/bulk';
import documentRoutes from './routes/documents';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Trust reverse proxy in serverless environments (Vercel, AWS Lambda, Cloudflare)
app.set('trust proxy', 1);

// Production Security Headers & Strict Origin Restriction
app.use(securityHeaders);

const allowedOrigins = [
  'https://aicte-safe.vercel.app',
  process.env.FRONTEND_URL,
  process.env.APP_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Permit server-to-server or requests without origin header (e.g. cron, health checks, curl)
    if (!origin) return callback(null, true);
    // Strict origin matching: Never allow blanket *.vercel.app wildcard subdomains
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Cross-Origin Request Blocked by AICTE-SAFE Security Policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Avoid stream drain hangs in serverless environments when body is pre-parsed or drained by runtime
app.use((req: any, _res: any, next: any) => {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string' && (req.body.trim().startsWith('{') || req.body.trim().startsWith('['))) {
      try {
        req.body = JSON.parse(req.body);
      } catch (_) {}
    } else if (Buffer.isBuffer(req.body)) {
      try {
        req.body = JSON.parse(req.body.toString('utf8'));
      } catch (_) {}
    }
    req._body = true;
  } else if (req.readableEnded || req.complete) {
    req._body = true;
  }
  next();
});

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Apply general API rate limiting
app.use('/api', apiLimiter);

// PRIVATE DOCUMENT STORAGE: All document access must traverse authenticated streaming route /api/documents/stream/:id
// Public static access to /uploads is disabled to protect confidential financial records.

// Gate all requests on awaited database initialization to prevent cold-start race conditions
let dbInitPromise: Promise<void> | null = null;
export function ensureDbInitialized(): Promise<void> {
  if (!dbInitPromise) {
    dbInitPromise = initializeDatabase().catch(err => {
      console.error('🚨 Fatal Database Initialization Failure:', err);
      dbInitPromise = null; // allow retry on next invocation
      throw err;
    });
  }
  return dbInitPromise;
}

// Health check verifies service and database connectivity for cloud serverless monitors
// Sanitized: Never exposes raw database internal errors or credentials publicly; returns 503 on database failure
app.get('/api/health', async (_req, res) => {
  let isDbHealthy = false;
  try {
    const row = await db.queryOne('SELECT 1 as connected');
    isDbHealthy = Boolean(row);
  } catch (err: any) {
    // Log detailed failure privately on the server
    console.error('🚨 [Health Check Failure] Database connectivity check failed:', err?.message || err);
    isDbHealthy = false;
  }

  if (!isDbHealthy) {
    return res.status(503).json({
      status: 'unhealthy',
      service: 'AICTE SAFE: Secure Automated FDR & Deposit Engine',
      database: 'UNAVAILABLE',
      timestamp: new Date().toISOString()
    });
  }

  return res.json({
    status: 'ok',
    service: 'AICTE SAFE: Secure Automated FDR & Deposit Engine',
    database: 'CONNECTED',
    timestamp: new Date().toISOString()
  });
});

app.use(async (_req, res, next) => {
  try {
    await ensureDbInitialized();
    next();
  } catch (err: any) {
    return res.status(503).json({
      error: 'Service Unavailable: Database initialization in progress or failed to connect to authoritative store.',
      status: 'INITIALIZATION_FAILED'
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/fdrs', fdrRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/releases', releaseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/invocations', invocationRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/bulk', bulkRoutes);
app.use('/api/documents', documentRoutes);

// Serve frontend static build if available
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Start server if not running in serverless environment
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  ensureDbInitialized().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 AICTE SAFE Engine running on http://0.0.0.0:${PORT}`);
      startCronJobs();
    });
  }).catch((err) => {
    console.error('Fatal initialization error:', err);
  });
}

export default app;
