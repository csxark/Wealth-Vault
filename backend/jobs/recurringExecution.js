import { processRecurringExpenses } from '../services/expenseService.js';

/**
 * Recurring Transaction Execution Job
 * Automatically processes and creates recurring expenses based on their patterns
 * Runs daily to check for due recurring transactions
 */

let isRunning = false;
let lastRunTime = null;
let lastRunResults = null;

/**
 * Schedule the recurring expense execution job
 * Runs every 24 hours by default
 * @param {number} intervalMs - Interval in milliseconds (default: 24 hours)
 */
const scheduleRecurringExecution = (intervalMs = 24 * 60 * 60 * 1000) => {
  // Run immediately on startup (with a small delay to ensure DB is ready)
  setTimeout(async () => {
    console.log('🔄 Running initial recurring expense check...');
    await runRecurringExecution();
  }, 10000); // 10 second delay

  // Schedule regular execution
  setInterval(async () => {
    await runRecurringExecution();
  }, intervalMs);

  const hours = Math.round(intervalMs / (60 * 60 * 1000));
  console.log(`⏰ Recurring expense job scheduled (runs every ${hours} hours)`);
};

/**
 * Execute the recurring expense processing
 * Includes lock mechanism to prevent concurrent executions
 */
const runRecurringExecution = async () => {
  // Prevent concurrent executions
  if (isRunning) {
    console.log('⚠️ Recurring expense job is already running, skipping...');
    return null;
  }

  isRunning = true;
  const startTime = new Date();

  try {
    console.log('🔄 Starting recurring expense execution job...');
    console.log(`📅 Current time: ${startTime.toISOString()}`);

    const results = await processRecurringExpenses();

    lastRunTime = startTime;
    lastRunResults = results;

    console.log('✅ Recurring expense execution completed');
    console.log(`   📊 Processed: ${results.processed}`);
    console.log(`   ✨ Created: ${results.created}`);
    console.log(`   ❌ Failed: ${results.failed}`);
    console.log(`   ⏱️ Duration: ${results.duration}ms`);

    if (results.errors.length > 0) {
      console.log('   🔴 Errors:', JSON.stringify(results.errors, null, 2));
    }

    return results;
  } catch (error) {
    console.error('❌ Recurring expense execution failed:', error);
    lastRunResults = { error: error.message };
    return null;
  } finally {
    isRunning = false;
  }
};

/**
 * Manual execution function (can be called via API or CLI)
 */
export const runManualExecution = async () => {
  console.log('🔄 Running manual recurring expense execution...');
  return await runRecurringExecution();
};

/**
 * Get job status information
 */
export const getJobStatus = () => {
  return {
    isRunning,
    lastRunTime: lastRunTime ? lastRunTime.toISOString() : null,
    lastRunResults,
  };
};

export { scheduleRecurringExecution, runRecurringExecution };
export default { 
  scheduleRecurringExecution, 
  runRecurringExecution, 
  runManualExecution,
  getJobStatus 
};
