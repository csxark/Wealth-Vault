// Allocation Recommender Service - Generate optimal asset allocations
// Issue #654: AI-Powered Smart Asset Allocation Advisor

import { db } from '../db/index.js';
import { allocationRecommendations, assetClassAllocations, userProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';

class AllocationRecommender {
    constructor() {
        // Historical return expectations (annualized)
        this.assetReturns = {
            equities: 0.09, // 9% long-term average
            bonds: 0.04, // 4% bonds
            cash: 0.045, // 4.5% money market
            alternatives: 0.07, // 7% hedge funds, REITs
            real_estate: 0.08, // 8% real estate
            commodities: 0.05, // 5% commodities
        };

        // Volatility (standard deviation)
        this.assetVolatility = {
            equities: 0.16, // High volatility
            bonds: 0.04, // Low volatility
            cash: 0.00, // No volatility
            alternatives: 0.12, // Moderate-high
            real_estate: 0.10, // Moderate
            commodities: 0.18, // High volatility
        };

        // Correlation matrix (how assets move together)
        this.correlations = {
            'equities-bonds': -0.15, // Negative = good diversification
            'equities-cash': 0,
            'equities-alternatives': 0.3,
            'equities-real_estate': 0.4,
            'equities-commodities': 0.2,
            'bonds-cash': 0.2,
            'bonds-alternatives': 0.1,
            'bonds-real_estate': 0.3,
            'bonds-commodities': -0.1,
            'cash-alternatives': 0.05,
            'cash-real_estate': 0,
            'cash-commodities': 0,
            'alternatives-real_estate': 0.4,
            'alternatives-commodities': 0.2,
            'real_estate-commodities': 0.1,
        };

        // Pre-defined allocation strategies by risk level
        this.allocationTemplates = {
            very_conservative: {
                equities: 0.20,
                bonds: 0.60,
                cash: 0.15,
                alternatives: 0.03,
                real_estate: 0.02,
                commodities: 0,
            },
            conservative: {
                equities: 0.35,
                bonds: 0.50,
                cash: 0.10,
                alternatives: 0.03,
                real_estate: 0.02,
                commodities: 0,
            },
            moderate: {
                equities: 0.50,
                bonds: 0.35,
                cash: 0.08,
                alternatives: 0.04,
                real_estate: 0.03,
                commodities: 0,
            },
            aggressive: {
                equities: 0.70,
                bonds: 0.15,
                cash: 0.05,
                alternatives: 0.05,
                real_estate: 0.04,
                commodities: 0.01,
            },
            very_aggressive: {
                equities: 0.85,
                bonds: 0.05,
                cash: 0.03,
                alternatives: 0.04,
                real_estate: 0.02,
                commodities: 0.01,
            },
        };
    }

    /**
     * Generate optimal allocation recommendation for user
     * @param {string} userId - User ID
     * @param {string} vaultId - Optional vault ID
     * @returns {object} Recommended allocation
     */
    async recommendAllocation(userId, vaultId = null) {
        try {
            // Get user profile
            const profile = await db.select()
                .from(userProfiles)
                .where(eq(userProfiles.userId, userId))
                .limit(1);

            if (profile.length === 0) {
                throw new Error('User profile not found');
            }

            const userProfile = profile[0];
            const riskTolerance = userProfile.riskTolerance;

            // Get base allocation from template
            const baseAllocation = this.allocationTemplates[riskTolerance] || this.allocationTemplates.moderate;

            // Calculate expected portfolio metrics
            const portfolioMetrics = this.calculatePortfolioMetrics(baseAllocation);

            // Optimize allocation based on current market conditions (simplified)
            const optimizedAllocation = this.optimizeAllocation(baseAllocation, portfolioMetrics);

            // Store recommendation
            const [recommendation] = await db.insert(allocationRecommendations).values({
                userId,
                vaultId,
                recommendationDate: new Date(),
                equityPercentage: (optimizedAllocation.equities * 100).toString(),
                bondPercentage: (optimizedAllocation.bonds * 100).toString(),
                cashPercentage: (optimizedAllocation.cash * 100).toString(),
                alternativesPercentage: (optimizedAllocation.alternatives * 100).toString(),
                realEstatePercentage: (optimizedAllocation.real_estate * 100).toString(),
                confidenceScore: '85',
                expectedReturn: (portfolioMetrics.expectedReturn * 100).toString(),
                expectedVolatility: (portfolioMetrics.volatility * 100).toString(),
                sharpeRatio: (portfolioMetrics.sharpeRatio * 1).toString(),
                status: 'active',
            }).returning();

            // Store asset class details
            for (const [assetClass, percentage] of Object.entries(optimizedAllocation)) {
                await db.insert(assetClassAllocations).values({
                    userId,
                    vaultId,
                    allocationId: recommendation.id,
                    assetClass: assetClass.replace('_', '_'),
                    percentage: (percentage * 100).toString(),
                });
            }

            return {
                success: true,
                recommendation: {
                    ...recommendation,
                    allocation: optimizedAllocation,
                    metrics: portfolioMetrics,
                },
                analysis: {
                    riskLevel: riskTolerance,
                    expectedAnnualReturn: (portfolioMetrics.expectedReturn * 100).toFixed(2) + '%',
                    expectedVolatility: (portfolioMetrics.volatility * 100).toFixed(2) + '%',
                    sharpeRatio: portfolioMetrics.sharpeRatio.toFixed(2),
                    key: 'values',
                },
            };

        } catch (error) {
            console.error('Error recommending allocation:', error);
            throw error;
        }
    }

    /**
     * Calculate portfolio metrics (return, volatility, Sharpe ratio)
     */
    calculatePortfolioMetrics(allocation) {
        // Expected return: weighted average of asset class returns
        let expectedReturn = 0;
        for (const [assetClass, weight] of Object.entries(allocation)) {
            const cleanAssetClass = assetClass.replace('_', '_');
            expectedReturn += weight * (this.assetReturns[cleanAssetClass] || 0.05);
        }

        // Portfolio volatility using covariance matrix
        let variance = 0;
        const assetClasses = Object.keys(allocation);

        for (let i = 0; i < assetClasses.length; i++) {
            const asset1 = assetClasses[i];
            const cleanAsset1 = asset1.replace('_', '_');
            const weight1 = allocation[asset1];
            const vol1 = this.assetVolatility[cleanAsset1] || 0.10;

            // Variance from individual asset
            variance += Math.pow(weight1 * vol1, 2);

            // Covariance terms
            for (let j = i + 1; j < assetClasses.length; j++) {
                const asset2 = assetClasses[j];
                const cleanAsset2 = asset2.replace('_', '_');
                const weight2 = allocation[asset2];
                const vol2 = this.assetVolatility[cleanAsset2] || 0.10;

                const key = `${cleanAsset1}-${cleanAsset2}`;
                const reverseKey = `${cleanAsset2}-${cleanAsset1}`;
                const correlation = this.correlations[key] || this.correlations[reverseKey] || 0.3;

                variance += 2 * weight1 * weight2 * vol1 * vol2 * correlation;
            }
        }

        const volatility = Math.sqrt(variance);

        // Sharpe ratio: (Return - Risk-Free Rate) / Volatility
        const riskFreeRate = 0.045;
        const sharpeRatio = (expectedReturn - riskFreeRate) / volatility;

        return {
            expectedReturn,
            volatility,
            sharpeRatio,
            variance,
        };
    }

    /**
     * Optimize allocation using Modern Portfolio Theory principles
     */
    optimizeAllocation(baseAllocation, metrics) {
        // Simple optimization: if Sharpe ratio is low, reduce equity allocation
        if (metrics.sharpeRatio < 0.5) {
            return {
                ...baseAllocation,
                equities: baseAllocation.equities * 0.85,
                bonds: baseAllocation.bonds * 1.1,
            };
        }

        // If volatility is too high, reduce aggressive assets
        if (metrics.volatility > 0.18) {
            return {
                ...baseAllocation,
                equities: baseAllocation.equities * 0.90,
                bonds: baseAllocation.bonds * 1.05,
                alternatives: baseAllocation.alternatives * 0.95,
            };
        }

        return baseAllocation;
    }

    /**
     * Calculate allocation needed for specific return target
     * @param {number} targetReturn - Target annual return (e.g., 0.07 for 7%)
     * @returns {object} Allocation to achieve target
     */
    calculateForReturn(targetReturn) {
        // Simple linear solver for target return
        // Assumes only equities and bonds

        // Solve: equities * 0.09 + bonds * 0.04 = targetReturn
        // And: equities + bonds = 1

        const equityReturn = this.assetReturns.equities;
        const bondReturn = this.assetReturns.bonds;

        // From algebra:
        // equities = (targetReturn - bondReturn) / (equityReturn - bondReturn)

        if (Math.abs(equityReturn - bondReturn) < 0.0001) {
            // Equal returns, just split 50/50
            return {
                equities: 0.5,
                bonds: 0.5,
                cash: 0,
                alternatives: 0,
                real_estate: 0,
                commodities: 0,
            };
        }

        const equityWeight = (targetReturn - bondReturn) / (equityReturn - bondReturn);

        // Clamp to reasonable bounds
        const clampedEquityWeight = Math.max(0, Math.min(1, equityWeight));
        const bondWeight = 1 - clampedEquityWeight;

        return {
            equities: clampedEquityWeight,
            bonds: bondWeight,
            cash: 0,
            alternatives: 0,
            real_estate: 0,
            commodities: 0,
        };
    }

    /**
     * Generate comparison report between allocations
     */
    compareAllocations(allocation1, allocation2) {
        const metrics1 = this.calculatePortfolioMetrics(allocation1);
        const metrics2 = this.calculatePortfolioMetrics(allocation2);

        const assetComparison = {};
        for (const asset of Object.keys(allocation1)) {
            assetComparison[asset] = {
                allocation1: (allocation1[asset] * 100).toFixed(1) + '%',
                allocation2: (allocation2[asset] * 100).toFixed(1) + '%',
                difference: ((allocation2[asset] - allocation1[asset]) * 100).toFixed(1) + '%',
            };
        }

        return {
            allocations: {
                'Allocation 1': allocation1,
                'Allocation 2': allocation2,
            },
            assetComparison,
            metrics: {
                'Allocation 1': metrics1,
                'Allocation 2': metrics2,
            },
            comparison: {
                returnDifference: ((metrics2.expectedReturn - metrics1.expectedReturn) * 100).toFixed(2) + '%',
                volatilityDifference: ((metrics2.volatility - metrics1.volatility) * 100).toFixed(2) + '%',
                sharpeRatioDifference: (metrics2.sharpeRatio - metrics1.sharpeRatio).toFixed(2),
                recommendation: metrics2.sharpeRatio > metrics1.sharpeRatio ? 'Allocation 2 is better' : 'Allocation 1 is better',
            },
        };
    }

    /**
     * Get allocation percentiles for different risk levels
     */
    getAllocationDistribution() {
        return {
            very_conservative: this.allocationTemplates.very_conservative,
            conservative: this.allocationTemplates.conservative,
            moderate: this.allocationTemplates.moderate,
            aggressive: this.allocationTemplates.aggressive,
            very_aggressive: this.allocationTemplates.very_aggressive,
        };
    }

    /**
     * Generate one-click rebalancing instructions
     */
    async generateRebalancingInstructions(userId, vaultId = null) {
        try {
            // Get current allocation (from investments)
            // Get recommended allocation (latest recommendation)
            // Calculate differences
            // Generate trade instructions

            const recommendations = await db.select()
                .from(allocationRecommendations)
                .where(eq(allocationRecommendations.userId, userId))
                .orderBy((table) => table.recommendationDate)
                .limit(1);

            if (recommendations.length === 0) {
                return { success: false, message: 'No recommendations found' };
            }

            const recommendation = recommendations[0];

            // Trade instructions (simplified)
            const trades = [
                {
                    action: 'BUY',
                    assetClass: 'Equities',
                    targetPercentage: parseFloat(recommendation.equityPercentage),
                    reason: 'Rebalance to target allocation',
                },
                {
                    action: 'SELL',
                    assetClass: 'Bonds',
                    targetPercentage: parseFloat(recommendation.bondPercentage),
                    reason: 'Rebalance to target allocation',
                },
            ];

            return {
                success: true,
                recommendation,
                trades,
                instructions: 'Execute trades in order. Allow 1-2 business days for settlement.',
            };

        } catch (error) {
            console.error('Error generating rebalancing instructions:', error);
            throw error;
        }
    }

    /**
     * Calculate minimum allocation to achieve goal
     */
    calculateMinimumAllocation(currentValue, targetValue, timeHorizonYears) {
        // Required annual return
        const requiredReturn = (Math.pow(targetValue / currentValue, 1 / timeHorizonYears) - 1);

        // Find allocation with that return
        return this.calculateForReturn(requiredReturn);
    }

    /**
     * Validate allocation (sums to 100%, reasonable bounds)
     */
    validateAllocation(allocation) {
        const errors = [];
        const warnings = [];
        let sum = 0;

        for (const [asset, percentage] of Object.entries(allocation)) {
            if (percentage < 0) {
                errors.push(`${asset} cannot be negative`);
            }
            if (percentage > 1) {
                errors.push(`${asset} cannot exceed 100%`);
            }
            sum += percentage;
        }

        const sumRounded = Math.round(sum * 1000) / 1000;
        if (Math.abs(sumRounded - 1) > 0.01) {
            errors.push(`Allocation must sum to 100% (currently ${(sum * 100).toFixed(1)}%)`);
        }

        // Warnings for risky allocations
        if (allocation.equities > 0.95) {
            warnings.push('Very high equity allocation - consider diversification');
        }
        if (allocation.equities < 0.10) {
            warnings.push('Very low equity allocation - may struggle to meet inflation');
        }
        if (allocation.alternatives > 0.30) {
            warnings.push('High alternatives allocation - ensure sufficient liquidity');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            sum: (sum * 100).toFixed(1) + '%',
        };
    }
}

export default new AllocationRecommender();
