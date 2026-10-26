import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './db/database';
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

// Production Security Headers & Rate Limiting
app.use(securityHeaders);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Apply general API rate limiting
app.use('/api', apiLimiter);

// PRIVATE DOCUMENT STORAGE: All document access must traverse authenticated streaming route /api/documents/stream/:id
// Public static access to /uploads is disabled to protect confidential financial records.

// Initialize DB schema
initializeDatabase();

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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'AICTE SAFE: Secure Automated FDR & Deposit Engine', timestamp: new Date().toISOString() });
});

// Serve frontend static build if available
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Start server if not imported as serverless handler
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 AICTE SAFE Engine running on http://0.0.0.0:${PORT}`);
    startCronJobs();
  });
}

export default app;
