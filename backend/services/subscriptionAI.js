import geminiService from './geminiService.js';
import db from '../config/db.js';
import { subscriptions, subscriptionUsage, cancellationSuggestions } from '../db/schema.js';
import { eq, and, desc, gte } from 'drizzle-orm';

class SubscriptionAI {
    /**
     * Analyze subscription usage and generate cancellation suggestions
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Cancellation suggestions
     */
    async analyzeSubscriptions(userId) {
        try {
            const userSubscriptions = await db.query.subscriptions.findMany({
                where: eq(subscriptions.userId, userId),
                with: {
                    usage: {
                        orderBy: desc(subscriptionUsage.month),
                        limit: 6,
                    },
                    suggestions: {
                        where: eq(cancellationSuggestions.status, 'pending'),
                    },
                },
            });

            const suggestions = [];

            for (const sub of userSubscriptions) {
                // Skip if already has pending suggestion
                if (sub.suggestions && sub.suggestions.length > 0) {
                    continue;
                }

                // Analyze usage patterns
                const usageAnalysis = this.analyzeUsagePattern(sub.usage);

                // Check for unused subscriptions
                if (usageAnalysis.isUnused) {
                    const aiInsights = await this.generateAIInsights(sub, usageAnalysis, 'unused');
                    suggestions.push({
                        subscriptionId: sub.id,
                        userId,
                        suggestionType: 'unused',
                        severity: 'high',
                        reason: `Not used in the last ${usageAnalysis.unusedMonths} months`,
                        potentialSavings: this.calculatePotentialSavings(sub),
                        aiAnalysis: aiInsights,
                        confidence: usageAnalysis.confidence,
                    });
                }

                // Check for low usage
                else if (usageAnalysis.isLowUsage) {
                    const aiInsights = await this.generateAIInsights(sub, usageAnalysis, 'low_usage');
                    suggestions.push({
                        subscriptionId: sub.id,
                        userId,
                        suggestionType: 'unused',
                        severity: 'medium',
                        reason: `Low usage: Only used ${usageAnalysis.averageUsage} times per month`,
                        potentialSavings: this.calculatePotentialSavings(sub),
                        aiAnalysis: aiInsights,
                        confidence: usageAnalysis.confidence,
                    });
                }
            }

            // Check for duplicate subscriptions
            const duplicates = this.findDuplicateSubscriptions(userSubscriptions);
            for (const duplicate of duplicates) {
                const aiInsights = await this.generateAIInsights(duplicate.sub, {}, 'duplicate');
                suggestions.push({
                    subscriptionId: duplicate.sub.id,
                    userId,
                    suggestionType: 'duplicate',
                    severity: 'medium',
                    reason: `Similar to ${duplicate.similarTo.name}`,
                    potentialSavings: parseFloat(duplicate.sub.amount),
                    aiAnalysis: aiInsights,
                    confidence: 85,
                });
            }

            // Check for expensive subscriptions
            const expensive = this.findExpensiveSubscriptions(userSubscriptions);
            for (const exp of expensive) {
                const aiInsights = await this.generateAIInsights(exp, {}, 'expensive');
                suggestions.push({
                    subscriptionId: exp.id,
                    userId,
                    suggestionType: 'expensive',
                    severity: 'low',
                    reason: `High cost: ₹${exp.amount} per ${exp.billingCycle}`,
                    potentialSavings: parseFloat(exp.amount) * 0.3, // Potential 30% savings with alternatives
                    aiAnalysis: aiInsights,
                    confidence: 70,
                });
            }

            return suggestions;
        } catch (error) {
            console.error('Subscription analysis error:', error);
            return [];
        }
    }

    /**
     * Analyze usage pattern
     */
    analyzeUsagePattern(usageRecords) {
        if (!usageRecords || usageRecords.length === 0) {
            return {
                isUnused: true,
                unusedMonths: 6,
                confidence: 95,
            };
        }

        const recentUsage = usageRecords.slice(0, 3);
        const totalUsage = recentUsage.reduce((sum, record) => sum + (record.usageCount || 0), 0);
        const averageUsage = totalUsage / recentUsage.length;

        const unusedMonths = recentUsage.filter(r => r.usageCount === 0).length;

        return {
            isUnused: unusedMonths >= 3,
            isLowUsage: averageUsage < 2 && unusedMonths < 3,
            unusedMonths,
            averageUsage: averageUsage.toFixed(1),
            confidence: Math.min(95, 60 + (unusedMonths * 10)),
        };
    }

    /**
     * Find duplicate subscriptions
     */
    findDuplicateSubscriptions(subscriptions) {
        const duplicates = [];
        const categories = {};

        // Group by category
        for (const sub of subscriptions) {
            if (!categories[sub.category]) {
                categories[sub.category] = [];
            }
            categories[sub.category].push(sub);
        }

        // Find duplicates within same category
        for (const [category, subs] of Object.entries(categories)) {
            if (subs.length > 1 && category !== 'other') {
                // Keep the cheaper one, suggest cancelling others
                subs.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
                for (let i = 1; i < subs.length; i++) {
                    duplicates.push({
                        sub: subs[i],
                        similarTo: subs[0],
                    });
                }
            }
        }

        return duplicates;
    }

    /**
     * Find expensive subscriptions
     */
    findExpensiveSubscriptions(subscriptions) {
        const amounts = subscriptions.map(s => parseFloat(s.amount));
        const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const threshold = avgAmount * 2;

        return subscriptions.filter(s => parseFloat(s.amount) > threshold);
    }

    /**
     * Calculate potential savings
     */
    calculatePotentialSavings(subscription) {
        const monthlyAmount = parseFloat(subscription.amount);

        if (subscription.billingCycle === 'yearly') {
            return monthlyAmount;
        } else if (subscription.billingCycle === 'quarterly') {
            return monthlyAmount * 3;
        } else if (subscription.billingCycle === 'monthly') {
            return monthlyAmount * 12;
        }

        return monthlyAmount;
    }

    /**
     * Generate AI insights using Gemini
     */
    async generateAIInsights(subscription, usageData, suggestionType) {
        try {
            let prompt = '';

            if (suggestionType === 'unused') {
                prompt = `Analyze this unused subscription:
        
Name: ${subscription.name}
Category: ${subscription.category}
Cost: ₹${subscription.amount} per ${subscription.billingCycle}
Unused for: ${usageData.unusedMonths} months
Average usage: ${usageData.averageUsage || 0} times/month

Provide:
1. Why the user might not be using it
2. Alternatives (free or cheaper)
3. Recommendation (cancel, pause, or keep)
4. Potential annual savings

Keep it under 150 words and be actionable.`;
            } else if (suggestionType === 'duplicate') {
                prompt = `Analyze this potential duplicate subscription:
        
Name: ${subscription.name}
Category: ${subscription.category}
Cost: ₹${subscription.amount} per ${subscription.billingCycle}

The user has multiple ${subscription.category} subscriptions.

Provide:
1. Why having multiple is wasteful
2. Which one to keep
3. How to consolidate
4. Potential savings

Keep it under 150 words.`;
            } else if (suggestionType === 'expensive') {
                prompt = `Analyze this expensive subscription:
        
Name: ${subscription.name}
Category: ${subscription.category}
Cost: ₹${subscription.amount} per ${subscription.billingCycle}

This is significantly more expensive than the user's other subscriptions.

Provide:
1. Cheaper alternatives
2. Ways to reduce cost (family plan, annual billing, etc.)
3. Whether it's worth the price
4. Potential savings

Keep it under 150 words.`;
            } else {
                prompt = `Analyze this subscription:
        
Name: ${subscription.name}
Category: ${subscription.category}
Cost: ₹${subscription.amount} per ${subscription.billingCycle}

Provide optimization suggestions in under 150 words.`;
            }

            const insights = await geminiService.generateInsights(prompt);

            return {
                recommendation: insights,
                alternatives: this.suggestAlternatives(subscription),
                estimatedSavings: this.calculatePotentialSavings(subscription),
            };
        } catch (error) {
            console.error('AI insights generation error:', error);
            return {
                recommendation: 'Unable to generate AI insights at this time.',
                alternatives: [],
                estimatedSavings: 0,
            };
        }
    }

    /**
     * Suggest alternatives based on category
     */
    suggestAlternatives(subscription) {
        const alternatives = {
            streaming: [
                { name: 'YouTube (Free)', cost: 0 },
                { name: 'MX Player (Free)', cost: 0 },
                { name: 'Family Plan', cost: 'Shared' },
            ],
            software: [
                { name: 'Open Source Alternative', cost: 0 },
                { name: 'One-time Purchase', cost: 'Varies' },
            ],
            fitness: [
                { name: 'YouTube Fitness Channels', cost: 0 },
                { name: 'Home Workouts', cost: 0 },
            ],
            news: [
                { name: 'Free News Apps', cost: 0 },
                { name: 'Google News', cost: 0 },
            ],
        };

        return alternatives[subscription.category] || [];
    }

    /**
     * Calculate subscription health score
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Health score and breakdown
     */
    async calculateHealthScore(userId) {
        try {
            const userSubscriptions = await db.query.subscriptions.findMany({
                where: and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')),
                with: {
                    usage: {
                        orderBy: desc(subscriptionUsage.month),
                        limit: 3,
                    },
                },
            });

            if (userSubscriptions.length === 0) {
                return { score: 100, breakdown: {}, message: 'No active subscriptions' };
            }

            let score = 100;
            const breakdown = {
                totalSubscriptions: userSubscriptions.length,
                totalMonthlyCost: 0,
                unusedCount: 0,
                lowUsageCount: 0,
                duplicateCount: 0,
            };

            for (const sub of userSubscriptions) {
                const monthlyAmount = this.normalizeToMonthly(sub.amount, sub.billingCycle);
                breakdown.totalMonthlyCost += monthlyAmount;

                const usageAnalysis = this.analyzeUsagePattern(sub.usage);

                if (usageAnalysis.isUnused) {
                    breakdown.unusedCount++;
                    score -= 15;
                } else if (usageAnalysis.isLowUsage) {
                    breakdown.lowUsageCount++;
                    score -= 10;
                }
            }

            const duplicates = this.findDuplicateSubscriptions(userSubscriptions);
            breakdown.duplicateCount = duplicates.length;
            score -= duplicates.length * 10;

            score = Math.max(0, Math.min(100, score));

            let message = '';
            if (score >= 80) {
                message = 'Excellent! Your subscriptions are well-managed.';
            } else if (score >= 60) {
                message = 'Good, but there\'s room for improvement.';
            } else if (score >= 40) {
                message = 'You have some wasteful subscriptions.';
            } else {
                message = 'Critical! You\'re wasting money on unused subscriptions.';
            }

            return {
                score: Math.round(score),
                breakdown,
                message,
            };
        } catch (error) {
            console.error('Health score calculation error:', error);
            return { score: 0, breakdown: {}, message: 'Error calculating score' };
        }
    }

    /**
     * Normalize subscription cost to monthly
     */
    normalizeToMonthly(amount, cycle) {
        const amt = parseFloat(amount);
        if (cycle === 'yearly') return amt / 12;
        if (cycle === 'quarterly') return amt / 3;
        if (cycle === 'weekly') return amt * 4;
        return amt;
    }
}

export default new SubscriptionAI();
