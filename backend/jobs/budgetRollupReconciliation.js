/**
 * Budget Rollup Reconciliation Job (Issue #569)
 * 
 * Scheduled job that:
 * - Processes pending budget rollup queue items
 * - Detects budget variances across all trees
 * - Reconciles parent-child inconsistencies
 * - Logs reconciliation events for compliance
 */

import logger from '../utils/logger.js';
import { BudgetRollupService } from '../services/budgetRollupService.js';
import db from '../config/db.js';
import { tenants } from '../db/schema.js';

class BudgetRollupReconciliationJob {
    constructor() {
        this.isRunning = false;
        this.intervalHandle = null;
        this.rollupService = new BudgetRollupService();
    }

    /**
     * Process one tenant's rollups
     */
    async processTenant(tenantId) {
        try {
            logger.info(`[BudgetReconciliation] Processing tenant ${tenantId}`);

            // Process pending queue items
            const queueResult = await this.rollupService.processPendingRollups(tenantId);
            logger.info(
                `[BudgetReconciliation] Tenant ${tenantId}: ` +
                `processed ${queueResult.processed}/${queueResult.total} queue items`
            );

            // Detect variances
            const variances = await this.rollupService.detectVariances({
                tenantId,
                varianceThresholdPercent: 1.0 // Detect even small drifts
            });

            if (variances.length > 0) {
                logger.warn(
                    `[BudgetReconciliation] Tenant ${tenantId}: detected ${variances.length} variance(s)`
                );

                // If critical variances, trigger full tree reconciliation
                const criticalCount = variances.filter(v => v.severity === 'critical').length;
                if (criticalCount > 0) {
                    logger.error(
                        `[BudgetReconciliation] Tenant ${tenantId}: ${criticalCount} critical variance(s), ` +
                        'initiating full reconciliation'
                    );

                    const reconcileResult = await this.rollupService.reconcileFullTree({
                        tenantId
                    });

                    logger.info(
                        `[BudgetReconciliation] Tenant ${tenantId} full reconciliation complete: ` +
                        `${reconcileResult.reconciled} categories, ` +
                        `${reconcileResult.corrected} corrected`
                    );
                }
            }

            return { success: true, queueResult, variances };
        } catch (error) {
            logger.error(`[BudgetReconciliation] Error processing tenant ${tenantId}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Run reconciliation cycle
     */
    async runReconciliationCycle() {
        if (this.isRunning) {
            logger.debug('[BudgetReconciliation] Cycle already running, skipping');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            logger.info('[BudgetReconciliation] Starting reconciliation cycle');

            // Get all active tenants
            const allTenants = await db
                .select()
                .from(tenants)
                .where(eq(tenants.status, 'active'));

            logger.info(`[BudgetReconciliation] Processing ${allTenants.length} active tenants`);

            let successCount = 0;
            let errorCount = 0;
            const results = [];

            for (const tenant of allTenants) {
                const result = await this.processTenant(tenant.id);
                results.push(result);

                if (result.success) {
                    successCount++;
                } else {
                    errorCount++;
                }
            }

            const duration = Date.now() - startTime;
            logger.info(
                `[BudgetReconciliation] Cycle complete in ${duration}ms: ` +
                `${successCount}/${allTenants.length} successful, ${errorCount} errors`
            );

            return {
                totalTenants: allTenants.length,
                successCount,
                errorCount,
                duration,
                results
            };
        } catch (error) {
            logger.error('[BudgetReconciliation] Fatal error in reconciliation cycle:', error);
            return { success: false, error: error.message };
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Start the reconciliation job
     */
    start(intervalMinutes = 60) {
        logger.info(`[BudgetReconciliation] Starting reconciliation job (interval: ${intervalMinutes}m)`);

        // Run initial cycle
        this.runReconciliationCycle().catch(err => {
            logger.error('[BudgetReconciliation] Initial cycle error:', err);
        });

        // Schedule recurring cycles
        this.intervalHandle = setInterval(
            () => {
                this.runReconciliationCycle().catch(err => {
                    logger.error('[BudgetReconciliation] Scheduled cycle error:', err);
                });
            },
            intervalMinutes * 60 * 1000
        );
    }

    /**
     * Stop the reconciliation job
     */
    stop() {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }

        logger.info('[BudgetReconciliation] Reconciliation job stopped');
    }

    /**
     * Manually trigger reconciliation for a specific tenant
     */
    async reconcileTenantOnDemand(tenantId) {
        logger.info(`[BudgetReconciliation] Triggering on-demand reconciliation for tenant ${tenantId}`);
        return this.processTenant(tenantId);
    }
}

// Create singleton instance
const budgetRollupReconciliation = new BudgetRollupReconciliationJob();

export default budgetRollupReconciliation;
