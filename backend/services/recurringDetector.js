import db from '../config/db.js';
import { expenses, recurringTransactions } from '../db/schema.js';
import { eq, and, gte, desc, sql } from 'drizzle-orm';

/**
 * Recurring Detector Service
 * Automatically detects recurring transaction patterns
 */
class RecurringDetector {
    constructor() {
        this.MIN_OCCURRENCES = 3;
        this.AMOUNT_TOLERANCE = 0.05; // 5% variance allowed
        this.DATE_TOLERANCE_DAYS = 3;
    }

    /**
     * Detect recurring transactions for a user
     */
    async detectRecurringTransactions(userId) {
        try {
            console.log(`🔍 Detecting recurring transactions for user ${userId}...`);

            // Get last 12 months of expenses
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 12);

            const userExpenses = await db.select()
                .from(expenses)
                .where(
                    and(
                        eq(expenses.userId, userId),
                        gte(expenses.date, startDate)
                    )
                )
                .orderBy(desc(expenses.date));

            if (userExpenses.length < this.MIN_OCCURRENCES) {
                return { detected: 0, patterns: [] };
            }

            // Group by merchant/description
            const groupedExpenses = this.groupExpensesByMerchant(userExpenses);

            // Analyze each group for recurring patterns
            const detectedPatterns = [];
            for (const [merchant, transactions] of Object.entries(groupedExpenses)) {
                const pattern = this.analyzePattern(transactions);
                if (pattern) {
                    detectedPatterns.push({
                        merchant,
                        ...pattern
                    });
                }
            }

            // Save detected patterns
            const saved = await this.saveDetectedPatterns(userId, detectedPatterns);

            console.log(`✅ Detected ${saved.length} recurring patterns`);
            return { detected: saved.length, patterns: saved };
        } catch (error) {
            console.error('Failed to detect recurring transactions:', error);
            throw error;
        }
    }

    /**
     * Group expenses by merchant name
     */
    groupExpensesByMerchant(expenses) {
        const groups = {};

        for (const expense of expenses) {
            const key = this.normalizeMerchantName(expense.description);
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(expense);
        }

        return groups;
    }

    /**
     * Normalize merchant name for grouping
     */
    normalizeMerchantName(description) {
        if (!description) return 'Unknown';

        return description
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 50);
    }

    /**
     * Analyze transaction pattern
     */
    analyzePattern(transactions) {
        if (transactions.length < this.MIN_OCCURRENCES) {
            return null;
        }

        // Sort by date
        transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Check amount consistency
        const amounts = transactions.map(t => parseFloat(t.amount));
        const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
        const variance = this.calculateVariance(amounts, avgAmount);

        if (variance > this.AMOUNT_TOLERANCE) {
            return null; // Too much variance
        }

        // Detect frequency
        const frequency = this.detectFrequency(transactions);
        if (!frequency) {
            return null;
        }

        // Calculate next due date
        const lastDate = new Date(transactions[transactions.length - 1].date);
        const nextDueDate = this.calculateNextDueDate(lastDate, frequency);

        return {
            amount: avgAmount,
            frequency,
            nextDueDate,
            occurrenceCount: transactions.length,
            averageAmount: avgAmount,
            varianceAmount: variance,
            confidence: this.calculateConfidence(transactions, variance),
            categoryId: transactions[0].categoryId,
            transactions
        };
    }

    /**
     * Calculate variance
     */
    calculateVariance(amounts, average) {
        const squaredDiffs = amounts.map(amt => Math.pow(amt - average, 2));
        const variance = Math.sqrt(squaredDiffs.reduce((sum, diff) => sum + diff, 0) / amounts.length);
        return variance / average; // Coefficient of variation
    }

    /**
     * Detect transaction frequency
     */
    detectFrequency(transactions) {
        if (transactions.length < 2) return null;

        const intervals = [];
        for (let i = 1; i < transactions.length; i++) {
            const days = Math.round(
                (new Date(transactions[i].date) - new Date(transactions[i - 1].date)) / (1000 * 60 * 60 * 24)
            );
            intervals.push(days);
        }

        const avgInterval = intervals.reduce((sum, days) => sum + days, 0) / intervals.length;

        // Classify frequency
        if (Math.abs(avgInterval - 7) <= this.DATE_TOLERANCE_DAYS) return 'weekly';
        if (Math.abs(avgInterval - 14) <= this.DATE_TOLERANCE_DAYS) return 'biweekly';
        if (Math.abs(avgInterval - 30) <= this.DATE_TOLERANCE_DAYS) return 'monthly';
        if (Math.abs(avgInterval - 90) <= this.DATE_TOLERANCE_DAYS * 2) return 'quarterly';
        if (Math.abs(avgInterval - 365) <= this.DATE_TOLERANCE_DAYS * 3) return 'yearly';

        return null; // No clear pattern
    }

    /**
     * Calculate next due date based on frequency
     */
    calculateNextDueDate(lastDate, frequency) {
        const next = new Date(lastDate);

        switch (frequency) {
            case 'weekly':
                next.setDate(next.getDate() + 7);
                break;
            case 'biweekly':
                next.setDate(next.getDate() + 14);
                break;
            case 'monthly':
                next.setMonth(next.getMonth() + 1);
                break;
            case 'quarterly':
                next.setMonth(next.getMonth() + 3);
                break;
            case 'yearly':
                next.setFullYear(next.getFullYear() + 1);
                break;
        }

        return next;
    }

    /**
     * Calculate confidence score
     */
    calculateConfidence(transactions, variance) {
        let confidence = 0.5;

        // More occurrences = higher confidence
        if (transactions.length >= 12) confidence += 0.3;
        else if (transactions.length >= 6) confidence += 0.2;
        else confidence += 0.1;

        // Lower variance = higher confidence
        if (variance < 0.02) confidence += 0.2;
        else if (variance < 0.05) confidence += 0.1;

        return Math.min(0.95, confidence);
    }

    /**
     * Save detected patterns to database
     */
    async saveDetectedPatterns(userId, patterns) {
        const saved = [];

        for (const pattern of patterns) {
            try {
                // Check if already exists
                const existing = await db.select()
                    .from(recurringTransactions)
                    .where(
                        and(
                            eq(recurringTransactions.userId, userId),
                            eq(recurringTransactions.name, pattern.merchant)
                        )
                    )
                    .limit(1);

                if (existing.length > 0) {
                    // Update existing
                    const [updated] = await db.update(recurringTransactions)
                        .set({
                            amount: pattern.amount.toString(),
                            frequency: pattern.frequency,
                            nextDueDate: pattern.nextDueDate,
                            occurrenceCount: pattern.occurrenceCount,
                            averageAmount: pattern.averageAmount.toString(),
                            varianceAmount: pattern.varianceAmount,
                            confidence: pattern.confidence,
                            updatedAt: new Date()
                        })
                        .where(eq(recurringTransactions.id, existing[0].id))
                        .returning();

                    saved.push(updated);
                } else {
                    // Create new
                    const [created] = await db.insert(recurringTransactions)
                        .values({
                            userId,
                            categoryId: pattern.categoryId,
                            name: pattern.merchant,
                            merchantName: pattern.merchant,
                            amount: pattern.amount.toString(),
                            frequency: pattern.frequency,
                            nextDueDate: pattern.nextDueDate,
                            occurrenceCount: pattern.occurrenceCount,
                            averageAmount: pattern.averageAmount.toString(),
                            varianceAmount: pattern.varianceAmount,
                            confidence: pattern.confidence,
                            detectionMethod: 'pattern'
                        })
                        .returning();

                    saved.push(created);
                }
            } catch (error) {
                console.error(`Failed to save pattern for ${pattern.merchant}:`, error);
            }
        }

        return saved;
    }

    /**
     * Get user's recurring transactions
     */
    async getUserRecurringTransactions(userId, status = 'active') {
        return await db.select()
            .from(recurringTransactions)
            .where(
                and(
                    eq(recurringTransactions.userId, userId),
                    eq(recurringTransactions.status, status)
                )
            )
            .orderBy(desc(recurringTransactions.nextDueDate));
    }

    /**
     * Update recurring transaction
     */
    async updateRecurringTransaction(id, updates) {
        const [updated] = await db.update(recurringTransactions)
            .set({
                ...updates,
                updatedAt: new Date()
            })
            .where(eq(recurringTransactions.id, id))
            .returning();

        return updated;
    }
}

export default new RecurringDetector();
