
import cron from 'node-cron';
import { alertNotificationService } from '../services/alertNotificationService.js';

const TIMEZONE = 'Asia/Kolkata';

const ALERT_SCHEDULES = [
  {
    expression: '0 9 * * *',
    label: 'morning alert analysis at 9:00 AM'
  },
  {
    expression: '0 17 * * *',
    label: 'evening alert analysis at 5:00 PM'
  },
  {
    expression: '0 10 * * 1',
    label: 'Monday morning alert analysis at 10:00 AM'
  }
];

let scheduledTasks = [];
let isInitialized = false;
let isStopping = false;
let stopPromise = null;

const activeExecutions = new Set();

function runAlertAnalysis(label) {
  if (isStopping || !isInitialized) {
    return Promise.resolve();
  }

  const execution = (async () => {
    console.log(`[SCHEDULED] Running ${label}`);

    try {
      const result = await alertNotificationService.analyzeAndSendAlerts();
      console.log(`[SUCCESS] ${label} completed:`, result);
    } catch (error) {
      console.error(`[ERROR] ${label} failed:`, error);
    }
  })();

  activeExecutions.add(execution);

  execution.then(
    () => activeExecutions.delete(execution),
    () => activeExecutions.delete(execution)
  );

  return execution;
}

export function initializeAlertScheduler() {
  if (isInitialized || isStopping) {
    console.log('[INFO] Alert Notification Scheduler is already initialized or stopping.');
    return;
  }

  console.log('[INIT] Initializing Alert Notification Scheduler...');

  const createdTasks = [];

  try {
    for (const schedule of ALERT_SCHEDULES) {
      const task = cron.schedule(
        schedule.expression,
        () => runAlertAnalysis(schedule.label),
        {
          scheduled: true,
          timezone: TIMEZONE
        }
      );

      createdTasks.push(task);
    }
  } catch (error) {
    // Roll back partially initialized schedules.
    createdTasks.forEach(task => task.stop());
    throw error;
  }

  scheduledTasks = createdTasks;
  isInitialized = true;

  console.log('[SUCCESS] Alert Notification Scheduler initialized successfully');
  console.log('Daily alerts: 9:00 AM, 5:00 PM');
  console.log('Weekly alert: Monday 10:00 AM');
  console.log(`Timezone: ${TIMEZONE}`);
}

export function stopAlertScheduler() {
  if (stopPromise) {
    return stopPromise;
  }

  if (!isInitialized) {
    console.log('[INFO] Alert Notification Scheduler is not initialized.');
    return Promise.resolve();
  }

  isStopping = true;

  console.log('[STOP] Stopping Alert Notification Scheduler...');

  const stoppingErrors = [];

  for (const task of scheduledTasks) {
    try {
      task.stop();
    } catch (error) {
      stoppingErrors.push(error);
    }
  }

  const executionsToDrain = [...activeExecutions];

  stopPromise = Promise.resolve().then(async () => {
    try {
      await Promise.allSettled(executionsToDrain);

      if (stoppingErrors.length > 0) {
        throw new AggregateError(
          stoppingErrors,
          'One or more alert scheduler tasks failed to stop.'
        );
      }

      scheduledTasks = [];
      activeExecutions.clear();

      isInitialized = false;
      isStopping = false;

      console.log('[STOP] Alert Notification Scheduler stopped.');
    } finally {
      stopPromise = null;
    }
  });

  return stopPromise;
}
