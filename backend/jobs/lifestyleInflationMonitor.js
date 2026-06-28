/**
 * Lifestyle Inflation Monitor Job (ISSUE-736)
 * 
 * Periodically analyzes users' spending patterns after income increases
 * and generates alerts when lifestyle inflation is detected.
 * 
 * Runs: Weekly (every Sunday at 3 AM)
 * Rationale: Weekly frequency ensures we capture changes without overwhelming users
 */

import cron from 'node-cron';
import db from '../config/db.js';
import { users, incomeHistory, tenants } from '../db/schema.js';
import { eq, and, gte, isNotNull } from 'drizzle-orm';
import lifestyleInflationService from '../services/lifestyleInflationService.js';
import logger from '../utils/logger.js';

let isRunning = false;

/**
 * Analyze lifestyle inflation for a single user
 */
const analyzeUserInflation = async (userId, tenantId) => {
  try {
    const analysis = await lifestyleInflationService.analyzeLifestyleInflation(userId, tenantId);
    
    if (analysis.status === 'analysis_complete' && analysis.alert) {
      logger.info(`[Lifestyle Inflation Monitor] Alert generated for user ${userId}`, {
        inflationScore: analysis.inflationScore,
        savingsRateChange: analysis.savingsRate.change
      });
    } else if (analysis.status === 'no_increase_detected' || analysis.status === 'insufficient_data') {
      logger.debug(`[Lifestyle Inflation Monitor] User ${userId}: ${analysis.status}`);
    }
    
    return analysis;
  } catch (error) {
    logger.error(`[Lifestyle Inflation Monitor] Failed to analyze user ${userId}:`, error);
    return null;
  }
};

/**
 * Process all users with recent income history
 */
const processAllUsers = async () => {
  if (isRunning) {
    logger.warn('[Lifestyle Inflation Monitor] Job already running, skipping...');
    return;
  }
  
  isRunning = true;
  logger.info('[Lifestyle Inflation Monitor] Starting scheduled analysis...');
  
  try {
    // Get users who have income history records in the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const usersWithIncomeHistory = await db
      .selectDistinct({
        userId: incomeHistory.userId,
        tenantId: incomeHistory.tenantId
      })
      .from(incomeHistory)
      .where(gte(incomeHistory.recordDate, sixMonthsAgo));
    
    logger.info(`[Lifestyle Inflation Monitor] Processing ${usersWithIncomeHistory.length} users with recent income history`);
    
    let successCount = 0;
    let alertCount = 0;
    let skipCount = 0;
    
    // Process users in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < usersWithIncomeHistory.length; i += batchSize) {
      const batch = usersWithIncomeHistory.slice(i, i + batchSize);
      
      const batchPromises = batch.map(({ userId, tenantId }) =>
        analyzeUserInflation(userId, tenantId)
      );
      
      const results = await Promise.allSettled(batchPromises);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          successCount++;
          if (result.value.alert) {
            alertCount++;
          }
        } else if (result.status === 'fulfilled') {
          skipCount++;
        }
      });
      
      // Add small delay between batches to prevent database overload
      if (i + batchSize < usersWithIncomeHistory.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    logger.info('[Lifestyle Inflation Monitor] Analysis complete', {
      totalUsers: usersWithIncomeHistory.length,
      analyzed: successCount,
      alertsGenerated: alertCount,
      skipped: skipCount
    });
  } catch (error) {
    logger.error('[Lifestyle Inflation Monitor] Job failed:', error);
  } finally {
    isRunning = false;
  }
};

/**
 * Schedule the lifestyle inflation monitor job
 * Runs every Sunday at 3:00 AM
 */
const scheduleLifestyleInflationMonitor = () => {
  // Run every Sunday at 3:00 AM: '0 3 * * 0'
  // For testing, can use: '*/5 * * * *' (every 5 minutes)
  cron.schedule('0 3 * * 0', async () => {
    await processAllUsers();
  });
  
  logger.info('[Lifestyle Inflation Monitor] Job scheduled (runs every Sunday at 3:00 AM)');
};

/**
 * Manually trigger the job (useful for testing)
 */
const triggerManually = async () => {
  logger.info('[Lifestyle Inflation Monitor] Manual trigger initiated');
  await processAllUsers();
};

export default {
  schedule: scheduleLifestyleInflationMonitor,
  triggerManually,
  processAllUsers
};
