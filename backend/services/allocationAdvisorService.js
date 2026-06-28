/**
 * Allocation Advisor Service
 * Issue #691: AI-Powered Smart Asset Allocation Advisor
 * 
 * Generates personalized asset allocation recommendations using:
 * - User risk profile and financial capacity
 * - Target-date (glide path) strategies
 * - Factor-based allocation models
 * - Rebalancing schedules
 */

import userProfilingService from './userProfilingService.js';
import assetService from './assetService.js';
import AppError from '../utils/AppError.js';

class AllocationAdvisorService {
    _clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    /**
     * Generate recommended asset allocation for user
     * Based on risk score, time horizon, and modern portfolio theory
     */
    async generateAllocationRecommendation(userId, options = {}) {
        const riskProfile = await userProfilingService.getRiskTolerance(userId);
        const capacity = await userProfilingService.getFinancialCapacity(userId);
        const timeline = await userProfilingService.estimateRetirementTimeline(userId, options.retirementAge);

        const riskScore = riskProfile.score;

        // Multi-asset allocation using modern portfolio theory
        let allocation;

        if (riskScore >= 80) {
            allocation = this._aggressiveAllocation(timeline.yearsToRetirement);
        } else if (riskScore >= 60) {
            allocation = this._moderateAggressiveAllocation(timeline.yearsToRetirement);
        } else if (riskScore >= 40) {
            allocation = this._moderateAllocation(timeline.yearsToRetirement);
        } else if (riskScore >= 20) {
            allocation = this._conservativeModerateAllocation(timeline.yearsToRetirement);
        } else {
            allocation = this._conservativeAllocation(timeline.yearsToRetirement);
        }

        // Adjust for life goals
        if (options.goals && options.goals.length > 0) {
            allocation = this._adjustForGoals(allocation, options.goals, riskScore);
        }

        // Calculate expected return and volatility
        const expectedReturn = this._calculateExpectedReturn(allocation);
        const volatility = this._calculateVolatility(allocation);

        return {
            riskScore,
            riskLevel: riskProfile.level,
            recommendedAllocation: allocation,
            expectedAnnualReturn: parseFloat(expectedReturn.toFixed(2)),
            volatility: parseFloat(volatility.toFixed(2)),
            sharpeRatio: parseFloat(((expectedReturn - 2.5) / volatility).toFixed(2)), // Assume 2.5% risk-free rate
            investmentCapacity: capacity,
            timeline,
            rationale: this._generateRationale(allocation, riskScore, timeline),
            alternatives: this._generateAlternatives(riskScore, timeline)
        };
    }

    /**
     * Generate ML-style allocation recommendation from profile features
     * Issue #695 enhancement
     */
    async generateMLAllocationRecommendation(userId, options = {}) {
        const riskProfile = await userProfilingService.getRiskTolerance(userId);
        const capacity = await userProfilingService.getFinancialCapacity(userId);
        const timeline = await userProfilingService.estimateRetirementTimeline(userId, options.retirementAge);

        const features = {
            riskScore: riskProfile.score,
            yearsToRetirement: timeline.yearsToRetirement,
            monthlySurplus: capacity.monthlySurplus,
            emergencyFundMonths: capacity.emergencyFundMonths,
            urgencyScore: timeline.urgencyScore,
            marketVolatilityRegime: options.marketVolatilityRegime || 'neutral',
            goalPriorityBias: options.goalPriorityBias || 'balanced'
        };

        let stocks =
            15 +
            (features.riskScore * 0.65) +
            (Math.min(features.yearsToRetirement, 35) * 0.7) +
            (Math.min(features.monthlySurplus, 5000) / 5000) * 10 -
            (features.urgencyScore * 0.12);

        let bonds =
            65 -
            (features.riskScore * 0.35) -
            (Math.min(features.yearsToRetirement, 35) * 0.35) +
            (features.urgencyScore * 0.1);

        let alternatives = 6 + (features.riskScore > 70 ? 2 : 0);
        let cash = 100 - (stocks + bonds + alternatives);

        if (features.marketVolatilityRegime === 'high') {
            stocks -= 6;
            bonds += 4;
            cash += 2;
        } else if (features.marketVolatilityRegime === 'low') {
            stocks += 3;
            bonds -= 2;
            cash -= 1;
        }

        if (features.goalPriorityBias === 'capital_preservation') {
            bonds += 4;
            stocks -= 3;
            cash += 1;
        } else if (features.goalPriorityBias === 'growth') {
            stocks += 4;
            bonds -= 3;
            cash -= 1;
        }

        const raw = {
            stocks: this._clamp(stocks, 5, 92),
            bonds: this._clamp(bonds, 5, 88),
            alternatives: this._clamp(alternatives, 0, 15),
            cash: this._clamp(cash, 0, 20)
        };

        this._normalizeAllocation(raw);

        return {
            model: 'feature-weighted-allocation-v1',
            modelVersion: '1.0.0',
            riskScore: riskProfile.score,
            riskLevel: riskProfile.level,
            features,
            recommendedAllocation: raw,
            expectedAnnualReturn: parseFloat(this._calculateExpectedReturn(raw).toFixed(2)),
            volatility: parseFloat(this._calculateVolatility(raw).toFixed(2)),
            confidence: this._estimateRecommendationConfidence(features),
            explanation: [
                'Allocation is generated from weighted profile features (risk, timeline, capacity, urgency).',
                `Market regime '${features.marketVolatilityRegime}' and goal bias '${features.goalPriorityBias}' were applied as tilts.`
            ]
        };
    }

    /**
     * Generate target-date glide path
     * Allocations shift from stock-heavy to bond-heavy as user ages
     */
    async generateGlidePath(userId, options = {}) {
        const riskProfile = await userProfilingService.getRiskTolerance(userId);
        const timeline = await userProfilingService.estimateRetirementTimeline(userId, options.retirementAge);

        const yearsToRetirement = timeline.yearsToRetirement;
        const riskScore = riskProfile.score;
        const glidePathLength = 30; // 30-year glide path
        const targetType = options.targetType || 'glidePathModerate'; // 'glidePath2050', 'glidePathModerate', etc.

        const path = [];

        for (let yearIdx = 0; yearIdx <= glidePathLength; yearIdx++) {
            const yearsFromNow = yearIdx;
            const yearsUntilRetirement = yearsToRetirement - yearsFromNow;
            
            // Generate allocation for this year
            let yearAllocation;
            
            if (yearsUntilRetirement > 20) {
                yearAllocation = this._aggressiveAllocation(yearsUntilRetirement);
            } else if (yearsUntilRetirement > 10) {
                yearAllocation = this._moderateAggressiveAllocation(yearsUntilRetirement);
            } else if (yearsUntilRetirement > 5) {
                yearAllocation = this._moderateAllocation(yearsUntilRetirement);
            } else {
                yearAllocation = this._conservativeAllocation(yearsUntilRetirement);
            }

            const expectedReturn = this._calculateExpectedReturn(yearAllocation);

            path.push({
                year: new Date().getFullYear() + yearsFromNow,
                yearsFromNow,
                yearsUntilRetirement: Math.max(0, yearsUntilRetirement),
                allocation: yearAllocation,
                expectedReturn: parseFloat(expectedReturn.toFixed(2))
            });
        }

        return {
            riskScore,
            riskLevel: riskProfile.level,
            glidePathType: targetType,
            currentYear: path[0],
            projectionYears: path,
            summary: {
                initialStocks: path[0].allocation.stocks,
                finalStocks: path[path.length - 1].allocation.stocks,
                equityDecline: path[0].allocation.stocks - path[path.length - 1].allocation.stocks,
                expectedInitialReturn: path[0].expectedReturn,
                expectedFinalReturn: path[path.length - 1].expectedReturn
            }
        };
    }

    /**
     * Generate dynamic glide path with regime-aware annual tilts
     * Issue #695 enhancement
     */
    async generateDynamicGlidePath(userId, options = {}) {
        const base = await this.generateGlidePath(userId, options);
        const marketRegime = options.marketVolatilityRegime || 'neutral';
        const inflationPressure = options.inflationPressure || 'moderate';

        const adjustedProjectionYears = base.projectionYears.map((node) => {
            const allocation = { ...node.allocation };
            let stockTilt = 0;
            let bondTilt = 0;
            let cashTilt = 0;

            if (marketRegime === 'high') {
                stockTilt -= 4;
                bondTilt += 3;
                cashTilt += 1;
            } else if (marketRegime === 'low') {
                stockTilt += 2;
                bondTilt -= 1;
                cashTilt -= 1;
            }

            if (inflationPressure === 'high') {
                stockTilt += 1;
                bondTilt -= 1;
            }

            allocation.stocks = this._clamp(allocation.stocks + stockTilt, 5, 95);
            allocation.bonds = this._clamp(allocation.bonds + bondTilt, 0, 90);
            allocation.cash = this._clamp(allocation.cash + cashTilt, 0, 20);
            this._normalizeAllocation(allocation);

            return {
                ...node,
                allocation,
                expectedReturn: parseFloat(this._calculateExpectedReturn(allocation).toFixed(2)),
                dynamicAdjustments: {
                    marketRegime,
                    inflationPressure,
                    stockTilt,
                    bondTilt,
                    cashTilt
                }
            };
        });

        return {
            ...base,
            glidePathType: 'dynamic',
            assumptions: {
                marketRegime,
                inflationPressure
            },
            currentYear: adjustedProjectionYears[0],
            projectionYears: adjustedProjectionYears
        };
    }

    /**
     * Compare alternative allocation strategies
     */
    async compareStrategies(userId, options = {}) {
        const riskProfile = await userProfilingService.getRiskTolerance(userId);
        const timeline = await userProfilingService.estimateRetirementTimeline(userId);

        const strategies = [];

        // Strategy 1: Conservative (bonds/safety)
        const conservative = this._conservativeAllocation(timeline.yearsToRetirement);
        strategies.push({
            name: 'Conservative',
            description: 'Capital preservation and income generation',
            allocation: conservative,
            expectedReturn: parseFloat(this._calculateExpectedReturn(conservative).toFixed(2)),
            volatility: parseFloat(this._calculateVolatility(conservative).toFixed(2)),
            riskLevel: 'Conservative',
            bestFor: ['Retirees', 'Risk-averse investors', 'Short time horizon']
        });

        // Strategy 2: Moderate (balanced)
        const moderate = this._moderateAllocation(timeline.yearsToRetirement);
        strategies.push({
            name: 'Balanced',
            description: 'Balanced growth and stability',
            allocation: moderate,
            expectedReturn: parseFloat(this._calculateExpectedReturn(moderate).toFixed(2)),
            volatility: parseFloat(this._calculateVolatility(moderate).toFixed(2)),
            riskLevel: 'Moderate',
            bestFor: ['Most investors', 'Medium time horizon', 'Moderate risk tolerance']
        });

        // Strategy 3: Growth (stocks-heavy)
        const growth = this._aggressiveAllocation(timeline.yearsToRetirement);
        strategies.push({
            name: 'Growth',
            description: 'Long-term capital appreciation',
            allocation: growth,
            expectedReturn: parseFloat(this._calculateExpectedReturn(growth).toFixed(2)),
            volatility: parseFloat(this._calculateVolatility(growth).toFixed(2)),
            riskLevel: 'Aggressive',
            bestFor: ['Young investors', 'Long time horizon', 'Growth-seeking investors']
        });

        // Strategy 4: Custom (based on user profile)
        const custom = await this.generateAllocationRecommendation(userId, options);
        strategies.push({
            name: 'Recommended (Your Profile)',
            description: `Customized based on your risk score of ${riskProfile.score}`,
            allocation: custom.recommendedAllocation,
            expectedReturn: custom.expectedAnnualReturn,
            volatility: custom.volatility,
            riskLevel: riskProfile.level,
            bestFor: ['Your financial situation', 'Your goals and timeline'],
            isRecommended: true
        });

        return {
            strategies,
            userProfile: {
                riskScore: riskProfile.score,
                riskLevel: riskProfile.level,
                yearsToRetirement: timeline.yearsToRetirement
            }
        };
    }

    /**
     * Get rebalancing recommendations
     * Identifies drift from target allocation
     */
    async getRebalancingNeeds(userId, currentAllocation, targetAllocation = null) {
        if (!targetAllocation) {
            const rec = await this.generateAllocationRecommendation(userId);
            targetAllocation = rec.recommendedAllocation;
        }

        const rebalancing = {
            assets: [],
            totalRebalanceNeeded: 0,
            actions: [],
            urgency: 'None'
        };

        for (const [asset, target] of Object.entries(targetAllocation)) {
            const current = currentAllocation[asset] || 0;
            const drift = current - target;
            const driftPercent = target > 0 ? (drift / target * 100).toFixed(2) : drift * 100;

            rebalancing.assets.push({
                asset,
                current: parseFloat(current.toFixed(2)),
                target: parseFloat(target.toFixed(2)),
                drift: parseFloat(drift.toFixed(2)),
                driftPercent: parseFloat(driftPercent)
            });

            if (Math.abs(drift) > 5) { // >5% drift
                rebalancing.actions.push({
                    asset,
                    action: drift > 0 ? 'Reduce' : 'Increase',
                    amount: parseFloat(Math.abs(drift).toFixed(2))
                });
            }

            rebalancing.totalRebalanceNeeded += Math.abs(drift);
        }

        // Set urgency
        if (rebalancing.totalRebalanceNeeded > 15) rebalancing.urgency = 'High';
        else if (rebalancing.totalRebalanceNeeded > 10) rebalancing.urgency = 'Medium';
        else if (rebalancing.totalRebalanceNeeded > 5) rebalancing.urgency = 'Low';

        return rebalancing;
    }

    /**
     * Analyze drift with threshold and trade suggestions
     * Issue #695 enhancement
     */
    async analyzeDrift(userId, currentAllocation, options = {}) {
        const threshold = Number(options.threshold || 5);
        const targetAllocation = options.targetAllocation || (await this.generateAllocationRecommendation(userId)).recommendedAllocation;

        const analysis = await this.getRebalancingNeeds(userId, currentAllocation, targetAllocation);
        const breached = analysis.assets.filter((asset) => Math.abs(asset.drift) >= threshold);

        return {
            threshold,
            needsRebalance: breached.length > 0,
            breachCount: breached.length,
            breachedAssets: breached,
            urgency: analysis.urgency,
            summary: analysis,
            recommendations: breached.map((asset) => ({
                asset: asset.asset,
                action: asset.drift > 0 ? 'trim' : 'add',
                amountPercent: parseFloat(Math.abs(asset.drift).toFixed(2))
            }))
        };
    }

    /**
     * Preview rebalance impact for user portfolio
     * Issue #695 enhancement
     */
    async generateRebalancePreview(userId, currentAllocation, options = {}) {
        const target = options.targetAllocation || (await this.generateMLAllocationRecommendation(userId, options)).recommendedAllocation;
        const drift = await this.analyzeDrift(userId, currentAllocation, {
            threshold: options.threshold || 5,
            targetAllocation: target
        });

        const currentReturn = this._calculateExpectedReturn(currentAllocation);
        const currentVolatility = this._calculateVolatility(currentAllocation);
        const targetReturn = this._calculateExpectedReturn(target);
        const targetVolatility = this._calculateVolatility(target);

        return {
            current: {
                allocation: currentAllocation,
                expectedAnnualReturn: parseFloat(currentReturn.toFixed(2)),
                volatility: parseFloat(currentVolatility.toFixed(2))
            },
            target: {
                allocation: target,
                expectedAnnualReturn: parseFloat(targetReturn.toFixed(2)),
                volatility: parseFloat(targetVolatility.toFixed(2))
            },
            delta: {
                expectedReturnChange: parseFloat((targetReturn - currentReturn).toFixed(2)),
                volatilityChange: parseFloat((targetVolatility - currentVolatility).toFixed(2))
            },
            drift,
            trades: drift.recommendations
        };
    }

    _estimateRecommendationConfidence(features) {
        let confidence = 72;

        if (features.emergencyFundMonths >= 6) confidence += 8;
        else if (features.emergencyFundMonths < 2) confidence -= 8;

        if (features.monthlySurplus > 1000) confidence += 6;
        else if (features.monthlySurplus < 200) confidence -= 6;

        if (features.yearsToRetirement > 10) confidence += 4;
        else confidence -= 3;

        if (features.marketVolatilityRegime === 'high') confidence -= 4;

        return {
            score: this._clamp(confidence, 55, 95),
            band: confidence >= 85 ? 'high' : confidence >= 70 ? 'medium' : 'moderate'
        };
    }

    // ====== PRIVATE ALLOCATION GENERATION METHODS ======

    /**
     * Conservative allocation (low volatility, capital preservation)
     */
    _conservativeAllocation(yearsToRetirement) {
        return {
            bonds: 75,
            stocks: 15,
            alternatives: 5,
            cash: 5
        };
    }

    /**
     * Conservative-Moderate allocation
     */
    _conservativeModerateAllocation(yearsToRetirement) {
        return {
            bonds: 60,
            stocks: 30,
            alternatives: 5,
            cash: 5
        };
    }

    /**
     * Moderate allocation (balanced)
     */
    _moderateAllocation(yearsToRetirement) {
        return {
            stocks: 45,
            bonds: 45,
            alternatives: 7,
            cash: 3
        };
    }

    /**
     * Moderate-Aggressive allocation
     */
    _moderateAggressiveAllocation(yearsToRetirement) {
        return {
            stocks: 65,
            bonds: 25,
            alternatives: 8,
            cash: 2
        };
    }

    /**
     * Aggressive allocation (growth-focused)
     */
    _aggressiveAllocation(yearsToRetirement) {
        return {
            stocks: 80,
            bonds: 12,
            alternatives: 6,
            cash: 2
        };
    }

    /**
     * Adjust allocation based on stated goals
     */
    _adjustForGoals(allocation, goals, riskScore) {
        const adjusted = { ...allocation };

        // Goals with near deadlines require more conservative stance
        const hasShortTermGoal = goals.some(g => g.yearsToGoal < 3);
        const hasLongTermGoal = goals.some(g => g.yearsToGoal > 10);

        if (hasShortTermGoal) {
            // Increase cash/bonds for near-term liquidity
            adjusted.cash = Math.min(20, adjusted.cash + 5);
            adjusted.stocks = Math.max(30, adjusted.stocks - 5);
        }

        if (hasLongTermGoal && riskScore > 50) {
            // Increase stocks for long-term growth
            adjusted.stocks = Math.min(90, adjusted.stocks + 3);
            adjusted.bonds = Math.max(5, adjusted.bonds - 3);
        }

        // Normalize
        this._normalizeAllocation(adjusted);
        return adjusted;
    }

    /**
     * Normalize allocation values to 100
     */
    _normalizeAllocation(allocation) {
        const total = Object.values(allocation).reduce((sum, val) => sum + val, 0);
        for (const key in allocation) {
            allocation[key] = parseFloat((allocation[key] / total * 100).toFixed(2));
        }
    }

    /**
     * Calculate expected annual return based on allocation
     * Using historical averages: stocks 10%, bonds 4%, alternatives 6%, cash 2%
     */
    _calculateExpectedReturn(allocation) {
        const returns = {
            stocks: 0.10,
            bonds: 0.04,
            alternatives: 0.06,
            cash: 0.02
        };

        let expectedReturn = 0;
        for (const [asset, weight] of Object.entries(allocation)) {
            expectedReturn += (weight / 100) * (returns[asset] || 0);
        }

        return expectedReturn * 100; // Convert to percentage
    }

    /**
     * Calculate portfolio volatility (standard deviation)
     * Using historical data approximations
     */
    _calculateVolatility(allocation) {
        const volatilities = {
            stocks: 0.15,    // 15% annualized volatility
            bonds: 0.05,     // 5% annualized volatility
            alternatives: 0.08, // 8% annualized volatility
            cash: 0.01       // 1% volatility (nearly riskless)
        };

        // Simple calculation: weighted volatility (ignores correlations)
        let volatility = 0;
        for (const [asset, weight] of Object.entries(allocation)) {
            volatility += (weight / 100) * (volatilities[asset] || 0);
        }

        return volatility * 100; // Convert to percentage
    }

    /**
     * Generate human-readable rationale for allocation
     */
    _generateRationale(allocation, riskScore, timeline) {
        const rationales = [];

        if (allocation.stocks > 65) {
            rationales.push(`Your ${allocation.stocks}% stock allocation supports long-term growth over ${timeline.yearsToRetirement} years.`);
        } else if (allocation.stocks > 40) {
            rationales.push(`Your balanced ${allocation.stocks}% stock allocation provides growth with moderate volatility.`);
        } else {
            rationales.push(`Your conservative ${allocation.stocks}% stock allocation emphasizes capital preservation.`);
        }

        if (timeline.yearsToRetirement < 5) {
            rationales.push('With retirement approaching, your allocation prioritizes stability.');
        } else if (timeline.yearsToRetirement > 20) {
            rationales.push(`With ${timeline.yearsToRetirement} years until retirement, you can weather market volatility.`);
        }

        if (allocation.alternatives > 5) {
            rationales.push('Alternative investments provide diversification and enhanced returns.');
        }

        return rationales;
    }

    /**
     * Generate alternative allocation strategies
     */
    _generateAlternatives(riskScore, timeline) {
        const alternatives = [];

        // Option 1: More conservative
        if (riskScore > 30) {
            alternatives.push({
                name: 'More Conservative',
                description: 'Reduce equity exposure for lower volatility',
                adjustments: 'Decrease stocks by 10-15%, increase bonds'
            });
        }

        // Option 2: More aggressive
        if (riskScore < 90) {
            alternatives.push({
                name: 'More Aggressive',
                description: 'Increase equity exposure for higher growth potential',
                adjustments: 'Increase stocks by 10-15%, decrease bonds'
            });
        }

        // Option 3: Sector-specific
        if (timeline.yearsToRetirement > 10) {
            alternatives.push({
                name: 'Growth-Focused Sectors',
                description: 'Concentrate in technology, healthcare, consumer discretionary',
                adjustments: 'Within stock allocation, favor growth sectors'
            });
        }

        return alternatives;
    }
}

export default new AllocationAdvisorService();
