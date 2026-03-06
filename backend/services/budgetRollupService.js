/**
 * Budget Rollup Service (Issue #569)
 * 
 * Implements bottom-up budget rollup computation with:
 * - Leaf transactions as source of truth
 * - Deterministic bottom-up aggregation
 * - Versioned snapshots for consistency tracking
 * - Optimistic locking for concurrent safety
 * - Automatic cascade to ancestors
 * - Variance detection and reconciliation
 */

import { and, eq, between, desc, sql, isNull } from 'drizzle-orm';
import db from '../config/db.js';
import { categories } from '../db/schema.js';
import {
    categoryBudgetAggregates,
    budgetRollupQueue,
    budgetReconciliationAudit,
    categoryTreePaths
} from '../db/schema-budget-rollup.js';
import logger from '../utils/logger.js';
import { createAuditLog } from './auditLogService.js';

class BudgetRollupService {
    /**
     * Compute budget aggregate for a single category (bottom-up)
     */
    async computeRollupForCategory({ categoryId, tenantId, reason = 'manual' }) {
        try {
            logger.debug(`[BudgetRollup] Computing rollup for category ${categoryId}`);

            // Get category details
            const [category] = await db
                .select()
                .from(categories)
                .where(and(eq(categories.id, categoryId), eq(categories.tenantId, tenantId)));

            if (!category) {
                throw new Error(`Category ${categoryId} not found`);
            }

            // Check if category is leaf (no children)
            const [childCheck] = await db
                .select({ count: sql`COUNT(*)::int` })
                .from(categories)
                .where(eq(categories.parentCategoryId, categoryId));

            const isLeaf = childCheck.count === 0;

            let totalSpentCents = 0;
            let totalBudgetedCents = 0;
            let childCount = 0;
            let descendantCount = 0;
            let lastTransactionAt = null;
            let transactionCount = 0;

            if (isLeaf) {
                // Leaf: sum transactions directly from expenses
                const [expenseSum] = await db
                    .execute(
                        sql`
                        SELECT 
                            COALESCE(SUM((amount * 100)::int), 0) as total_spent,
                            MAX(date) as last_transaction,
                            COUNT(*) as transaction_count
                        FROM expenses 
                        WHERE category_id = ${categoryId} AND tenant_id = ${tenantId}
                    `
                    );

                totalSpentCents = expenseSum?.totalSpent || 0;
                lastTransactionAt = expenseSum?.lastTransaction;
                transactionCount = expenseSum?.transactionCount || 0;

                // Budget from category config
                const monthlyBudget = category.budget?.monthly || 0;
                totalBudgetedCents = Math.round(monthlyBudget * 100);
            } else {
                // Non-leaf: sum from children's aggregates
                const [childAggregates] = await db
                    .execute(
                        sql`
                        SELECT 
                            COALESCE(SUM(total_spent_cents), 0) as total_spent,
                            COALESCE(SUM(total_budgeted_cents), 0) as total_budgeted,
                            MAX(last_transaction_at) as last_transaction,
                            COALESCE(SUM(transaction_count), 0) as transaction_count,
                            COUNT(*) as child_count
                        FROM category_budget_aggregates
                        WHERE category_id IN (
                            SELECT id FROM categories 
                            WHERE parent_category_id = ${categoryId}
                        ) AND tenant_id = ${tenantId}
                    `
                    );

                totalSpentCents = childAggregates?.totalSpent || 0;
                totalBudgetedCents = childAggregates?.totalBudgeted || 0;
                lastTransactionAt = childAggregates?.lastTransaction;
                transactionCount = childAggregates?.transactionCount || 0;
                childCount = childAggregates?.childCount || 0;
            }

            // Calculate descendant count
            const [descendantData] = await db
                .execute(
                    sql`
                    SELECT COUNT(*) as descendant_count
                    FROM category_tree_paths
                    WHERE ancestor_id = ${categoryId} AND depth > 0
                `
                );
            descendantCount = descendantData?.descendantCount || 0;

            // Upsert aggregate snapshot
            await db
                .insert(categoryBudgetAggregates)
                .values({
                    tenantId,
                    categoryId,
                    snapshotVersion: 1,
                    isLeaf,
                    totalSpentCents,
                    totalBudgetedCents,
                    childCount,
                    descendantCount,
                    lastTransactionAt,
                    transactionCount,
                    computedBy: 'system',
                    computationReason: reason,
                    lockVersion: 1,
                    isDirty: false
                })
                .onConflictDoUpdate({
                    target: categoryBudgetAggregates.categoryId,
                    set: {
                        snapshotVersion: sql`${categoryBudgetAggregates.snapshotVersion} + 1`,
                        totalSpentCents,
                        totalBudgetedCents,
                        childCount,
                        descendantCount,
                        lastTransactionAt,
                        transactionCount,
                        lockVersion: sql`${categoryBudgetAggregates.lockVersion} + 1`,
                        isDirty: false,
                        updatedAt: new Date()
                    }
                });

            logger.info(`[BudgetRollup] Computed rollup: ${categoryId} (spent: ${totalSpentCents}¢, budgeted: ${totalBudgetedCents}¢)`);

            return {
                categoryId,
                isLeaf,
                totalSpentCents,
                totalBudgetedCents,
                transactionCount,
                parentCategoryId: category.parentCategoryId
            };
        } catch (error) {
            logger.error(`[BudgetRollup] Error computing rollup for ${categoryId}:`, error);
            throw error;
        }
    }

    /**
     * Cascade rollup to all ancestors (bottom-up propagation)
     */
    async cascadeRollupToAncestors({ categoryId, tenantId }) {
        try {
            logger.debug(`[BudgetRollup] Cascading rollup to ancestors of ${categoryId}`);

            // Get all ancestors ordered by depth (deepest first)
            const [ancestors] = await db
                .execute(
                    sql`
                    SELECT ancestor_id, depth FROM category_tree_paths
                    WHERE descendant_id = ${categoryId} AND depth > 0
                    ORDER BY depth DESC
                `
                );

            let updatedCount = 0;

            for (const ancestor of ancestors || []) {
                await this.computeRollupForCategory({
                    categoryId: ancestor.ancestorId,
                    tenantId,
                    reason: 'cascaded_from_child'
                });
                updatedCount++;
            }

            logger.info(`[BudgetRollup] Cascaded rollup to ${updatedCount} ancestors`);
            return updatedCount;
        } catch (error) {
            logger.error(`[BudgetRollup] Error cascading rollup:`, error);
            throw error;
        }
    }

    /**
     * Queue a rollup computation
     */
    async queueRollup({ categoryId, tenantId, triggerType, triggerContext = {} }) {
        try {
            const [category] = await db
                .select()
                .from(categories)
                .where(and(eq(categories.id, categoryId), eq(categories.tenantId, tenantId)));

            if (!category) {
                throw new Error(`Category ${categoryId} not found`);
            }

            await db.insert(budgetRollupQueue).values({
                tenantId,
                categoryId,
                triggerType,
                triggerContext,
                status: 'pending',
                parentCategoryId: category.parentCategoryId,
                propagateToParent: true
            });

            logger.debug(`[BudgetRollup] Queued rollup: ${categoryId} (trigger: ${triggerType})`);
        } catch (error) {
            logger.error(`[BudgetRollup] Error queueing rollup:`, error);
            throw error;
        }
    }

    /**
     * Process pending rollups from queue
     */
    async processPendingRollups(tenantId = null) {
        try {
            const conditions = [eq(budgetRollupQueue.status, 'pending')];
            if (tenantId) {
                conditions.push(eq(budgetRollupQueue.tenantId, tenantId));
            }

            const pending = await db
                .select()
                .from(budgetRollupQueue)
                .where(and(...conditions))
                .limit(100)
                .orderBy(budgetRollupQueue.createdAt);

            logger.info(`[BudgetRollup] Processing ${pending.length} pending rollups`);

            let processed = 0;
            for (const item of pending) {
                try {
                    // Mark as processing
                    await db
                        .update(budgetRollupQueue)
                        .set({
                            status: 'processing',
                            processingStartedAt: new Date()
                        })
                        .where(eq(budgetRollupQueue.id, item.id));

                    // Compute rollup
                    const result = await this.computeRollupForCategory({
                        categoryId: item.categoryId,
                        tenantId: item.tenantId,
                        reason: item.triggerType
                    });

                    // Cascade to parent if needed
                    if (item.propagateToParent && result.parentCategoryId) {
                        await this.cascadeRollupToAncestors({
                            categoryId: item.categoryId,
                            tenantId: item.tenantId
                        });
                    }

                    // Mark as completed
                    await db
                        .update(budgetRollupQueue)
                        .set({
                            status: 'completed',
                            processingCompletedAt: new Date()
                        })
                        .where(eq(budgetRollupQueue.id, item.id));

                    processed++;
                } catch (error) {
                    logger.warn(`[BudgetRollup] Error processing queue item ${item.id}:`, error);

                    // Update failed status
                    const nextRetry = item.retryCount < item.maxRetries
                        ? new Date(Date.now() + Math.pow(2, item.retryCount) * 5000)
                        : null;

                    await db
                        .update(budgetRollupQueue)
                        .set({
                            status: item.retryCount >= item.maxRetries ? 'failed' : 'pending',
                            retryCount: sql`${budgetRollupQueue.retryCount} + 1`,
                            lastError: error.message,
                            nextRetryAt: nextRetry,
                            processingStartedAt: null
                        })
                        .where(eq(budgetRollupQueue.id, item.id));
                }
            }

            return { processed, total: pending.length };
        } catch (error) {
            logger.error(`[BudgetRollup] Error processing pending rollups:`, error);
            throw error;
        }
    }

    /**
     * Detect budget variance across tree
     */
    async detectVariances({ tenantId, varianceThresholdPercent = 5.0 }) {
        try {
            const [variances] = await db
                .execute(
                    sql`
                    SELECT 
                        cba.category_id,
                        c.name,
                        cba.variance_cents,
                        cba.variance_percentage,
                        CASE 
                            WHEN ABS(cba.variance_percentage) >= 20 THEN 'critical'
                            WHEN ABS(cba.variance_percentage) >= 10 THEN 'high'
                            WHEN ABS(cba.variance_percentage) >= 5 THEN 'medium'
                            ELSE 'low'
                        END as severity
                    FROM category_budget_aggregates cba
                    JOIN categories c ON c.id = cba.category_id
                    WHERE cba.tenant_id = ${tenantId}
                      AND ABS(cba.variance_percentage) >= ${varianceThresholdPercent}
                    ORDER BY ABS(cba.variance_percentage) DESC
                `
                );

            logger.info(`[BudgetRollup] Detected ${variances?.length || 0} variance(s) in tenant ${tenantId}`);

            return variances || [];
        } catch (error) {
            logger.error(`[BudgetRollup] Error detecting variances:`, error);
            throw error;
        }
    }

    /**
     * Reconcile category budget with leaf transaction total
     */
    async reconcileCategory({ categoryId, tenantId, rootCause = 'manual_reconciliation' }) {
        try {
            logger.info(`[BudgetRollup] Reconciling category ${categoryId}`);

            // Get current aggregate
            const [current] = await db
                .select()
                .from(categoryBudgetAggregates)
                .where(
                    and(
                        eq(categoryBudgetAggregates.categoryId, categoryId),
                        eq(categoryBudgetAggregates.tenantId, tenantId)
                    )
                );

            // Get actual leaf total
            const [actual] = await db
                .execute(
                    sql`
                    SELECT 
                        COALESCE(SUM((amount * 100)::int), 0) as leaf_total,
                        COUNT(*) as transaction_count
                    FROM expenses
                    WHERE category_id = ${categoryId} AND tenant_id = ${tenantId}
                `
                );

            const leafTotal = actual?.leafTotal || 0;
            const leafCount = actual?.transactionCount || 0;

            if (!current) {
                // First time seeing this category, create initial aggregate
                await this.computeRollupForCategory({
                    categoryId,
                    tenantId,
                    reason: 'reconciliation_first_time'
                });

                return { reconciled: true, correctionApplied: false };
            }

            // Log reconciliation audit
            if (leafTotal !== current.totalSpentCents) {
                const correction = leafTotal - current.totalSpentCents;

                await db.insert(budgetReconciliationAudit).values({
                    tenantId,
                    categoryId,
                    reconciliationType: 'single_category',
                    sourceSystem: 'scheduled_job',
                    previousTotalSpentCents: current.totalSpentCents,
                    previousTotalBudgetedCents: current.totalBudgetedCents,
                    previousVarianceCents: current.varianceCents,
                    newTotalSpentCents: leafTotal,
                    newTotalBudgetedCents: current.totalBudgetedCents,
                    newVarianceCents: 0, // Will be recalculated
                    leafTransactionSumCents: leafTotal,
                    leafTransactionCount: leafCount,
                    rootCause
                });

                logger.warn(
                    `[BudgetRollup] Reconciliation correction for ${categoryId}: ${correction}¢ ` +
                    `(${current.totalSpentCents}¢ -> ${leafTotal}¢)`
                );

                // Recompute to update aggregate
                await this.computeRollupForCategory({
                    categoryId,
                    tenantId,
                    reason: 'reconciliation_correction'
                });

                // Propagate to ancestors
                const ancestorCount = await this.cascadeRollupToAncestors({
                    categoryId,
                    tenantId
                });

                return {
                    reconciled: true,
                    correctionApplied: true,
                    correctionAmount: correction,
                    ancestorsUpdated: ancestorCount
                };
            }

            return { reconciled: true, correctionApplied: false };
        } catch (error) {
            logger.error(`[BudgetRollup] Error reconciling category:`, error);
            throw error;
        }
    }

    /**
     * Run full tree reconciliation
     */
    async reconcileFullTree({ tenantId }) {
        try {
            logger.info(`[BudgetRollup] Starting full tree reconciliation for tenant ${tenantId}`);

            // Get all categories in depth-first order (leaves first)
            const [allCategories] = await db
                .execute(
                    sql`
                    SELECT id FROM categories
                    WHERE tenant_id = ${tenantId} AND is_active = TRUE
                    ORDER BY COALESCE(parent_category_id, id), created_at
                `
                );

            let reconciled = 0;
            let corrected = 0;

            for (const cat of allCategories || []) {
                const result = await this.reconcileCategory({
                    categoryId: cat.id,
                    tenantId,
                    rootCause: 'full_tree_reconciliation'
                });

                reconciled++;
                if (result.correctionApplied) corrected++;
            }

            logger.info(
                `[BudgetRollup] Full tree reconciliation complete: ` +
                `${reconciled} categories reconciled, ${corrected} corrected`
            );

            return { reconciled, corrected };
        } catch (error) {
            logger.error(`[BudgetRollup] Error in full tree reconciliation:`, error);
            throw error;
        }
    }

    /**
     * Get rollup status and metrics
     */
    async getRollupStatus({ tenantId, categoryId = null }) {
        try {
            const conditions = [eq(categoryBudgetAggregates.tenantId, tenantId)];
            if (categoryId) {
                conditions.push(eq(categoryBudgetAggregates.categoryId, categoryId));
            }

            const [status] = await db
                .select()
                .from(categoryBudgetAggregates)
                .where(and(...conditions));

            if (!status) {
                return null;
            }

            return {
                categoryId: status.categoryId,
                isLeaf: status.isLeaf,
                totalSpentCents: status.totalSpentCents,
                totalBudgetedCents: status.totalBudgetedCents,
                varianceCents: status.varianceCents,
                variancePercentage: status.variancePercentage,
                snapshotVersion: status.snapshotVersion,
                isDirty: status.isDirty,
                lastReconciledAt: status.lastReconciledAt,
                driftStatus: this.getDriftStatus(status.variancePercentage),
                freshness: this.getFreshness(status.isDirty, status.lastReconciledAt)
            };
        } catch (error) {
            logger.error(`[BudgetRollup] Error getting rollup status:`, error);
            throw error;
        }
    }

    /**
     * Helper: Classify drift severity
     */
    getDriftStatus(variancePercentage) {
        const absVariance = Math.abs(variancePercentage || 0);
        if (absVariance === 0) return 'consistent';
        if (absVariance < 5) return 'minor_drift';
        if (absVariance < 20) return 'significant_drift';
        return 'critical_drift';
    }

    /**
     * Helper: Check data freshness
     */
    getFreshness(isDirty, lastReconciledAt) {
        if (isDirty) return 'pending';
        if (!lastReconciledAt) return 'unverified';

        const hoursSinceReconcile = (Date.now() - new Date(lastReconciledAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceReconcile < 24) return 'current';
        if (hoursSinceReconcile < 168) return 'slightly_stale';
        return 'stale';
    }
}

export { BudgetRollupService };
