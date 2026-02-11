import db from '../config/db.js';
import { expenses, subscriptions } from '../db/schema.js';
import { eq, and, gte, desc, sql } from 'drizzle-orm';

class SubscriptionDetector {
    constructor() {
        // Known subscription patterns
        this.patterns = {
            streaming: ['netflix', 'prime video', 'disney', 'hotstar', 'zee5', 'sonyliv', 'spotify', 'apple music', 'youtube premium'],
            software: ['adobe', 'microsoft 365', 'office 365', 'github', 'jetbrains', 'canva', 'grammarly', 'notion'],
            fitness: ['cult.fit', 'healthifyme', 'fitpass', 'gold\'s gym', 'fitness first'],
            news: ['times of india', 'hindu', 'indian express', 'bloomberg', 'economist'],
            cloud: ['aws', 'google cloud', 'azure', 'dropbox', 'icloud'],
            gaming: ['playstation', 'xbox', 'nintendo', 'steam', 'epic games'],
            food: ['zomato pro', 'swiggy one', 'dineout'],
            education: ['coursera', 'udemy', 'skillshare', 'linkedin learning', 'duolingo'],
        };
    }

    /**
     * Detect potential subscriptions from expense patterns
     * @param {string} userId - User ID
     * @returns {Promise<Array>} Detected subscriptions
     */
    async detectFromExpenses(userId) {
        try {
            // Get expenses from last 6 months
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

            const userExpenses = await db
                .select()
                .from(expenses)
                .where(and(eq(expenses.userId, userId), gte(expenses.date, sixMonthsAgo)))
                .orderBy(desc(expenses.date));

            // Group expenses by description similarity
            const expenseGroups = this.groupSimilarExpenses(userExpenses);

            // Detect recurring patterns
            const detectedSubscriptions = [];

            for (const group of expenseGroups) {
                if (group.expenses.length >= 2) {
                    const pattern = this.analyzeRecurringPattern(group.expenses);

                    if (pattern.isRecurring && pattern.confidence >= 60) {
                        // Check if already tracked
                        const existing = await db
                            .select()
                            .from(subscriptions)
                            .where(
                                and(
                                    eq(subscriptions.userId, userId),
                                    sql`LOWER(${subscriptions.name}) = LOWER(${group.name})`
                                )
                            );

                        if (existing.length === 0) {
                            detectedSubscriptions.push({
                                name: group.name,
                                amount: pattern.averageAmount,
                                billingCycle: pattern.cycle,
                                confidence: pattern.confidence,
                                category: this.categorizeSubscription(group.name),
                                linkedExpenseIds: group.expenses.map(e => e.id),
                                nextRenewalDate: pattern.nextRenewalDate,
                            });
                        }
                    }
                }
            }

            return detectedSubscriptions;
        } catch (error) {
            console.error('Subscription detection error:', error);
            return [];
        }
    }

    /**
     * Group similar expenses together
     */
    groupSimilarExpenses(expenses) {
        const groups = {};

        for (const expense of expenses) {
            const normalizedDesc = this.normalizeDescription(expense.description);

            if (!groups[normalizedDesc]) {
                groups[normalizedDesc] = {
                    name: expense.description,
                    expenses: [],
                };
            }

            groups[normalizedDesc].expenses.push(expense);
        }

        return Object.values(groups);
    }

    /**
     * Normalize description for grouping
     */
    normalizeDescription(description) {
        return description
            .toLowerCase()
            .replace(/[0-9]/g, '') // Remove numbers
            .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/gi, '') // Remove months
            .replace(/\b(subscription|payment|renewal|monthly|yearly)\b/gi, '') // Remove common words
            .trim();
    }

    /**
     * Analyze if expenses form a recurring pattern
     */
    analyzeRecurringPattern(expenses) {
        if (expenses.length < 2) {
            return { isRecurring: false, confidence: 0 };
        }

        // Sort by date
        expenses.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Calculate intervals between expenses
        const intervals = [];
        for (let i = 1; i < expenses.length; i++) {
            const days = Math.round(
                (new Date(expenses[i].date) - new Date(expenses[i - 1].date)) / (1000 * 60 * 60 * 24)
            );
            intervals.push(days);
        }

        // Detect cycle
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
        const stdDev = Math.sqrt(variance);

        let cycle = 'monthly';
        let expectedInterval = 30;

        if (avgInterval >= 350 && avgInterval <= 380) {
            cycle = 'yearly';
            expectedInterval = 365;
        } else if (avgInterval >= 85 && avgInterval <= 95) {
            cycle = 'quarterly';
            expectedInterval = 90;
        } else if (avgInterval >= 25 && avgInterval <= 35) {
            cycle = 'monthly';
            expectedInterval = 30;
        } else if (avgInterval >= 12 && avgInterval <= 16) {
            cycle = 'biweekly';
            expectedInterval = 14;
        } else if (avgInterval >= 5 && avgInterval <= 9) {
            cycle = 'weekly';
            expectedInterval = 7;
        }

        // Calculate confidence based on consistency
        const consistency = 1 - (stdDev / expectedInterval);
        const confidence = Math.max(0, Math.min(100, consistency * 100));

        // Calculate average amount
        const amounts = expenses.map(e => parseFloat(e.amount));
        const averageAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const amountVariance = amounts.reduce((sum, val) => sum + Math.pow(val - averageAmount, 2), 0) / amounts.length;
        const amountConsistency = 1 - (Math.sqrt(amountVariance) / averageAmount);

        // Adjust confidence based on amount consistency
        const finalConfidence = (confidence * 0.7) + (amountConsistency * 100 * 0.3);

        // Calculate next renewal date
        const lastExpense = expenses[expenses.length - 1];
        const nextRenewalDate = new Date(lastExpense.date);
        nextRenewalDate.setDate(nextRenewalDate.getDate() + Math.round(avgInterval));

        return {
            isRecurring: finalConfidence >= 60,
            confidence: Math.round(finalConfidence),
            cycle,
            averageAmount: averageAmount.toFixed(2),
            nextRenewalDate,
            intervalDays: Math.round(avgInterval),
        };
    }

    /**
     * Categorize subscription based on name
     */
    categorizeSubscription(name) {
        const lowerName = name.toLowerCase();

        for (const [category, keywords] of Object.entries(this.patterns)) {
            for (const keyword of keywords) {
                if (lowerName.includes(keyword.toLowerCase())) {
                    return category;
                }
            }
        }

        return 'other';
    }

    /**
     * Check if an expense matches a known subscription
     * @param {Object} expense - Expense object
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} Matched subscription or null
     */
    async matchExpenseToSubscription(expense, userId) {
        try {
            const userSubscriptions = await db
                .select()
                .from(subscriptions)
                .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, 'active')));

            for (const sub of userSubscriptions) {
                const similarity = this.calculateSimilarity(
                    expense.description.toLowerCase(),
                    sub.name.toLowerCase()
                );

                const amountMatch = Math.abs(parseFloat(expense.amount) - parseFloat(sub.amount)) < 1;

                if (similarity > 0.7 || amountMatch) {
                    return sub;
                }
            }

            return null;
        } catch (error) {
            console.error('Expense matching error:', error);
            return null;
        }
    }

    /**
     * Calculate string similarity (Levenshtein distance)
     */
    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;

        if (longer.length === 0) return 1.0;

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Levenshtein distance algorithm
     */
    levenshteinDistance(str1, str2) {
        const matrix = [];

        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[str2.length][str1.length];
    }
}

export default new SubscriptionDetector();
