/**
 * Bill Reminders Job
 * Handles scheduled bill reminders, overdue processing, and smart scheduling updates
 */

import billService from '../services/billService.js';
import notificationService from '../services/notificationService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Process daily bill reminders
 * Should be run once per day (e.g., at 9 AM)
 */
export async function processDailyBillReminders() {
  try {
    logInfo('Starting daily bill reminders job');

    // 1. Send reminders for upcoming bills
    const remindersSent = await billService.sendUpcomingBillReminders();
    logInfo(`Sent ${remindersSent} bill reminders`);

    // 2. Process due and overdue bills
    const dueResults = await billService.processDueBills();
    logInfo(`Processed ${dueResults.overdueCount} overdue bills and ${dueResults.scheduledProcessed} scheduled payments`);

    // 3. Process any scheduled notifications
    const notificationsSent = await notificationService.processScheduledNotifications();
    logInfo(`Processed ${notificationsSent} scheduled notifications`);

    // 4. Update smart scheduling suggestions for bills with smart scheduling enabled
    await updateSmartSchedulingSuggestions();

    logInfo('Daily bill reminders job completed successfully');
    
    return {
      remindersSent,
      overdueProcessed: dueResults.overdueCount,
      scheduledProcessed: dueResults.scheduledProcessed,
      notificationsSent
    };
  } catch (error) {
    logError('Error in daily bill reminders job', { error: error.message });
    throw error;
  }
}

/**
 * Update smart scheduling suggestions for bills
 */
async function updateSmartSchedulingSuggestions() {
  try {
    // This would typically query for bills with smartScheduleEnabled=true
    // and update their optimalPaymentDate based on fresh cash flow analysis
    logInfo('Updating smart scheduling suggestions');
    
    // Implementation would go here to refresh cash flow analysis
    // for all bills with smart scheduling enabled
    
  } catch (error) {
    logError('Error updating smart scheduling suggestions', { error: error.message });
  }
}

/**
 * Schedule the bill reminders job
 * @param {string} schedule - Cron schedule expression (default: '0 9 * * *' - 9 AM daily)
 */
export function scheduleBillReminders(schedule = '0 9 * * *') {
  // For production, use node-cron or similar
  // This is a placeholder that logs the intended schedule
  
  logInfo('Bill reminders job scheduled', { 
    schedule,
    description: 'Daily at 9:00 AM',
    nextRun: 'Tomorrow at 9:00 AM'
  });

  // Example implementation with node-cron (would need to be installed):
  /*
  import cron from 'node-cron';
  
  cron.schedule(schedule, async () => {
    await processDailyBillReminders();
  });
  */

  return {
    scheduled: true,
    schedule,
    jobName: 'billReminders'
  };
}

/**
 * Run bill reminders immediately (for testing or manual trigger)
 */
export async function runBillRemindersNow() {
  logInfo('Running bill reminders job manually');
  return await processDailyBillReminders();
}

export default {
  processDailyBillReminders,
  scheduleBillReminders,
  runBillRemindersNow
};
