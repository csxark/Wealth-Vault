import { cleanupExpiredTokens } from '../services/tokenService.js';

/**
 * Cleanup job for expired tokens and sessions
 * Runs periodically to clean up expired data
 */

// Schedule cleanup job to run every hour
const scheduleCleanup = () => {
  // Run cleanup every hour (3600000 ms)
  setInterval(async () => {
    try {
      console.log('🧹 Starting token cleanup job...');
      await cleanupExpiredTokens();
      console.log('✅ Token cleanup completed');
    } catch (error) {
      console.error('❌ Token cleanup failed:', error);
    }
  }, 60 * 60 * 1000); // 1 hour

  console.log('⏰ Token cleanup job scheduled (runs every hour)');
};

// Manual cleanup function
export const runCleanup = async () => {
  try {
    console.log('🧹 Running manual token cleanup...');
    await cleanupExpiredTokens();
    console.log('✅ Manual cleanup completed');
  } catch (error) {
    console.error('❌ Manual cleanup failed:', error);
    throw error;
  }
};

export { scheduleCleanup };
export default { scheduleCleanup, runCleanup };