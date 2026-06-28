import db from '../config/db.js';
import { targetAllocations, rebalanceHistory, rebalancingOrders } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import ledgerConsolidator from './ledgerConsolidator.js';
import { calculateDriftVariance, roundToPrecision } from '../utils/financialMath.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Rebalance Engine (#449)
 * Generates rebalancing proposals based on drift from target allocation.
 */
class RebalanceEngine {
    /**
     * Generate rebalancing proposal for a user
     */
    async generateProposal(userId) {
        logInfo(`[Rebalance Engine] Generating proposal for user ${userId}`);

        try {
            // 1. Get Actual Global Allocation
            const actual = await ledgerConsolidator.getGlobalAllocation(userId);

            // 2. Get Target Allocations
            const targets = await db.select().from(targetAllocations)
                .where(and(eq(targetAllocations.userId, userId), eq(targetAllocations.isActive, true)));

            if (targets.length === 0) return { drift: 0, orders: [] };

            const targetWeights = {};
            targets.forEach(t => {
                targetWeights[t.assetType] = parseFloat(t.targetPercentage) / 100;
            });

            // 3. Calculate Drift
            const driftDelta = calculateDriftVariance(actual.weights, targetWeights);
            logInfo(`[Rebalance Engine] Calculated Drift Variance: ${driftDelta}`);

            const orders = [];
            const totalValue = actual.totalBalance;

            // 4. Generate Buy/Sell Orders (Delta-Neutral strategy)
            for (const target of targets) {
                const targetWeight = parseFloat(target.targetPercentage) / 100;
                const actualWeight = parseFloat(actual.weights[target.assetType] || 0);

                const drift = actualWeight - targetWeight;
                const absDrift = Math.abs(drift);
                const threshold = parseFloat(target.toleranceBand) / 100;

                if (absDrift > threshold) {
                    const deltaValue = drift * totalValue; // Positive means sell, negative means buy

                    orders.push({
                        assetType: target.assetType,
                        assetSymbol: target.symbol || 'CASH_RESERVE',
                        drift: drift.toFixed(4),
                        orderType: drift > 0 ? 'sell' : 'buy',
                        amount: Math.abs(deltaValue).toFixed(2),
                        priority: absDrift > (threshold * 2) ? 'high' : 'medium'
                    });
                }
            }

            // 5. Store Proposed Orders
            if (orders.length > 0) {
                await db.transaction(async (tx) => {
                    for (const order of orders) {
                        await tx.insert(rebalancingOrders).values({
                            userId,
                            orderType: order.orderType,
                            assetSymbol: order.assetSymbol,
                            quantity: '0', // To be filled on execution
                            estimatedPrice: '0',
                            status: 'proposed',
                            driftDelta: order.drift,
                            metadata: {
                                assetType: order.assetType,
                                priority: order.priority,
                                targetWeight: targetWeights[order.assetType]
                            }
                        });
                    }
                });
            }

            return {
                drift: driftDelta,
                actualWeights: actual.weights,
                targetWeights,
                orders,
                status: orders.length > 0 ? 'rebalance_required' : 'stable'
            };
        } catch (error) {
            logError(`[Rebalance Engine] Proposal generation failed:`, error);
            throw error;
        }
    }
}

export default new RebalanceEngine();
