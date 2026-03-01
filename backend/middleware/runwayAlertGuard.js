/**
 * Runway Alert Guard Middleware
 * Proactive circuit-breaking based on P10 runway exhaustion from Monte Carlo simulations
 */

import { db } from '../config/db.js';
import { 
    runwayAlertThresholds, 
    forecastAggregates,
    forecastScenarios 
} from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

/**
 * Middleware to check if user has critical runway risk
 * Blocks risky expenses if circuit breaker is enabled
 */
export async function runwayAlertGuard(req, res, next) {
    try {
        const userId = req.user?.userId;
        
        if (!userId) {
            return next();
        }
        
        // Get user's runway alert settings
        const [alertSettings] = await db
            .select()
            .from(runwayAlertThresholds)
            .where(eq(runwayAlertThresholds.userId, userId));
        
        // Skip if no alert settings or not active
        if (!alertSettings || !alertSettings.isActive) {
            return next();
        }
        
        // Skip if circuit breaker not enabled
        if (!alertSettings.enableCircuitBreaker) {
            return next();
        }
        
        // Get latest simulation results
        const [latestAggregate] = await db
            .select()
            .from(forecastAggregates)
            .where(eq(forecastAggregates.userId, userId))
            .orderBy(desc(forecastAggregates.computedAt))
            .limit(1);
        
        if (!latestAggregate) {
            // No simulation results, allow through
            return next();
        }
        
        // Check if depletion probability exceeds circuit breaker threshold
        const depletionProbability = parseFloat(latestAggregate.depletionProbability || 0);
        const circuitBreakerThreshold = parseFloat(alertSettings.circuitBreakerThreshold || 0.30);
        
        if (depletionProbability >= circuitBreakerThreshold) {
            // Circuit breaker tripped - block expense creation
            return res.status(403).json({
                success: false,
                error: 'Circuit breaker activated',
                message: `Your cashflow runway is critically low. Depletion risk: ${(depletionProbability * 100).toFixed(1)}% (threshold: ${(circuitBreakerThreshold * 100).toFixed(1)}%)`,
                details: {
                    depletionProbability,
                    threshold: circuitBreakerThreshold,
                    p50DaysToDepletion: latestAggregate.p50DaysToDepletion,
                    p10FinalBalance: parseFloat(latestAggregate.p10FinalBalance),
                    recommendation: 'Review your forecast simulation before making this expense.'
                },
                actions: [
                    { type: 'view_forecast', label: 'View Forecast Simulation', url: '/monte-carlo/dashboard' },
                    { type: 'reduce_expenses', label: 'Review & Reduce Expenses' },
                    { type: 'increase_revenue', label: 'Explore Revenue Options' }
                ]
            });
        }
        
        // Check runway duration
        const minRunwayDays = alertSettings.minDaysRunwayP50 || 90;
        const p50DaysToDepletion = latestAggregate.p50DaysToDepletion;
        
        if (p50DaysToDepletion && p50DaysToDepletion < minRunwayDays) {
            // Add warning header but allow request
            res.setHeader('X-Runway-Warning', `true`);
            res.setHeader('X-Runway-Days-Remaining', p50DaysToDepletion);
            
            // Add warning to response
            req.runwayWarning = {
                message: `Your projected cash runway is ${p50DaysToDepletion} days (minimum: ${minRunwayDays} days)`,
                daysRemaining: p50DaysToDepletion,
                severity: 'warning'
            };
        }
        
        // Check P10 cash reserve
        const minP10Reserve = parseFloat(alertSettings.minCashReserveP10 || 0);
        const p10FinalBalance = parseFloat(latestAggregate.p10FinalBalance || 0);
        
        if (p10FinalBalance < minP10Reserve) {
            req.runwayWarning = {
                ...req.runwayWarning,
                reserveWarning: `Pessimistic scenario shows potential cash shortage (P10: $${p10FinalBalance.toFixed(2)}, min: $${minP10Reserve.toFixed(2)})`,
                severity: 'high'
            };
        }
        
        next();
    } catch (error) {
        console.error('Runway alert guard error:', error);
        // Don't block request on error, just log
        next();
    }
}

/**
 * Check runway status without blocking
 * Returns status in response
 */
export async function checkRunwayStatus(userId) {
    try {
        const [alertSettings] = await db
            .select()
            .from(runwayAlertThresholds)
            .where(eq(runwayAlertThresholds.userId, userId));
        
        if (!alertSettings || !alertSettings.isActive) {
            return {
                status: 'unknown',
                message: 'No runway monitoring configured'
            };
        }
        
        const [latestAggregate] = await db
            .select()
            .from(forecastAggregates)
            .where(eq(forecastAggregates.userId, userId))
            .orderBy(desc(forecastAggregates.computedAt))
            .limit(1);
        
        if (!latestAggregate) {
            return {
                status: 'no_data',
                message: 'No simulation results available'
            };
        }
        
        const depletionProbability = parseFloat(latestAggregate.depletionProbability || 0);
        const p50DaysToDepletion = latestAggregate.p50DaysToDepletion;
        const p10FinalBalance = parseFloat(latestAggregate.p10FinalBalance || 0);
        
        // Determine status
        let status = 'healthy';
        const warnings = [];
        
        if (depletionProbability > 0.5) {
            status = 'critical';
            warnings.push(`High depletion risk: ${(depletionProbability * 100).toFixed(1)}%`);
        } else if (depletionProbability > 0.2) {
            status = 'warning';
            warnings.push(`Moderate depletion risk: ${(depletionProbability * 100).toFixed(1)}%`);
        }
        
        if (p50DaysToDepletion && p50DaysToDepletion < alertSettings.minDaysRunwayP50) {
            status = status === 'healthy' ? 'warning' : status;
            warnings.push(`Short runway: ${p50DaysToDepletion} days`);
        }
        
        if (p10FinalBalance < parseFloat(alertSettings.minCashReserveP10 || 0)) {
            status = status === 'healthy' ? 'warning' : status;
            warnings.push(`Low P10 reserve: $${p10FinalBalance.toFixed(2)}`);
        }
        
        return {
            status,
            warnings,
            metrics: {
                depletionProbability,
                p50DaysToDepletion,
                p10FinalBalance,
                p50FinalBalance: parseFloat(latestAggregate.p50FinalBalance),
                p90FinalBalance: parseFloat(latestAggregate.p90FinalBalance)
            },
            thresholds: {
                minDaysRunway: alertSettings.minDaysRunwayP50,
                maxDepletionProbability: parseFloat(alertSettings.maxDepletionProbability),
                minP10Reserve: parseFloat(alertSettings.minCashReserveP10)
            },
            circuitBreakerActive: alertSettings.enableCircuitBreaker && 
                depletionProbability >= parseFloat(alertSettings.circuitBreakerThreshold || 0.30)
        };
    } catch (error) {
        console.error('Error checking runway status:', error);
        return {
            status: 'error',
            message: error.message
        };
    }
}

/**
 * Trigger runway alerts if thresholds exceeded
 * Called by nightly job
 */
export async function triggerRunwayAlerts(userId) {
    try {
        const status = await checkRunwayStatus(userId);
        
        if (status.status === 'critical' || status.status === 'warning') {
            // Update alert count and last triggered
            await db
                .update(runwayAlertThresholds)
                .set({
                    lastTriggeredAt: new Date(),
                    alertCount: db.raw('alert_count + 1')
                })
                .where(eq(runwayAlertThresholds.userId, userId));
            
            // TODO: Send notification via email/push
            console.log(`🚨 Runway alert triggered for user ${userId}:`, status.warnings);
            
            return {
                alerted: true,
                status,
                message: `Runway alert sent to user ${userId}`
            };
        }
        
        return {
            alerted: false,
            status,
            message: 'No alerts needed'
        };
    } catch (error) {
        console.error('Error triggering runway alerts:', error);
        return {
            alerted: false,
            error: error.message
        };
    }
}

export default {
    runwayAlertGuard,
    checkRunwayStatus,
    triggerRunwayAlerts
};
