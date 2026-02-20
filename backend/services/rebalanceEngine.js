import db from '../config/db.js';
import { autoReinvestConfigs, vaults, investments, vaultBalances } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Rebalance Engine (L3)
 * Advanced portfolio-drift calculation to determine the most "Alpha-positive" destination for new cash
 */
class RebalanceEngine {
    /**
     * Calculate current portfolio drift from target allocation
     */
    async calculatePortfolioDrift(userId, vaultId) {
        const config = await db.query.autoReinvestConfigs.findFirst({
            where: and(
                eq(autoReinvestConfigs.userId, userId),
                eq(autoReinvestConfigs.vaultId, vaultId)
            )
        });

        if (!config || !config.targetAllocation) {
            return { drift: {}, maxDrift: 0, needsRebalance: false };
        }

        // Get current vault holdings
        const holdings = await this.getVaultHoldings(vaultId);
        const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

        if (totalValue === 0) {
            return { drift: {}, maxDrift: 0, needsRebalance: false };
        }

        // Calculate drift for each asset class
        const targetAllocation = config.targetAllocation;
        const drift = {};
        let maxDrift = 0;

        for (const [assetClass, targetWeight] of Object.entries(targetAllocation)) {
            const currentValue = holdings
                .filter(h => h.assetClass === assetClass)
                .reduce((sum, h) => sum + h.value, 0);

            const currentWeight = currentValue / totalValue;
            const driftAmount = currentWeight - targetWeight;

            drift[assetClass] = {
                target: targetWeight,
                current: currentWeight,
                drift: driftAmount,
                driftPercent: (driftAmount / targetWeight) * 100
            };

            maxDrift = Math.max(maxDrift, Math.abs(driftAmount));
        }

        const rebalanceThreshold = parseFloat(config.rebalanceThreshold);
        const needsRebalance = maxDrift > rebalanceThreshold;

        return {
            drift,
            maxDrift,
            needsRebalance,
            totalValue,
            config
        };
    }

    /**
     * Determine optimal destination for new cash based on drift
     */
    async determineOptimalDestination(userId, vaultId, cashAmount) {
        const driftAnalysis = await this.calculatePortfolioDrift(userId, vaultId);

        if (!driftAnalysis.needsRebalance) {
            return {
                action: 'HOLD',
                reason: 'Portfolio within rebalance threshold',
                recommendations: []
            };
        }

        // Find most underweight asset class
        const recommendations = [];
        for (const [assetClass, metrics] of Object.entries(driftAnalysis.drift)) {
            if (metrics.drift < 0) { // Underweight
                const targetValue = driftAnalysis.totalValue * metrics.target;
                const currentValue = driftAnalysis.totalValue * metrics.current;
                const shortfall = targetValue - currentValue;

                recommendations.push({
                    assetClass,
                    currentWeight: metrics.current,
                    targetWeight: metrics.target,
                    shortfall,
                    suggestedAllocation: Math.min(cashAmount, shortfall),
                    priority: Math.abs(metrics.drift)
                });
            }
        }

        // Sort by priority (most underweight first)
        recommendations.sort((a, b) => b.priority - a.priority);

        return {
            action: 'REBALANCE',
            reason: `Max drift: ${(driftAnalysis.maxDrift * 100).toFixed(2)}%`,
            recommendations,
            totalCash: cashAmount
        };
    }

    /**
     * Execute automatic rebalance
     */
    async executeRebalance(userId, vaultId, cashAmount) {
        try {
            const destination = await this.determineOptimalDestination(userId, vaultId, cashAmount);

            if (destination.action === 'HOLD') {
                return { success: false, reason: destination.reason };
            }

            const trades = [];
            let remainingCash = cashAmount;

            for (const rec of destination.recommendations) {
                if (remainingCash <= 0) break;

                const allocationAmount = Math.min(rec.suggestedAllocation, remainingCash);

                // In production, this would execute actual trades
                trades.push({
                    assetClass: rec.assetClass,
                    amount: allocationAmount,
                    action: 'BUY'
                });

                remainingCash -= allocationAmount;
            }

            // Update last rebalance timestamp
            await db.update(autoReinvestConfigs)
                .set({ lastRebalanceAt: new Date() })
                .where(and(
                    eq(autoReinvestConfigs.userId, userId),
                    eq(autoReinvestConfigs.vaultId, vaultId)
                ));

            logInfo(`[Rebalance Engine] Executed rebalance for vault ${vaultId}: ${trades.length} trades`);

            return {
                success: true,
                trades,
                cashDeployed: cashAmount - remainingCash,
                cashRemaining: remainingCash
            };
        } catch (error) {
            logError('[Rebalance Engine] Rebalance execution failed:', error);
            throw error;
        }
    }

    /**
     * Get vault holdings grouped by asset class
     */
    async getVaultHoldings(vaultId) {
        // Mock implementation - in production, aggregate from investments table
        const vaultInvestments = await db.query.investments.findMany({
            where: eq(investments.vaultId, vaultId)
        });

        return vaultInvestments.map(inv => ({
            symbol: inv.symbol,
            assetClass: this.classifyAsset(inv.type),
            value: parseFloat(inv.marketValue || '0'),
            quantity: parseFloat(inv.quantity || '0')
        }));
    }

    /**
     * Classify investment type to asset class
     */
    classifyAsset(type) {
        const mapping = {
            'stock': 'equity',
            'etf': 'equity',
            'bond': 'bonds',
            'mutual_fund': 'equity',
            'crypto': 'alternative',
            'commodity': 'alternative',
            'real_estate': 'real_estate',
            'cash': 'cash'
        };

        return mapping[type] || 'other';
    }

    /**
     * Calculate expected alpha from rebalancing
     */
    async calculateRebalanceAlpha(userId, vaultId, cashAmount) {
        const destination = await this.determineOptimalDestination(userId, vaultId, cashAmount);

        if (destination.action === 'HOLD') {
            return { alpha: 0, reason: 'No rebalance needed' };
        }

        // Simplified alpha calculation
        // In production, use historical returns and covariance matrices
        const expectedReturns = {
            'equity': 0.08,
            'bonds': 0.04,
            'cash': 0.02,
            'alternative': 0.10,
            'real_estate': 0.06
        };

        let weightedAlpha = 0;
        for (const rec of destination.recommendations) {
            const expectedReturn = expectedReturns[rec.assetClass] || 0.05;
            const weight = rec.suggestedAllocation / cashAmount;
            weightedAlpha += expectedReturn * weight;
        }

        // Alpha is the excess return vs just holding cash
        const cashReturn = expectedReturns['cash'];
        const alpha = weightedAlpha - cashReturn;

        return {
            alpha: parseFloat((alpha * 100).toFixed(2)),
            expectedReturn: parseFloat((weightedAlpha * 100).toFixed(2)),
            cashDragCost: parseFloat((cashReturn * 100).toFixed(2)),
            recommendations: destination.recommendations
        };
    }
}

export default new RebalanceEngine();
