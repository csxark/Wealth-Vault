/**
 * User Profiling Service
 * Issue #691: AI-Powered Smart Asset Allocation Advisor
 * 
 * Analyzes user profile data to calculate risk score (0-100) and financial capacity.
 * Factors: age, income, goals, liabilities, time horizon, explicit risk tolerance.
 */

import db from '../config/database.js';
import { users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import AppError from '../utils/AppError.js';

class UserProfilingService {
    /**
     * Calculate comprehensive risk score (0-100) for a user
     * 0 = conservative (bonds, stable), 100 = aggressive (growth, volatile)
     * 
     * Factors considered:
     * - Age (30% weight): Younger = higher tolerance
     * - Income & Savings Capacity (25% weight): Higher income = more flexibility
     * - Financial Obligations (20% weight): Debt burden reduces tolerance
     * - Investment Timeline (15% weight): Longer horizon = more aggressive
     * - Education & Sophistication (10% weight): More knowledge = higher tolerance
     */
    async calculateRiskScore(userId) {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || user.length === 0) throw new AppError('User not found', 404);

        const profile = user[0];
        const now = new Date();
        const age = this._calculateAge(profile.dateOfBirth);
        const monthlyIncome = parseFloat(profile.monthlyIncome || 0);
        const monthlyBudget = parseFloat(profile.monthlyBudget || 0);
        const emergencyFund = parseFloat(profile.emergencyFund || 0);

        // Score components (0-100 each, then weighted)
        let scores = {};

        // 1. Age Factor (30%): ages 20-75+
        scores.age = this._scoreAge(age);

        // 2. Income & Savings Capacity (25%): income level and emergency fund
        scores.incomeCapacity = this._scoreIncomeCapacity(monthlyIncome, emergencyFund);

        // 3. Financial Obligations (20%): debt-to-income, budget constraints
        scores.obligations = this._scoreFinancialObligations(monthlyIncome, monthlyBudget);

        // 4. Investment Timeline (15%): years until retirement (estimated from age)
        const yearsToRetirement = Math.max(1, 67 - (age || 40)); // Assume retirement at 67
        scores.timeline = this._scoreTimeline(yearsToRetirement);

        // 5. Education & Financial Sophistication (10%): inferred from income range
        scores.sophistication = this._scoreSophistication(profile.incomeRange, profile.ageGroup);

        // Calculate weighted average (0-100)
        const weights = {
            age: 0.30,
            incomeCapacity: 0.25,
            obligations: 0.20,
            timeline: 0.15,
            sophistication: 0.10
        };

        let riskScore = 0;
        for (const [factor, score] of Object.entries(scores)) {
            riskScore += score * weights[factor];
        }

        return {
            riskScore: Math.round(riskScore),
            components: scores,
            weights,
            profile: {
                age,
                monthlyIncome,
                emergencyFundMonths: monthlyIncome > 0 ? (emergencyFund / monthlyIncome).toFixed(1) : 0,
                yearsToRetirement,
                incomeRange: profile.incomeRange || 'Unknown',
                ageGroup: profile.ageGroup || 'Unknown'
            }
        };
    }

    /**
     * Calculate risk tolerance based on explicit user preferences
     * Returns recommended risk level (conservative/moderate/aggressive)
     */
    async getRiskTolerance(userId) {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || user.length === 0) throw new AppError('User not found', 404);

        const riskProfile = await this.calculateRiskScore(userId);
        const score = riskProfile.riskScore;

        return {
            score,
            level: this._riskLevelFromScore(score),
            description: this._riskDescription(score),
            recommendations: this._riskRecommendations(score),
            components: riskProfile.components
        };
    }

    /**
     * Get user's financial capacity and constraints
     */
    async getFinancialCapacity(userId) {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || user.length === 0) throw new AppError('User not found', 404);

        const profile = user[0];
        const monthlyIncome = parseFloat(profile.monthlyIncome || 0);
        const monthlyBudget = parseFloat(profile.monthlyBudget || 0);
        const emergencyFund = parseFloat(profile.emergencyFund || 0);

        // Calculate key metrics
        const monthlySurplus = monthlyIncome - monthlyBudget;
        const emergencyFundMonths = monthlyIncome > 0 ? emergencyFund / monthlyIncome : 0;
        const investableCapacity = Math.max(0, monthlySurplus * 0.5); // Conservative: 50% of surplus
        const accumulatedCapacity = Math.max(0, monthlySurplus * 12); // Annual surplus available

        return {
            monthlyIncome,
            monthlyBudget,
            monthlySurplus,
            emergencyFund,
            emergencyFundMonths: parseFloat(emergencyFundMonths.toFixed(1)),
            investableCapacity: parseFloat(investableCapacity.toFixed(2)),
            accumulatedCapacity: parseFloat(accumulatedCapacity.toFixed(2)),
            capacityRating: this._rateCapacity(monthlyIncome, monthlySurplus, emergencyFundMonths),
            recommendations: this._capacityRecommendations(monthlySurplus, emergencyFundMonths)
        };
    }

    /**
     * Estimate years to retirement based on age and retirement savings goal
     */
    async estimateRetirementTimeline(userId, retirementAge = 67) {
        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || user.length === 0) throw new AppError('User not found', 404);

        const profile = user[0];
        const age = this._calculateAge(profile.dateOfBirth);
        const yearsToRetirement = Math.max(1, retirementAge - (age || 40));

        return {
            currentAge: age,
            retirementAge,
            yearsToRetirement,
            timelinePhase: this._timelinePhase(age),
            urgencyScore: this._urgencyScore(yearsToRetirement)
        };
    }

    // ====== PRIVATE HELPER METHODS ======

    /**
     * Score age factor (0-100)
     * Younger users have more time to recover, so higher risk tolerance justified
     */
    _scoreAge(age) {
        if (age < 25) return 85; // Very aggressive: 30+ years
        if (age < 35) return 80; // Aggressive: 30+ years
        if (age < 45) return 70; // Moderate-aggressive: 20+ years
        if (age < 55) return 55; // Moderate: 10-20 years
        if (age < 65) return 35; // Conservative: <10 years to retirement
        return 20; // Very conservative: at/past retirement
    }

    /**
     * Score income & savings capacity (0-100)
     */
    _scoreIncomeCapacity(monthlyIncome, emergencyFund) {
        // Normalize to score
        // High income (5000+/month): 80-90 points
        // Medium income (2000-5000/month): 60-75 points
        // Low income (<2000/month): 30-50 points
        // Strong emergency fund (6+ months): +10 points bonus
        
        let score = 30; // Base for any income
        if (monthlyIncome >= 5000) score = 85;
        else if (monthlyIncome >= 3000) score = 70;
        else if (monthlyIncome >= 2000) score = 55;
        else if (monthlyIncome >= 1000) score = 40;

        // Bonus for emergency fund
        const emergencyMonths = monthlyIncome > 0 ? emergencyFund / monthlyIncome : 0;
        if (emergencyMonths >= 6) score = Math.min(100, score + 10);
        else if (emergencyMonths >= 3) score = Math.min(100, score + 5);

        return score;
    }

    /**
     * Score financial obligations (0-100, inverse relationship)
     */
    _scoreFinancialObligations(monthlyIncome, monthlyBudget) {
        if (monthlyIncome === 0) return 20; // No income = conservative
        
        const budgetRatio = monthlyBudget / monthlyIncome;
        // budgetRatio < 0.5: flexible, score 80+ (50% surplus)
        // budgetRatio 0.5-0.7: moderate, score 50-80 (30-50% surplus)
        // budgetRatio 0.7-0.9: tight, score 20-50 (<30% surplus)
        // budgetRatio >= 0.9: constrained, score <20

        if (budgetRatio < 0.5) return 80;
        if (budgetRatio < 0.65) return 65;
        if (budgetRatio < 0.80) return 45;
        if (budgetRatio < 0.95) return 25;
        return 10;
    }

    /**
     * Score investment timeline (0-100)
     * Longer horizon = more time to weather volatility
     */
    _scoreTimeline(yearsToRetirement) {
        if (yearsToRetirement > 30) return 90; // 30+ years: aggressive
        if (yearsToRetirement > 20) return 80; // 20-30 years: moderate-aggressive
        if (yearsToRetirement > 10) return 60; // 10-20 years: moderate
        if (yearsToRetirement > 5) return 40; // 5-10 years: conservative-moderate
        return 20; // <5 years: very conservative
    }

    /**
     * Score financial sophistication (0-100)
     * Inferred from income range and age group
     */
    _scoreSophistication(incomeRange, ageGroup) {
        let score = 40; // Base

        // Income-based bonus
        if (incomeRange === 'High' || incomeRange === '$100k+') score += 20;
        else if (incomeRange === 'Medium-High' || incomeRange === '$75k-$100k') score += 10;
        else if (incomeRange === 'Medium' || incomeRange === '$50k-$75k') score += 5;

        // Age-based bonus (more experience with age)
        if (ageGroup === '50+' || ageGroup === '55-65' || ageGroup === '65+') score += 15;
        else if (ageGroup === '40-50' || ageGroup === '45-55') score += 10;

        return Math.min(100, score);
    }

    /**
     * Convert risk score to categorical level
     */
    _riskLevelFromScore(score) {
        if (score >= 80) return 'Aggressive';
        if (score >= 60) return 'Moderate-Aggressive';
        if (score >= 40) return 'Moderate';
        if (score >= 20) return 'Conservative-Moderate';
        return 'Conservative';
    }

    /**
     * Detailed risk description
     */
    _riskDescription(score) {
        const descriptions = {
            'Aggressive': 'Growth-focused portfolio with higher volatility tolerance. Suitable for long-term investors seeking capital appreciation.',
            'Moderate-Aggressive': 'Balanced growth with some downside protection. Mix of stocks, bonds, and alternatives.',
            'Moderate': 'Balanced portfolio seeking steady growth with moderate risk. Diversified across asset classes.',
            'Conservative-Moderate': 'Income-focused with limited growth. Emphasis on stability and capital preservation.',
            'Conservative': 'Capital preservation priority. Low volatility, focus on income and safety.'
        };

        const level = this._riskLevelFromScore(score);
        return descriptions[level];
    }

    /**
     * Allocation recommendations based on risk score
     */
    _riskRecommendations(score) {
        if (score >= 80) {
            return {
                stocks: { min: 70, target: 85, max: 95 },
                bonds: { min: 0, target: 10, max: 20 },
                alternatives: { min: 0, target: 5, max: 15 },
                cash: { min: 0, target: 0, max: 5 }
            };
        }
        if (score >= 60) {
            return {
                stocks: { min: 50, target: 65, max: 75 },
                bonds: { min: 15, target: 25, max: 35 },
                alternatives: { min: 0, target: 5, max: 15 },
                cash: { min: 0, target: 5, max: 10 }
            };
        }
        if (score >= 40) {
            return {
                stocks: { min: 30, target: 45, max: 55 },
                bonds: { min: 35, target: 45, max: 55 },
                alternatives: { min: 0, target: 5, max: 10 },
                cash: { min: 0, target: 5, max: 15 }
            };
        }
        if (score >= 20) {
            return {
                stocks: { min: 10, target: 25, max: 40 },
                bonds: { min: 50, target: 65, max: 75 },
                alternatives: { min: 0, target: 0, max: 5 },
                cash: { min: 5, target: 10, max: 20 }
            };
        }
        return {
            stocks: { min: 0, target: 10, max: 20 },
            bonds: { min: 60, target: 75, max: 90 },
            alternatives: { min: 0, target: 0, max: 5 },
            cash: { min: 10, target: 15, max: 30 }
        };
    }

    /**
     * Rate financial capacity
     */
    _rateCapacity(monthlyIncome, monthlySurplus, emergencyMonths) {
        if (monthlySurplus < 100) return 'Constrained';
        if (emergencyMonths < 3) return 'Limited';
        if (monthlySurplus < 500) return 'Modest';
        if (monthlySurplus < 2000) return 'Good';
        return 'Excellent';
    }

    /**
     * Capacity build recommendations
     */
    _capacityRecommendations(monthlySurplus, emergencyMonths) {
        const recs = [];
        
        if (emergencyMonths < 3) {
            recs.push('Build emergency fund to 3-6 months of expenses');
        }
        if (monthlySurplus < 500) {
            recs.push('Increase monthly surplus through budgeting or income growth');
        }
        if (monthlySurplus > 1000 && emergencyMonths >= 6) {
            recs.push('Allocate surplus to investments and retirement accounts');
        }
        
        return recs.length > 0 ? recs : ['Strong financial position - consider increasing investment targets'];
    }

    /**
     * Timeline phase naming
     */
    _timelinePhase(age) {
        if (age < 30) return 'Accumulation Phase';
        if (age < 50) return 'Growth Phase';
        if (age < 60) return 'Balance Phase';
        return 'Preservation Phase';
    }

    /**
     * Urgency score for retirement planning (0-100)
     */
    _urgencyScore(yearsToRetirement) {
        if (yearsToRetirement > 20) return 20; // Plenty of time
        if (yearsToRetirement > 10) return 50; // Moderate urgency
        if (yearsToRetirement > 5) return 75; // High urgency
        return 95; // Critical urgency
    }

    /**
     * Calculate age from DOB
     */
    _calculateAge(dateOfBirth) {
        if (!dateOfBirth) return null;
        const today = new Date();
        const birth = new Date(dateOfBirth);
        let age = today.getFullYear() - birth.getFullYear();
        const month = today.getMonth() - birth.getMonth();
        if (month < 0 || (month === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age;
    }
}

export default new UserProfilingService();
