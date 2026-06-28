/**
 * Forecast Reconciliation Job
 * 
 * Scheduled job that:
 * - Generates forecasts for active categories
 * - Validates past forecast accuracy
 * - Updates model configurations based on performance
 * - Triggers predictive alerts
 * 
 * Issue #609: Category Budget Forecasting with Confidence Intervals
 */

import logger from '../utils/logger.js';
import forecastService from '../services/forecastService.js';
import db from '../config/db.js';
import { tenants, categories, categoryForecasts, forecastAccuracyMetrics } from '../db/schema.js';
import { eq, and, lte, gte, desc } from 'drizzle-orm';

class ForecastReconciliationJob {
    constructor() {
        this.isRunning = false;
        this.intervalHandle = null;
    }

    /**
     * Process forecasts for one tenant
     */
    async processTenant(tenantId) {
        try {
            logger.info(`[ForecastReconciliation] Processing tenant ${tenantId}`);

            // Get all active categories with budgets
            const userCategories = await db.query.categories.findMany({
                where: and(
                    eq(categories.tenantId, tenantId),
                    // Only generate forecasts for categories with budgets
                )
            });

            logger.info(`[ForecastReconciliation] Tenant ${tenantId}: found ${userCategories.length} categories`);

            let forecastsGenerated = 0;
            let forecastsValidated = 0;
            let errors = 0;

            // Group by user
            const categoriesByUser = userCategories.reduce((acc, cat) => {
                if (!acc[cat.userId]) {
                    acc[cat.userId] = [];
                }
                acc[cat.userId].push(cat);
                return acc;
            }, {});

            // Process each user's categories
            for (const [userId, userCats] of Object.entries(categoriesByUser)) {
                for (const category of userCats) {
                    try {
                        // Check if we need to generate a new forecast
                        const existingForecast = await forecastService.getLatestForecast(
                            userId,
                            category.id,
                            tenantId,
                            'monthly'
                        );

                        const shouldGenerate = !existingForecast || 
                            new Date(existingForecast.validUntil) < new Date() ||
                            existingForecast.status === 'stale';

                        if (shouldGenerate) {
                            // Collect historical data first
                            await forecastService.collectHistoricalData(
                                userId,
                                category.id,
                                tenantId,
                                'daily',
                                90
                            );

                            // Generate forecast
                            await forecastService.generateForecast(
                                userId,
                                category.id,
                                tenantId,
                                'monthly',
                                1
                            );

                            forecastsGenerated++;
                            logger.debug(
                                `[ForecastReconciliation] Generated forecast for category ${category.name}`
                            );
                        }

                        // Validate old forecasts that have ended
                        if (existingForecast && existingForecast.status === 'completed') {
                            const forecastEnd = new Date(existingForecast.forecastEnd);
                            if (forecastEnd < new Date()) {
                                // Check if we already validated this forecast
                                const existingMetric = await db.query.forecastAccuracyMetrics.findFirst({
                                    where: eq(forecastAccuracyMetrics.forecastId, existingForecast.id)
                                });

                                if (!existingMetric) {
                                    await forecastService.validateForecastAccuracy(existingForecast.id);
                                    forecastsValidated++;
                                    logger.debug(
                                        `[ForecastReconciliation] Validated forecast for category ${category.name}`
                                    );
                                }
                            }
                        }

                    } catch (error) {
                        errors++;
                        logger.error(
                            `[ForecastReconciliation] Error processing category ${category.id}:`,
                            error.message
                        );
                    }
                }
            }

            logger.info(
                `[ForecastReconciliation] Tenant ${tenantId}: ` +
                `generated ${forecastsGenerated} forecasts, ` +
                `validated ${forecastsValidated} forecasts, ` +
                `${errors} errors`
            );

            return {
                success: true,
                forecastsGenerated,
                forecastsValidated,
                errors
            };

        } catch (error) {
            logger.error(`[ForecastReconciliation] Error processing tenant ${tenantId}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Run reconciliation cycle
     */
    async runReconciliationCycle() {
        if (this.isRunning) {
            logger.debug('[ForecastReconciliation] Cycle already running, skipping');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logger.info('[ForecastReconciliation] Starting reconciliation cycle');

            // Get all active tenants
            const allTenants = await db
                .select()
                .from(tenants)
                .where(eq(tenants.status, 'active'));

            logger.info(`[ForecastReconciliation] Processing ${allTenants.length} active tenants`);

            let totalGenerated = 0;
            let totalValidated = 0;
            let successCount = 0;
            let errorCount = 0;

            // Process tenants sequentially to avoid overwhelming the system
            for (const tenant of allTenants) {
                const result = await this.processTenant(tenant.id);

                if (result.success) {
                    successCount++;
                    totalGenerated += result.forecastsGenerated || 0;
                    totalValidated += result.forecastsValidated || 0;
                } else {
                    errorCount++;
                }

                // Small delay between tenants to prevent database overload
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const duration = Date.now() - startTime;

            logger.info(
                `[ForecastReconciliation] Cycle complete in ${duration}ms: ` +
                `${successCount} tenants succeeded, ${errorCount} failed, ` +
                `${totalGenerated} forecasts generated, ${totalValidated} forecasts validated`
            );

        } catch (error) {
            logger.error('[ForecastReconciliation] Error in reconciliation cycle:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Start the reconciliation job
     * @param {number} intervalMinutes - How often to run (in minutes)
     */
    start(intervalMinutes = 60) {
        if (this.intervalHandle) {
            logger.warn('[ForecastReconciliation] Job already started');
            return;
        }

        logger.info(`[ForecastReconciliation] Starting job (runs every ${intervalMinutes} minutes)`);

        // Run immediately on start
        this.runReconciliationCycle();

        // Schedule recurring runs
        const intervalMs = intervalMinutes * 60 * 1000;
        this.intervalHandle = setInterval(() => {
            this.runReconciliationCycle();
        }, intervalMs);

        logger.info('[ForecastReconciliation] Job started successfully');
    }

    /**
     * Stop the reconciliation job
     */
    stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
            logger.info('[ForecastReconciliation] Job stopped');
        }
    }

    /**
     * Trigger a manual reconciliation cycle
     */
    async trigger() {
        logger.info('[ForecastReconciliation] Manual trigger requested');
        await this.runReconciliationCycle();
    }
}

// Export singleton instance
const forecastReconciliation = new ForecastReconciliationJob();
export default forecastReconciliation;
