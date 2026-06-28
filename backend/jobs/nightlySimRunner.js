/**
 * Nightly Simulation Runner Job
 * Compute-intensive background task for workspace health projections
 * Runs Monte Carlo simulations nightly and checks for runway alerts
 */

import cron from 'node-cron';
import { db } from '../config/db.js';
import { forecastScenarios, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { runMonteCarloSimulation } from '../services/cashflowSimulationEngine.js';
import { triggerRunwayAlerts } from '../middleware/runwayAlertGuard.js';

/**
 * Run nightly simulations for all active scenarios
 */
export async function runNightlySimulations() {
    console.log('🌙 Starting nightly Monte Carlo simulations...');
    const startTime = Date.now();
    
    try {
        // Get all active scenarios
        const activeScenarios = await db
            .select()
            .from(forecastScenarios)
            .where(eq(forecastScenarios.isActive, true));
        
        console.log(`Found ${activeScenarios.length} active scenarios to simulate`);
        
        let successCount = 0;
        let failureCount = 0;
        
        // Process scenarios in batches to avoid overwhelming the system
        const batchSize = 5;
        for (let i = 0; i < activeScenarios.length; i += batchSize) {
            const batch = activeScenarios.slice(i, i + batchSize);
            
            const results = await Promise.allSettled(
                batch.map(scenario => processScenario(scenario))
            );
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    successCount++;
                } else {
                    failureCount++;
                    console.error(`Failed to simulate scenario ${batch[index].id}:`, result.reason);
                }
            });
            
            // Small delay between batches
            if (i + batchSize < activeScenarios.length) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        const duration = Date.now() - startTime;
        console.log(`✅ Nightly simulations complete: ${successCount} succeeded, ${failureCount} failed in ${duration}ms`);
        
        // Check for runway alerts
        await checkAllRunwayAlerts();
        
        return {
            success: true,
            totalScenarios: activeScenarios.length,
            successCount,
            failureCount,
            durationMs: duration
        };
    } catch (error) {
        console.error('❌ Nightly simulation job failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Process a single scenario simulation
 */
async function processScenario(scenario) {
    try {
        console.log(`🎲 Simulating scenario ${scenario.id}: ${scenario.scenarioName}`);
        
        // Lock scenario
        await db
            .update(forecastScenarios)
            .set({ isLocked: true })
            .where(eq(forecastScenarios.id, scenario.id));
        
        // Determine simulation count (use lower count for nightly to save time)
        const simCount = Math.min(scenario.simulationCount || 10000, 5000);
        
        // Run simulation
        const results = await runMonteCarloSimulation(scenario, simCount);
        
        // Save aggregates
        await db.insert(forecastAggregates).values({
            scenarioId: scenario.id,
            userId: scenario.userId,
            batchId: results.batchId,
            p10FinalBalance: results.aggregates.p10FinalBalance.toString(),
            p50FinalBalance : results.aggregates.p50FinalBalance.toString(),
            p90FinalBalance: results.aggregates.p90FinalBalance.toString(),
            p10DaysToDepletion: results.aggregates.p10DaysToDepletion,
            p50DaysToDepletion: results.aggregates.p50DaysToDepletion,
            p90DaysToDepletion: results.aggregates.p90DaysToDepletion,
            depletionProbability: results.aggregates.depletionProbability.toString(),
            dailyPercentiles: results.aggregates.dailyPercentiles,
            finalBalanceDistribution: results.aggregates.finalBalanceDistribution,
            dailyVolatilityDistribution: results.aggregates.dailyVolatilityDistribution,
            meanFinalBalance: results.aggregates.meanFinalBalance.toString(),
            stdDevFinalBalance: results.aggregates.stdDevFinalBalance.toString(),
            skewness: results.aggregates.skewness,
            kurtosis: results.aggregates.kurtosis,
            totalSimulations: results.metadata.totalSimulations,
            successfulSimulations: results.metadata.successfulSimulations,
            totalExecutionTimeMs: results.metadata.totalExecutionTimeMs
        });
        
        // Update scenario
        await db
            .update(forecastScenarios)
            .set({
                lastSimulationResults: {
                    batchId: results.batchId,
                    p10: results.aggregates.p10FinalBalance,
                    p50: results.aggregates.p50FinalBalance,
                    p90: results.aggregates.p90FinalBalance
                },
                lastRunAt: new Date(),
                isLocked: false
            })
            .where(eq(forecastScenarios.id, scenario.id));
        
        console.log(`✅ Scenario ${scenario.id} simulated successfully`);
        return {
            success: true,
            scenarioId: scenario.id,
            batchId: results.batchId
        };
    } catch (error) {
        // Unlock on error
        await db
            .update(forecastScenarios)
            .set({ isLocked: false })
            .where(eq(forecastScenarios.id, scenario.id));
        
        throw error;
    }
}

/**
 * Check runway alerts for all users with active simulations
 */
async function checkAllRunwayAlerts() {
    console.log('🚨 Checking runway alerts...');
    
    try {
        // Get all users with active forecast scenarios
        const usersWithScenarios = await db
            .selectDistinct({ userId: forecastScenarios.userId })
            .from(forecastScenarios)
            .where(eq(forecastScenarios.isActive, true));
        
        console.log(`Checking alerts for ${usersWithScenarios.length} users`);
        
        let alertCount = 0;
        
        for (const { userId } of usersWithScenarios) {
            try {
                const result = await triggerRunwayAlerts(userId);
                if (result.alerted) {
                    alertCount++;
                }
            } catch (error) {
                console.error(`Error checking alerts for user ${userId}:`, error);
            }
        }
        
        console.log(`✅ Runway alert check complete: ${alertCount} alerts triggered`);
        
        return {
            success: true,
            userCount: usersWithScenarios.length,
            alertCount
        };
    } catch (error) {
        console.error('❌ Runway alert check failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Schedule nightly simulation job
 * Runs at 2:00 AM daily
 */
export function scheduleNightlySimulations() {
    // Run at 2:00 AM every day
    cron.schedule('0 2 * * *', async () => {
        console.log('⏰ Nightly simulation job triggered');
        await runNightlySimulations();
    }, {
        timezone: 'America/New_York'
    });
    
    console.log('📅 Nightly Monte Carlo simulation job scheduled (2:00 AM daily)');
}

export default {
    runNightlySimulations,
    scheduleNightlySimulations,
    checkAllRunwayAlerts
};
