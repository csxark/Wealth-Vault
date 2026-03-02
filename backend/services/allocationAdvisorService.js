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
