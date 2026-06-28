// User Profiler Service - Analyze risk tolerance and create user profiles
// Issue #654: AI-Powered Smart Asset Allocation Advisor

import { db } from '../db/index.js';
import { userProfiles, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

class UserProfiler {
    constructor() {
        // Risk scoring weights
        this.riskWeights = {
            ageFactor: 0.15,
            incomeFactor: 0.20,
            toleranceFactor: 0.30,
            timeHorizonFactor: 0.20,
            goalImportanceFactor: 0.15,
        };

        // Risk tolerance levels
        this.riskLevels = {
            very_conservative: 0,
            conservative: 25,
            moderate: 50,
            aggressive: 75,
            very_aggressive: 100,
        };

        // Age group categories
        this.ageGroups = {
            '18-25': { score: 85, label: '18-25' },
            '26-35': { score: 75, label: '26-35' },
            '36-45': { score: 60, label: '36-45' },
            '46-55': { score: 45, label: '46-55' },
            '56-65': { score: 30, label: '56-65' },
            '65+': { score: 15, label: '65+' },
        };

        // Income levels
        this.incomeRanges = {
            under_50k: { score: 20, label: 'Under $50K' },
            '50k_100k': { score: 40, label: '$50K-$100K' },
            '100k_250k': { score: 60, label: '$100K-$250K' },
            '250k_500k': { score: 80, label: '$250K-$500K' },
            '500k+': { score: 100, label: '$500K+' },
        };

        // Job stability
        this.jobStabilityScores = {
            high: 60,
            medium: 40,
            low: 20,
        };

        // Employment type
        this.employmentTypeScores = {
            employed: 50,
            self_employed: 35,
            retired: 15,
            unemployed: 5,
        };
    }

    /**
     * Create or update user profile
     * @param {string} userId - User ID
     * @param {object} profileData - Profile information
     * @returns {object} Created/updated profile with risk score
     */
    async createOrUpdateProfile(userId, profileData) {
        try {
            // Validate user exists
            const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
            if (user.length === 0) {
                throw new Error('User not found');
            }

            // Calculate risk score
            const riskScore = this.calculateRiskScore(profileData);

            // Check if profile exists
            const existing = await db.select()
                .from(userProfiles)
                .where(eq(userProfiles.userId, userId))
                .limit(1);

            let profile;
            if (existing.length > 0) {
                // Update existing profile
                [profile] = await db.update(userProfiles)
                    .set({
                        riskTolerance: profileData.riskTolerance || existing[0].riskTolerance,
                        riskScore: riskScore.toString(),
                        ageGroup: profileData.ageGroup || existing[0].ageGroup,
                        incomeLevel: profileData.incomeLevel || existing[0].incomeLevel,
                        jobStability: profileData.jobStability || existing[0].jobStability,
                        employmentType: profileData.employmentType || existing[0].employmentType,
                        debtRatio: profileData.debtRatio || existing[0].debtRatio,
                        liquidityRatio: profileData.liquidityRatio || existing[0].liquidityRatio,
                        netWorth: profileData.netWorth || existing[0].netWorth,
                    })
                    .where(eq(userProfiles.userId, userId))
                    .returning();
            } else {
                // Create new profile
                [profile] = await db.insert(userProfiles).values({
                    userId,
                    riskTolerance: profileData.riskTolerance || 'moderate',
                    riskScore: riskScore.toString(),
                    ageGroup: profileData.ageGroup,
                    incomeLevel: profileData.incomeLevel,
                    jobStability: profileData.jobStability,
                    employmentType: profileData.employmentType,
                    debtRatio: profileData.debtRatio || 0,
                    liquidityRatio: profileData.liquidityRatio || 0,
                    netWorth: profileData.netWorth || 0,
                }).returning();
            }

            return {
                success: true,
                profile,
                riskScore: riskScore,
                interpretation: this.interpretRiskScore(riskScore),
            };

        } catch (error) {
            console.error('Error creating/updating profile:', error);
            throw error;
        }
    }

    /**
     * Calculate comprehensive risk score
     * Risk Score = (Age × 15%) + (Income × 20%) + (Tolerance × 30%) + 
     *              (Time Horizon × 20%) + (Goals × 15%)
     */
    calculateRiskScore(profileData) {
        try {
            let score = 0;

            // Age factor (younger = higher risk)
            if (profileData.ageGroup && this.ageGroups[profileData.ageGroup]) {
                const ageFactor = this.ageGroups[profileData.ageGroup].score;
                score += (ageFactor / 100) * 100 * this.riskWeights.ageFactor;
            }

            // Income factor
            if (profileData.incomeLevel && this.incomeRanges[profileData.incomeLevel]) {
                const incomeFactor = this.incomeRanges[profileData.incomeLevel].score;
                score += (incomeFactor / 100) * 100 * this.riskWeights.incomeFactor;
            }

            // Risk tolerance (stated preference)
            if (profileData.riskTolerance) {
                const tolerance = this.riskLevels[profileData.riskTolerance] || 50;
                score += (tolerance / 100) * 100 * this.riskWeights.toleranceFactor;
            }

            // Time horizon factor
            if (profileData.timeHorizonYears) {
                const timeScore = Math.min(profileData.timeHorizonYears / 50, 1) * 100;
                score += (timeScore / 100) * 100 * this.riskWeights.timeHorizonFactor;
            } else {
                score += 50 * this.riskWeights.timeHorizonFactor;
            }

            // Goal importance factor
            if (profileData.goalImportance) {
                const goalScore = (profileData.goalImportance / 10) * 100;
                score += (goalScore / 100) * 100 * this.riskWeights.goalImportanceFactor;
            } else {
                score += 50 * this.riskWeights.goalImportanceFactor;
            }

            // Adjust for debt ratio (higher debt = lower risk tolerance)
            if (profileData.debtRatio > 0.5) {
                score *= 0.85; // 15% reduction for high debt
            }

            // Adjust for job stability
            if (profileData.jobStability) {
                const stabilityAdjustment = this.jobStabilityScores[profileData.jobStability] / 100;
                score *= (0.5 + stabilityAdjustment); // Range: 0.55 to 1.1x
            }

            return Math.round(Math.max(0, Math.min(100, score)));

        } catch (error) {
            console.error('Error calculating risk score:', error);
            return 50; // Default moderate score
        }
    }

    /**
     * Get user profile with full interpretation
     */
    async getProfile(userId) {
        try {
            const profile = await db.select()
                .from(userProfiles)
                .where(eq(userProfiles.userId, userId))
                .limit(1);

            if (profile.length === 0) {
                return { success: false, message: 'Profile not found' };
            }

            const riskScore = parseFloat(profile[0].riskScore);

            return {
                success: true,
                profile: profile[0],
                riskScore,
                interpretation: this.interpretRiskScore(riskScore),
                recommendations: this.generateRecommendations(profile[0], riskScore),
            };

        } catch (error) {
            console.error('Error getting profile:', error);
            throw error;
        }
    }

    /**
     * Interpret risk score
     */
    interpretRiskScore(score) {
        if (score <= 20) {
            return {
                level: 'Very Conservative',
                description: 'Capital preservation is primary goal. Minimal volatility tolerance.',
                idealAllocation: 'Bonds 60%, Equities 30%, Cash 10%',
                riskProfile: 'Very Risk Averse',
            };
        } else if (score <= 40) {
            return {
                level: 'Conservative',
                description: 'Prefers stable returns with some growth potential.',
                idealAllocation: 'Bonds 50%, Equities 40%, Cash 10%',
                riskProfile: 'Risk Averse',
            };
        } else if (score <= 60) {
            return {
                level: 'Moderate',
                description: 'Balanced approach between growth and preservation.',
                idealAllocation: 'Equities 50%, Bonds 40%, Cash 10%',
                riskProfile: 'Balanced',
            };
        } else if (score <= 80) {
            return {
                level: 'Aggressive',
                description: 'Seeks growth with acceptance of moderate volatility.',
                idealAllocation: 'Equities 70%, Bonds 20%, Alternatives 10%',
                riskProfile: 'Growth Oriented',
            };
        } else {
            return {
                level: 'Very Aggressive',
                description: 'Maximum growth focus with high volatility tolerance.',
                idealAllocation: 'Equities 85%, Alternatives 10%, Bonds 5%',
                riskProfile: 'Maximum Growth',
            };
        }
    }

    /**
     * Generate personalized recommendations based on profile
     */
    generateRecommendations(profile, riskScore) {
        const recommendations = [];

        // Age-based recommendations
        const ageGroup = profile.ageGroup;
        if (ageGroup === '18-25' || ageGroup === '26-35') {
            recommendations.push({
                category: 'Time Horizon',
                recommendation: 'You have 30+ years until retirement. Consider higher equity allocation for long-term growth.',
                priority: 'high',
            });
        } else if (ageGroup === '56-65' || ageGroup === '65+') {
            recommendations.push({
                category: 'Preservation',
                recommendation: 'Begin transitioning to more conservative allocations as retirement approaches.',
                priority: 'high',
            });
        }

        // Income-based recommendations
        if (profile.incomeLevel === 'under_50k') {
            recommendations.push({
                category: 'Emergency Fund',
                recommendation: 'Maintain 6-12 months of expenses in cash. Build this before aggressive investing.',
                priority: 'critical',
            });
        }

        // Debt-based recommendations
        if (profile.debtRatio > 0.5) {
            recommendations.push({
                category: 'Debt Management',
                recommendation: `Your debt-to-assets ratio is ${(profile.debtRatio * 100).toFixed(1)}%. Consider paying down high-interest debt before aggressive investing.`,
                priority: 'high',
            });
        }

        // Liquidity recommendations
        if (profile.liquidityRatio < 0.2) {
            recommendations.push({
                category: 'Liquidity',
                recommendation: 'Increase liquid reserves to at least 20% of portfolio for flexibility and emergencies.',
                priority: 'medium',
            });
        }

        // Job stability recommendations
        if (profile.jobStability === 'low') {
            recommendations.push({
                category: 'Risk Reduction',
                recommendation: 'Given job instability, maintain higher cash reserves and favor less volatile investments.',
                priority: 'high',
            });
        }

        // Self-employed recommendations
        if (profile.employmentType === 'self_employed') {
            recommendations.push({
                category: 'Retirement Planning',
                recommendation: 'Maximize SEP IRA ($69K/year) or Solo 401(k) ($69K/year) for tax deduction.',
                priority: 'high',
            });
        }

        // Tax-advantaged account recommendations
        recommendations.push({
            category: 'Tax Efficiency',
            recommendation: 'Max out 401(k) ($23K) and IRA ($7K) for 2026 to reduce taxable income.',
            priority: 'medium',
        });

        // Diversification recommendation
        recommendations.push({
            category: 'Diversification',
            recommendation: `Diversify across ${this.recommendedAssetClasses(riskScore).length} asset classes to reduce concentration risk.`,
            priority: 'medium',
        });

        return recommendations;
    }

    /**
     * Recommend asset classes based on risk score
     */
    recommendedAssetClasses(riskScore) {
        if (riskScore <= 20) {
            return ['Bonds', 'Cash'];
        } else if (riskScore <= 40) {
            return ['Bonds', 'Cash', 'Equities'];
        } else if (riskScore <= 60) {
            return ['Equities', 'Bonds', 'Cash'];
        } else if (riskScore <= 80) {
            return ['Equities', 'Alternatives', 'Bonds'];
        } else {
            return ['Equities', 'Alternatives', 'Crypto'];
        }
    }

    /**
     * Grade investment readiness (1-10 scale)
     */
    calculateInvestmentReadiness(profile, riskScore) {
        let readiness = riskScore / 10; // Base readiness from risk score

        // Penalize low emergency fund
        if (profile.liquidityRatio < 0.1) {
            readiness -= 2;
        }

        // Penalize high debt
        if (profile.debtRatio > 0.6) {
            readiness -= 1.5;
        }

        // Reward adequate net worth
        if (profile.netWorth > 100000) {
            readiness += 1;
        }

        // Reward high job stability
        if (profile.jobStability === 'high') {
            readiness += 1;
        }

        return Math.max(1, Math.min(10, readiness));
    }

    /**
     * Compare with peer group
     */
    getProfileComparison(ageGroup, incomeLevel, riskScore) {
        const peerGroup = `${ageGroup}_${incomeLevel}`;

        // Typical allocations for same peer group
        const peerAllocations = {
            '18-25_under_50k': '50/40/10',
            '18-25_50k_100k': '70/25/5',
            '26-35_under_50k': '60/35/5',
            '26-35_50k_100k': '75/20/5',
            '26-35_100k_250k': '80/15/5',
            '36-45_50k_100k': '65/30/5',
            '36-45_100k_250k': '75/20/5',
            '46-55_100k_250k': '60/35/5',
            '56-65_100k_250k': '50/45/5',
            '65+_any': '35/60/5',
        };

        return {
            yourRiskScore: riskScore,
            peerGroup,
            peerAverage: 55, // Assume 55 for moderate group
            comparison: riskScore > 55 ? 'More aggressive than peers' : 'More conservative than peers',
        };
    }

    /**
     * Simulate profile at different time horizons
     */
    simulateProfileGrowth(profile, yearsProjected = 10) {
        const projections = [];

        // Simulate aging and profile evolution
        for (let year = 1; year <= yearsProjected; year++) {
            const ageIncrease = parseFloat(profile.ageGroup?.match(/\d+/)?.[0] || 40) + year;
            const ageGroup = this.getAgeGroupFromAge(ageIncrease);

            // Risk score decreases with age
            const projectedRiskScore = Math.max(15, parseFloat(profile.riskScore) - (year * 1.5));

            projections.push({
                year,
                projectedAge: ageIncrease,
                projectedAgeGroup: ageGroup,
                projectedRiskScore: Math.round(projectedRiskScore),
                projectedRiskLevel: this.riskLevelFromScore(projectedRiskScore).level,
            });
        }

        return projections;
    }

    /**
     * Get age group from numeric age
     */
    getAgeGroupFromAge(age) {
        if (age < 26) return '18-25';
        if (age < 36) return '26-35';
        if (age < 46) return '36-45';
        if (age < 56) return '46-55';
        if (age < 66) return '56-65';
        return '65+';
    }

    /**
     * Get risk level from score
     */
    riskLevelFromScore(score) {
        if (score <= 20) return { level: 'Very Conservative', tolerance: 'very_conservative' };
        if (score <= 40) return { level: 'Conservative', tolerance: 'conservative' };
        if (score <= 60) return { level: 'Moderate', tolerance: 'moderate' };
        if (score <= 80) return { level: 'Aggressive', tolerance: 'aggressive' };
        return { level: 'Very Aggressive', tolerance: 'very_aggressive' };
    }
}

export default new UserProfiler();
