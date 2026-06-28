/**
 * FX Conversion Service (Issue #570)
 * 
 * Handles multi-currency goal progress with:
 * - Consistent FX rate application based on policy
 * - Original + normalized amount tracking
 * - Historical rate storage with timestamps
 * - Progress recalculation from normalized amounts
 * - FX reconciliation for rate corrections
 */

import { and, eq, sql, desc, gte, lte } from 'drizzle-orm';
import db from '../config/db.js';
import { goals } from '../db/schema.js';
import {
    fxRateSnapshots,
    fxConversionPolicies,
    goalContributionFxDetails,
    fxReconciliationAudit,
    fxRateCache
} from '../db/schema-fx.js';
import logger from '../utils/logger.js';
import { createAuditLog } from './auditLogService.js';

class FXConversionService {
    /**
     * Store FX rate snapshot
     */
    async storeFXRate({ tenantId, sourceCurrency, targetCurrency, exchangeRate, rateTimestamp, policyType = 'transaction_time', rateSource = 'market' }) {
        try {
            const [rate] = await db
                .insert(fxRateSnapshots)
                .values({
                    tenantId,
                    sourceCurrency,
                    targetCurrency,
                    exchangeRate: exchangeRate.toString(),
                    rateTimestamp,
                    policyType,
                    rateSource,
                    isActive: true,
                    validFrom: new Date()
                })
                .returning();

            logger.info(`[FX] Stored rate: ${sourceCurrency}/${targetCurrency} @ ${exchangeRate} on ${rateTimestamp}`);

            // Update cache
            await this.updateFXRateCache({
                tenantId,
                sourceCurrency,
                targetCurrency,
                rate: exchangeRate,
                rateId: rate.id,
                rateTimestamp
            });

            return rate;
        } catch (error) {
            logger.error(`[FX] Error storing FX rate:`, error);
            throw error;
        }
    }

    /**
     * Get or override conversion policy for tenant
     */
    async setConversionPolicy({ tenantId, policyType = 'transaction_time', baseCurrency = 'USD', allowedCurrencies = [] }) {
        try {
            // Deactivate existing policy
            await db
                .update(fxConversionPolicies)
                .set({ isActive: false })
                .where(eq(fxConversionPolicies.tenantId, tenantId));

            // Create new policy
            const [policy] = await db
                .insert(fxConversionPolicies)
                .values({
                    tenantId,
                    policyType,
                    policyName: `${policyType}_v1`,
                    baseCurrency,
                    allowedCurrencies: JSON.stringify(allowedCurrencies),
                    isActive: true
                })
                .returning();

            logger.info(`[FX] Set conversion policy for tenant: ${policyType} (base: ${baseCurrency})`);
            return policy;
        } catch (error) {
            logger.error(`[FX] Error setting conversion policy:`, error);
            throw error;
        }
    }

    /**
     * Get active conversion policy for tenant
     */
    async getActivePolicy(tenantId) {
        try {
            const [policy] = await db
                .select()
                .from(fxConversionPolicies)
                .where(and(eq(fxConversionPolicies.tenantId, tenantId), eq(fxConversionPolicies.isActive, true)))
                .limit(1);

            if (!policy) {
                // Default policy
                return {
                    baseCurrency: 'USD',
                    policyType: 'transaction_time',
                    roundingDecimals: 2
                };
            }

            return policy;
        } catch (error) {
            logger.error(`[FX] Error getting active policy:`, error);
            throw error;
        }
    }

    /**
     * Get FX rate for a timestamp
     */
    async getFXRateForTimestamp({ tenantId, sourceCurrency, targetCurrency, timestamp, policyType = 'transaction_time' }) {
        try {
            // Check cache first
            const [cached] = await db
                .select()
                .from(fxRateCache)
                .where(
                    and(
                        eq(fxRateCache.tenantId, tenantId),
                        eq(fxRateCache.sourceCurrency, sourceCurrency),
                        eq(fxRateCache.targetCurrency, targetCurrency),
                        gte(fxRateCache.expiresAt, new Date())
                    )
                );

            if (cached) {
                logger.debug(`[FX] Cache hit: ${sourceCurrency}/${targetCurrency}`);
                return {
                    rate: parseFloat(cached.latestRate),
                    rateId: cached.latestRateId,
                    rateTimestamp: cached.latestRateTimestamp
                };
            }

            // Same currency = rate of 1
            if (sourceCurrency === targetCurrency) {
                return { rate: 1.0, rateId: null, rateTimestamp: timestamp };
            }

            // Look up rate based on policy
            let lookupStart;
            switch (policyType) {
                case 'day_close':
                    lookupStart = new Date(timestamp);
                    lookupStart.setHours(0, 0, 0, 0);
                    break;
                case 'month_close':
                    lookupStart = new Date(timestamp.getFullYear(), timestamp.getMonth(), 1);
                    break;
                default: // transaction_time
                    lookupStart = new Date(timestamp.getTime() - 24 * 60 * 60 * 1000);
            }

            const [rate] = await db
                .select()
                .from(fxRateSnapshots)
                .where(
                    and(
                        eq(fxRateSnapshots.tenantId, tenantId),
                        eq(fxRateSnapshots.sourceCurrency, sourceCurrency),
                        eq(fxRateSnapshots.targetCurrency, targetCurrency),
                        eq(fxRateSnapshots.isActive, true),
                        gte(fxRateSnapshots.rateTimestamp, lookupStart),
                        lte(fxRateSnapshots.rateTimestamp, timestamp)
                    )
                )
                .orderBy(desc(fxRateSnapshots.rateTimestamp))
                .limit(1);

            if (rate) {
                logger.debug(`[FX] Found rate: ${sourceCurrency}/${targetCurrency} @ ${rate.exchangeRate}`);
                return {
                    rate: parseFloat(rate.exchangeRate),
                    rateId: rate.id,
                    rateTimestamp: rate.rateTimestamp
                };
            }

            throw new Error(`FX rate not found for ${sourceCurrency}/${targetCurrency} at ${timestamp}`);
        } catch (error) {
            logger.error(`[FX] Error getting FX rate:`, error);
            throw error;
        }
    }

    /**
     * Update FX rate cache
     */
    async updateFXRateCache({ tenantId, sourceCurrency, targetCurrency, rate, rateId, rateTimestamp }) {
        try {
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour TTL

            await db
                .insert(fxRateCache)
                .values({
                    tenantId,
                    sourceCurrency,
                    targetCurrency,
                    latestRate: rate.toString(),
                    latestRateTimestamp: rateTimestamp,
                    latestRateId: rateId,
                    expiresAt,
                    hitCount: 0
                })
                .onConflictDoUpdate({
                    target: [fxRateCache.tenantId, fxRateCache.sourceCurrency, fxRateCache.targetCurrency],
                    set: {
                        latestRate: rate.toString(),
                        latestRateTimestamp: rateTimestamp,
                        latestRateId: rateId,
                        cachedAt: new Date(),
                        expiresAt,
                        hitCount: sql`${fxRateCache.hitCount} + 1`
                    }
                });
        } catch (error) {
            logger.debug(`[FX] Cache update failed (non-critical):`, error);
        }
    }

    /**
     * Normalize contribution to base currency
     */
    async normalizeContribution({ tenantId, lineItemId, originalCurrency, originalAmountCents, contributionTimestamp }) {
        try {
            const policy = await this.getActivePolicy(tenantId);

            // Get applicable FX rate
            const fxData = await this.getFXRateForTimestamp({
                tenantId,
                sourceCurrency: originalCurrency,
                targetCurrency: policy.baseCurrency,
                timestamp: contributionTimestamp,
                policyType: policy.policyType
            });

            // Calculate normalized amount
            const normalizedAmount = Math.round(originalAmountCents * fxData.rate);

            // Store FX details
            await db
                .insert(goalContributionFxDetails)
                .values({
                    lineItemId,
                    tenantId,
                    goalId: null, // Will be updated from line item
                    originalCurrency,
                    originalAmountCents,
                    baseCurrency: policy.baseCurrency,
                    normalizedAmountCents: normalizedAmount,
                    fxRate: fxData.rate.toString(),
                    fxRateId: fxData.rateId,
                    fxTimestamp: fxData.rateTimestamp,
                    policyType: policy.policyType,
                    policyVersion: policy.version,
                    isNormalized: true,
                    normalizedAt: new Date(),
                    normalizedBy: 'system'
                });

            logger.info(
                `[FX] Normalized: ${originalCurrency} ${originalAmountCents}¢ -> ` +
                `${policy.baseCurrency} ${normalizedAmount}¢ (rate: ${fxData.rate})`
            );

            return {
                originalCurrency,
                originalAmountCents,
                baseCurrency: policy.baseCurrency,
                normalizedAmountCents: normalizedAmount,
                fxRate: fxData.rate,
                fxTimestamp: fxData.rateTimestamp
            };
        } catch (error) {
            logger.error(`[FX] Error normalizing contribution:`, error);
            throw error;
        }
    }

    /**
     * Recalculate goal progress from normalized amounts
     */
    async recalculateGoalProgress({ goalId, tenantId }) {
        try {
            logger.info(`[FX] Recalculating progress for goal ${goalId}`);

            // Get goal
            const [goal] = await db
                .select()
                .from(goals)
                .where(and(eq(goals.id, goalId), eq(goals.tenantId, tenantId)));

            if (!goal) {
                throw new Error(`Goal ${goalId} not found`);
            }

            // Sum normalized amounts
            const [result] = await db
                .execute(
                    sql`
                    SELECT 
                        COALESCE(SUM(gcfd.normalized_amount_cents), 0) as total_normalized,
                        COUNT(DISTINCT gcfd.line_item_id) as contribution_count,
                        COUNT(DISTINCT gcfd.original_currency) as currency_count
                    FROM goal_contribution_fx_details gcfd
                    WHERE gcfd.goal_id = ${goalId} AND gcfd.tenant_id = ${tenantId}
                `
                );

            const totalNormalizedCents = result?.totalNormalized || 0;
            const targetCentAmount = Math.round(goal.targetAmount * 100);
            const progressPercentage = (totalNormalizedCents / targetCentAmount) * 100;

            logger.info(
                `[FX] Goal ${goalId} progress: ` +
                `${totalNormalizedCents}¢ / ${targetCentAmount}¢ (${progressPercentage.toFixed(2)}%)`
            );

            return {
                goalId,
                totalNormalizedCents,
                targetCentAmount,
                progressPercentage,
                contributionCount: result?.contributionCount || 0,
                currencyCount: result?.currencyCount || 0
            };
        } catch (error) {
            logger.error(`[FX] Error recalculating progress:`, error);
            throw error;
        }
    }

    /**
     * Reconcile goal for FX rate changes
     */
    async reconcileGoalForRateChange({ goalId, tenantId, newRate, oldRate, affectedCurrencies = [] }) {
        try {
            logger.info(`[FX] Reconciling goal ${goalId} for rate change`);

            // Get current progress
            const previousProgress = await this.recalculateGoalProgress({ goalId, tenantId });

            // This would be called if FX rates are retroactively corrected
            await db.insert(fxReconciliationAudit).values({
                tenantId,
                goalId,
                reconciliationType: 'rate_correction',
                triggerReason: 'retroactive_rate_fix',
                previousTotalCents: previousProgress.totalNormalizedCents,
                previousNormalizedCurrency: 'USD', // Base currency
                newTotalCents: previousProgress.totalNormalizedCents, // Will be recalculated
                newNormalizedCurrency: 'USD',
                affectedContributions: previousProgress.contributionCount,
                affectedCurrencies: JSON.stringify(affectedCurrencies),
                oldRate: oldRate?.toString(),
                newRate: newRate?.toString(),
                rateChangePercentage: oldRate && newRate 
                    ? ((newRate - oldRate) / oldRate * 100).toString() 
                    : null
            });

            return { reconciled: true, goalId };
        } catch (error) {
            logger.error(`[FX] Error reconciling goal:`, error);
            throw error;
        }
    }

    /**
     * Get FX report for goal
     */
    async getGoalFXReport({ goalId, tenantId }) {
        try {
            const [report] = await db
                .execute(
                    sql`
                    SELECT 
                        g.id,
                        g.title,
                        g.target_amount,
                        COUNT(DISTINCT gcfd.original_currency) as currency_count,
                        ARRAY_AGG(DISTINCT gcfd.original_currency) as currencies_used,
                        SUM(gcfd.original_amount_cents) as total_original_cents,
                        SUM(gcfd.normalized_amount_cents) as total_normalized_cents,
                        AVG(gcfd.fx_rate) as avg_fx_rate,
                        MIN(gcfd.fx_timestamp) as earliest_contribution,
                        MAX(gcfd.fx_timestamp) as latest_contribution,
                        COUNT(DISTINCT gcfd.line_item_id) as contribution_count
                    FROM goals g
                    LEFT JOIN goal_contribution_fx_details gcfd ON g.id = gcfd.goal_id
                    WHERE g.id = ${goalId} AND g.tenant_id = ${tenantId}
                    GROUP BY g.id, g.title, g.target_amount
                `
                );

            if (!report) {
                return null;
            }

            return {
                goalId: report.id,
                title: report.title,
                targetAmount: report.targetAmount,
                currencyCount: report.currencyCount,
                currenciesUsed: report.currenciesUsed || [],
                totalOriginalCents: report.totalOriginalCents || 0,
                totalNormalizedCents: report.totalNormalizedCents || 0,
                averageFXRate: parseFloat(report.avgFxRate) || 1.0,
                progressPercentage: ((report.totalNormalizedCents || 0) / (report.targetAmount * 100)) * 100,
                contributionCount: report.contributionCount || 0,
                earliestContribution: report.earliestContribution,
                latestContribution: report.latestContribution
            };
        } catch (error) {
            logger.error(`[FX] Error getting FX report:`, error);
            throw error;
        }
    }

    /**
     * Get reconciliation history
     */
    async getReconciliationHistory({ tenantId, goalId = null, days = 30 }) {
        try {
            const conditions = [gte(fxReconciliationAudit.createdAt, new Date(Date.now() - days * 24 * 60 * 60 * 1000))];

            if (tenantId) {
                conditions.push(eq(fxReconciliationAudit.tenantId, tenantId));
            }

            if (goalId) {
                conditions.push(eq(fxReconciliationAudit.goalId, goalId));
            }

            const history = await db
                .select()
                .from(fxReconciliationAudit)
                .where(and(...conditions))
                .orderBy(desc(fxReconciliationAudit.createdAt))
                .limit(100);

            return history;
        } catch (error) {
            logger.error(`[FX] Error getting reconciliation history:`, error);
            throw error;
        }
    }
}

export { FXConversionService };
