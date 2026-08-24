import cron from 'node-cron';
import { alertNotificationService } from '../services/alertNotificationService.js';

export function initializeAlertScheduler() {
  console.log('[INIT] Initializing Alert Notification Scheduler...');

  cron.schedule('0 9 * * *', async () => {
    console.log('[SCHEDULED] Running morning alert analysis at 9:00 AM');
    try {
      const result = await alertNotificationService.analyzeAndSendAlerts();
      console.log('[SUCCESS] Morning alert analysis completed:', result);
    } catch (error) {
      console.error('[ERROR] Morning alert analysis failed:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  cron.schedule('0 17 * * *', async () => {
    console.log('[SCHEDULED] Running evening alert analysis at 5:00 PM');
    try {
      const result = await alertNotificationService.analyzeAndSendAlerts();
      console.log('[SUCCESS] Evening alert analysis completed:', result);
    } catch (error) {
      console.error('[ERROR] Evening alert analysis failed:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  cron.schedule('0 10 * * 1', async () => {
    console.log('[SCHEDULED] Running Monday morning alert analysis at 10:00 AM');
    try {
      const result = await alertNotificationService.analyzeAndSendAlerts();
      console.log('[SUCCESS] Monday alert analysis completed:', result);
    } catch (error) {
      console.error('[ERROR] Monday alert analysis failed:', error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  console.log('[SUCCESS] Alert Notification Scheduler initialized successfully');
  console.log('Daily alerts: 9:00 AM, 5:00 PM');
  console.log('Weekly alert: Monday 10:00 AM');
  console.log('Timezone: Asia/Kolkata');
}

export function stopAlertScheduler() {
  cron.getTasks().forEach(task => task.stop());
  console.log('[STOP] Alert Notification Scheduler stopped');
}