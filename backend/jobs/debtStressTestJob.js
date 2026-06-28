/**
 * Debt Stress Test Job
 * Nightly job that runs portfolio stress tests across all users with private debt positions
 * Generates risk alerts and updates portfolio metrics
 */

import cron from 'node-cron';
import { db } from '../config/db.js';
import { debts, debtBayesianParams, users } from '../db/schema.js';
import { eq, and, isNotNull, gte } from 'drizzle-orm';
import * as yarService from '../services/yieldAtRiskService.js';
import * as collateralOrchestrator from '../services/collateralCallOrchestrator.js';
import * as bayesianEngine from '../services/bayesianInferenceEngine.js';

/**
 * Schedule nightly stress test job
 * Runs daily at 3:00 AM
 */
export function scheduleDebtStressTest() {
    // Run every day at 3:00 AM
    cron.schedule('0 3 * * *', async () => {
        console.log('Starting nightly debt stress test job...');
        try {
            await runNightlyStressTests();
            console.log('Nightly debt stress test job completed successfully');
        } catch (error) {
            console.error('Error in nightly stress test job:', error);
        }
    });

    console.log('Debt stress test job scheduled (daily at 3:00 AM)');
}

/**
 * Run stress tests for all users
 */
async function runNightlyStressTests() {
    const startTime = Date.now();

    // Get all users with active private debts
    const usersWithDebts = await getUsersWithPrivateDebts();
    console.log(`Found ${usersWithDebts.length} users with private debt positions`);

    const results = {
        totalUsers: usersWithDebts.length,
        usersProcessed: 0,
        stressTestsRun: 0,
        collateralChecks: 0,
        alertsGenerated: 0,
        errors: []
    };

    // Process each user
    for (const user of usersWithDebts) {
        try {
            const userResults = await processUserStressTest(user.userId);
            results.usersProcessed++;
            results.stressTestsRun += userResults.stressTestsRun;
            results.collateralChecks += userResults.collateralChecks;
            results.alertsGenerated += userResults.alertsGenerated;
        } catch (error) {
            console.error(`Error processing user ${user.userId}:`, error);
            results.errors.push({
                userId: user.userId,
                error: error.message
            });
        }
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`Stress test job completed in ${duration}s:`, {
        usersProcessed: results.usersProcessed,
        stressTestsRun: results.stressTestsRun,
        collateralChecks: results.collateralChecks,
        alertsGenerated: results.alertsGenerated,
        errors: results.errors.length
    });

    return results;
}

/**
 * Get users with active private debts
 */
async function getUsersWithPrivateDebts() {
    const usersQuery = await db.selectDistinct({ userId: debts.userId })
        .from(debts)
        .where(and(
            eq(debts.status, 'active'),
            isNotNull(debts.userId)
        ));

    return usersQuery;
}

/**
 * Process stress test for a single user
 */
async function processUserStressTest(userId) {
    console.log(`Processing stress test for user ${userId}...`);

    const results = {
        stressTestsRun: 0,
        collateralChecks: 0,
        alertsGenerated: 0,
        alerts: []
    };

    // 1. Update macro factors for all debts
    await updateMacroFactorsForUser(userId);

    // 2. Get all debts with Bayesian parameters
    const userDebts = await bayesianEngine.getAllDebtsWithBayesianParams(userId);
    
    if (userDebts.length === 0) {
        console.log(`No debts with Bayesian parameters found for user ${userId}`);
        return results;
    }

    // 3. Run portfolio stress test
    const debtIds = userDebts.map(d => d.debt.id);
    
    try {
        const stressTestResults = await yarService.runStressTest(userId, debtIds, {
            horizonMonths: 12,
            iterations: 5000 // Reduced for nightly job
        });

        results.stressTestsRun = 4; // base_case, recession, boom, stress

        // Analyze stress test results and generate alerts
        const stressAlerts = analyzeStressTestResults(userId, stressTestResults);
        results.alerts.push(...stressAlerts);
        results.alertsGenerated += stressAlerts.length;

    } catch (error) {
        console.error(`Error running stress test for user ${userId}:`, error);
    }

    // 4. Check collateral positions
    try {
        const collateralStatus = await collateralOrchestrator.checkAllCollateralPositions(userId);
        results.collateralChecks = collateralStatus.total;

        // Generate collateral alerts
        const collateralAlerts = analyzeCollateralStatus(userId, collateralStatus);
        results.alerts.push(...collateralAlerts);
        results.alertsGenerated += collateralAlerts.length;

    } catch (error) {
        console.error(`Error checking collateral for user ${userId}:`, error);
    }

    // 5. Check individual debt health
    for (const debtEntry of userDebts) {
        if (debtEntry.bayesianParams) {
            const healthAlerts = analyzeDebtHealth(userId, debtEntry.debt, debtEntry.bayesianParams);
            results.alerts.push(...healthAlerts);
            results.alertsGenerated += healthAlerts.length;
        }
    }

    // 6. Send alert notifications if any critical alerts
    if (results.alerts.length > 0) {
        await sendAlertNotifications(userId, results.alerts);
    }

    console.log(`User ${userId} processing complete: ${results.alertsGenerated} alerts generated`);

    return results;
}

/**
 * Update macro factors for all user's debts
 */
async function updateMacroFactorsForUser(userId) {
    const userDebts = await db.select()
        .from(debts)
        .where(and(
            eq(debts.userId, userId),
            eq(debts.status, 'active')
        ));

    for (const debt of userDebts) {
        // Check if Bayesian params exist
        const params = await bayesianEngine.getBayesianParams(userId, debt.id);
        if (params) {
            try {
                await bayesianEngine.updateWithMacroFactors(userId, debt.id);
            } catch (error) {
                console.error(`Error updating macro factors for debt ${debt.id}:`, error);
            }
        }
    }
}

/**
 * Analyze stress test results and generate alerts
 */
function analyzeStressTestResults(userId, stressResults) {
    const alerts = [];

    const { baseCase, recession, boom, stress, summary } = stressResults;

    // Alert if recession scenario shows significant yield loss
    if (recession && recession.yieldAtRisk99 < -10) {
        alerts.push({
            userId,
            type: 'high_recession_risk',
            severity: 'high',
            message: `Recession scenario shows YaR99 of ${recession.yieldAtRisk99.toFixed(2)}% (significant yield loss)`,
            data: { yar99: recession.yieldAtRisk99, scenario: 'recession' }
        });
    }

    // Alert if stress scenario shows portfolio default risk
    if (stress && stress.portfolioDefaultProb > 0.20) {
        alerts.push({
            userId,
            type: 'high_stress_default_risk',
            severity: 'critical',
            message: `Stress scenario shows ${(stress.portfolioDefaultProb * 100).toFixed(1)}% portfolio default probability`,
            data: { defaultProb: stress.portfolioDefaultProb, scenario: 'stress' }
        });
    }

    // Alert if max YaR exceeds threshold
    if (summary && summary.maxYar99 < -15) {
        alerts.push({
            userId,
            type: 'extreme_yar',
            severity: 'high',
            message: `Maximum YaR99 across scenarios is ${summary.maxYar99.toFixed(2)}%`,
            data: { maxYar99: summary.maxYar99 }
        });
    }

    return alerts;
}

/**
 * Analyze collateral status and generate alerts
 */
function analyzeCollateralStatus(userId, collateralStatus) {
    const alerts = [];

    // Alert for margin calls
    if (collateralStatus.marginCalls > 0) {
        alerts.push({
            userId,
            type: 'margin_calls_required',
            severity: 'critical',
            message: `${collateralStatus.marginCalls} collateral position(s) require margin calls`,
            data: { count: collateralStatus.marginCalls }
        });
    }

    // Alert for liquidations
    if (collateralStatus.liquidations > 0) {
        alerts.push({
            userId,
            type: 'liquidations_pending',
            severity: 'critical',
            message: `${collateralStatus.liquidations} collateral position(s) require liquidation`,
            data: { count: collateralStatus.liquidations }
        });
    }

    // Alert for warnings
    if (collateralStatus.warning > 0) {
        alerts.push({
            userId,
            type: 'collateral_warnings',
            severity: 'medium',
            message: `${collateralStatus.warning} collateral position(s) approaching maintenance threshold`,
            data: { count: collateralStatus.warning }
        });
    }

    return alerts;
}

/**
 * Analyze individual debt health and generate alerts
 */
function analyzeDebtHealth(userId, debt, bayesianParams) {
    const alerts = [];

    const defaultProb = parseFloat(bayesianParams.subjectiveProbabilityOfDefault || 0);
    const avgVelocity = parseFloat(bayesianParams.avgPaymentVelocity || 1.0);
    const riskTier = bayesianParams.riskTier;

    // High default probability alert
    if (defaultProb > 0.10) {
        alerts.push({
            userId,
            type: 'high_default_probability',
            severity: defaultProb > 0.20 ? 'critical' : 'high',
            message: `Debt "${debt.name}" has ${(defaultProb * 100).toFixed(1)}% default probability`,
            data: { debtId: debt.id, debtName: debt.name, defaultProb, riskTier }
        });
    }

    // Poor payment velocity alert
    if (avgVelocity > 1.20) {
        alerts.push({
            userId,
            type: 'poor_payment_velocity',
            severity: 'high',
            message: `Debt "${debt.name}" has poor payment velocity (${avgVelocity.toFixed(2)}x expected time)`,
            data: { debtId: debt.id, debtName: debt.name, avgVelocity }
        });
    }

    // Distressed or default tier alert
    if (riskTier === 'distressed' || riskTier === 'default') {
        alerts.push({
            userId,
            type: 'distressed_debt',
            severity: riskTier === 'default' ? 'critical' : 'high',
            message: `Debt "${debt.name}" is in ${riskTier} risk tier`,
            data: { debtId: debt.id, debtName: debt.name, riskTier, defaultProb }
        });
    }

    return alerts;
}

/**
 * Send alert notifications to user
 */
async function sendAlertNotifications(userId, alerts) {
    // Group alerts by severity
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const highAlerts = alerts.filter(a => a.severity === 'high');
    const mediumAlerts = alerts.filter(a => a.severity === 'medium');

    console.log(`Sending ${alerts.length} alerts to user ${userId}:`, {
        critical: criticalAlerts.length,
        high: highAlerts.length,
        medium: mediumAlerts.length
    });

    // TODO: Implement actual notification service
    // - Email for critical alerts
    // - Push notification for high alerts
    // - In-app notification for medium alerts
    
    // Example:
    // if (criticalAlerts.length > 0) {
    //     await emailService.sendCriticalAlerts(userId, criticalAlerts);
    // }
    // 
    // if (highAlerts.length > 0 || criticalAlerts.length > 0) {
    //     await pushNotificationService.send(userId, {
    //         title: 'Private Debt Risk Alerts',
    //         body: `${criticalAlerts.length} critical, ${highAlerts.length} high priority alerts`
    //     });
    // }
    //
    // await inAppNotificationService.create(userId, alerts);

    return {
        sent: true,
        count: alerts.length,
        breakdown: {
            critical: criticalAlerts.length,
            high: highAlerts.length,
            medium: mediumAlerts.length
        }
    };
}

/**
 * Manual trigger for testing (can be called from API)
 */
export async function runStressTestManual() {
    console.log('Manually triggered stress test job');
    return await runNightlyStressTests();
}

export default {
    scheduleDebtStressTest,
    runStressTestManual
};
