import cron from 'node-cron';
import { generateAlerts, dispatchStatutoryNudges } from './alertService';

/**
 * Returns true if running in a serverless cloud execution context (such as Vercel).
 * Serverless environments freeze function execution between requests, making in-process
 * node-cron and setTimeout timers unreliable and prone to cold-start race conditions.
 */
export function isServerlessEnvironment(): boolean {
  return !!process.env.VERCEL || process.env.NODE_ENV === 'production';
}

/**
 * Starts scheduled background jobs.
 * In production/serverless deployments, in-process timers are strictly suppressed in favour
 * of the authoritative cloud scheduler (Vercel Cron -> /api/alerts/cron-check).
 */
export function startCronJobs(): { active: boolean; reason: string } {
  if (isServerlessEnvironment()) {
    const msg = '[CronService] In-process scheduler disabled in serverless/production environment. Vercel Cron is the authoritative scheduler.';
    console.log(`ℹ️ ${msg}`);
    return { active: false, reason: msg };
  }

  // Standalone / Development: Schedule daily audit at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('[CronService] Running scheduled daily FDR expiry and compliance audit...');
    try {
      const alerts = await generateAlerts();
      const nudges = await dispatchStatutoryNudges();
      console.log(`[CronService] Daily audit completed: ${alerts} alerts evaluated, ${nudges} nudges dispatched.`);
    } catch (err: any) {
      console.error('[CronService] Unhandled error during scheduled daily audit:', err?.message || err);
    }
  });

  console.log('✅ [CronService] In-process background cron jobs scheduled for standalone environment.');

  // Standalone / Development: Initial audit on server startup
  const startupTimer = setTimeout(async () => {
    console.log('[CronService] Running initial startup verification and alert audit...');
    try {
      const alerts = await generateAlerts();
      const nudges = await dispatchStatutoryNudges();
      console.log(`[CronService] Initial startup check completed: ${alerts} alerts, ${nudges} nudges.`);
    } catch (err: any) {
      console.error('[CronService] Unhandled error during initial startup audit:', err?.message || err);
    }
  }, 2000);

  // Unref timer so it doesn't block process exit during tests
  if (startupTimer && typeof startupTimer.unref === 'function') {
    startupTimer.unref();
  }

  return { active: true, reason: 'In-process scheduler active for local standalone node environment.' };
}
