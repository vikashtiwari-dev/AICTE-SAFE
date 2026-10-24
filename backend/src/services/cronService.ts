import cron from 'node-cron';
import { generateAlerts } from './alertService';

export function startCronJobs() {
  // Run daily at midnight
  cron.schedule('0 0 * * *', () => {
    console.log('[CronService] Running daily FDR expiry and compliance check...');
    try {
      generateAlerts();
    } catch (err) {
      console.error('[CronService] Error in daily check:', err);
    }
  });

  console.log('✅ [CronService] Cron jobs scheduled.');

  // Run once on startup as well
  setTimeout(() => {
    console.log('[CronService] Running initial FDR verification check on startup...');
    try {
      generateAlerts();
    } catch (err) {
      console.error('[CronService] Error in startup check:', err);
    }
  }, 2000);
}
