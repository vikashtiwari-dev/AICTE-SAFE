import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './db/database';
import { startCronJobs } from './services/cronService';

import authRoutes from './routes/auth';
import fdrRoutes from './routes/fdrs';
import institutionRoutes from './routes/institutions';
import alertRoutes from './routes/alerts';
import releaseRoutes from './routes/releases';
import reportRoutes from './routes/reports';

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Serve uploaded documents statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Initialize DB schema
initializeDatabase();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/fdrs', fdrRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/releases', releaseRoutes);
app.use('/api/reports', reportRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'AICTE-SAFE: Secure Automated FDR & Deposit Engine', timestamp: new Date().toISOString() });
});

// Serve frontend static build if available
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 AICTE-SAFE Engine running on http://localhost:${PORT}`);
  startCronJobs();
});

export default app;
