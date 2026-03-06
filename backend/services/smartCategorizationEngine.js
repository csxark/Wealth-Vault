import db from '../config/db.js';
import {
    expenses,
    categories,
    categorizationRules,
    categorizationPatterns,
    categorySuggestions,
    expenseCorrections,
    merchants,
    merchantFrequencyPatterns
} from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import merchantRecognizer from './merchantRecognizer.js';
import categorizationService from './categorizationService.js';
import recurringDetector from './recurringDetector.js';

/**
 * Smart Categorization Engine
 * Orchestrates merchant recognition, rule-based categorization, and ML predictions
 * Issue #639: Smart Expense Categorization & Merchant Recognition
 */
class SmartCategorizationEngine {
    constructor() {
        this.MIN_CONFIDENCE_THRESHOLD = 0.6;
        this.HIGH_CONFIDENCE_THRESHOLD = 0.85;
        this.RULE_MATCHING_TIMEOUT = 1000; // ms
    }

    /**
     * Automatically categorize an expense using multiple strategies
     * Returns top suggestion with alternatives
     */
    async categorizeExpense(expenseId, userId) {
        try {
            // Get expense details
            const expense = await db.query.expenses.findFirst({
                where: and(
                    eq(expenses.id, expenseId),
                    eq(expenses.userId, userId)
                ),
                with: {
                    category: true
                }
            });

            if (!expense) {
                throw new Error(`Expense ${expenseId} not found`);
            }

            // Run categorization strategies in parallel
            const [
                merchantSuggestion,
                ruleSuggestion,
                patternSuggestion,
                mlSuggestion
            ] = await Promise.allSettled([
                this.getMerchantBasedSuggestion(userId, expense),
                this.getRuleBasedSuggestion(userId, expense),
                this.getPatternBasedSuggestion(userId, expense),
                this.getMLBasedSuggestion(userId, expense)
            ]);

            // Combine and rank suggestions
            const suggestions = [
                merchantSuggestion.status === 'fulfilled' ? merchantSuggestion.value : null,
                ruleSuggestion.status === 'fulfilled' ? ruleSuggestion.value : null,
                patternSuggestion.status === 'fulfilled' ? patternSuggestion.value : null,
                mlSuggestion.status === 'fulfilled' ? mlSuggestion.value : null
            ].filter(s => s !== null);

            // Find best suggestion or aggregate
            const topSuggestion = this.rankAndAggregatesuggestions(suggestions);

            if (topSuggestion) {
                // Log the suggestion
                await this.logCategorySuggestion(
                    expenseId,
                    userId,
                    topSuggestion.categoryId,
                    topSuggestion.confidence,
                    topSuggestion.source,
                    suggestions.slice(1, 3) // Store alternatives
                );

                // Update expense if high confidence
                if (topSuggestion.confidence >= this.HIGH_CONFIDENCE_THRESHOLD) {
                    await db.update(expenses)
                        .set({
                            categoryId: topSuggestion.categoryId,
                            autoCategorized: true,
                            categorizationScore: topSuggestion.confidence.toString(),
                            merchantRecognized: topSuggestion.merchantRecognized || false,
                            updatedAt: new Date()
                        })
                        .where(eq(expenses.id, expenseId));
                }
            }

            return {
                expenseId,
                topSuggestion,
                allSuggestions: suggestions,
                confidence: topSuggestion?.confidence || 0,
                recommended: topSuggestion ? true : false
            };
        } catch (error) {
            console.error('Error categorizing expense:', error);
            throw error;
        }
    }

    /**
     * Get suggestion based on merchant recognition
     */
    async getMerchantBasedSuggestion(userId, expense) {
        try {
            const merchant = await merchantRecognizer.recognize(
                userId,
                expense.description,
                parseFloat(expense.amount)
            );

            if (merchant && merchant.defaultCategoryId) {
                return {
                    categoryId: merchant.defaultCategoryId,
                    confidence: merchant.category ? 0.9 : 0.7,
                    source: 'merchant_pattern',
                    merchant: merchant.name,
                    merchantRecognized: true,
                    reasoning: `Recognized merchant: ${merchant.name}`
                };
            }

            return null;
        } catch (error) {
            console.error('Error in merchant-based suggestion:', error);
            return null;
        }
    }

    /**
     * Get suggestion based on user-defined rules
     */
    async getRuleBasedSuggestion(userId, expense) {
        try {
            const rules = await db.query.categorizationRules.findMany({
                where: and(
                    eq(categorizationRules.userId, userId),
                    eq(categorizationRules.isActive, true),
                    eq(categorizationRules.enabled, true)
                ),
                orderBy: desc(categorizationRules.priority)
            });

            for (const rule of rules) {
                const matched = this.evaluateRule(rule, expense);
                if (matched) {
                    // Update match count and last match time
                    await db.update(categorizationRules)
                        .set({
                            matchCount: (rule.matchCount || 0) + 1,
                            lastMatchAt: new Date()
                        })
                        .where(eq(categorizationRules.id, rule.id));

                    return {
                        categoryId: rule.categoryId,
                        confidence: 0.95, // High confidence for rule matches
                        source: 'rule_based',
                        ruleId: rule.id,
                        ruleName: rule.notes || 'Custom Rule',
                        reasoning: `Matched categorization rule: ${rule.notes}`
                    };
                }
            }

            return null;
        } catch (error) {
            console.error('Error in rule-based suggestion:', error);
            return null;
        }
    }

    /**
     * Evaluate if an expense matches a categorization rule
     */
    evaluateRule(rule, expense) {
        const config = rule.conditionConfig;

        switch (rule.conditionType) {
            case 'text_match': {
                const keywords = config.keywords || [];
                const description = expense.description.toLowerCase();
                return keywords.some(kw => description.includes(kw.toLowerCase()));
            }

            case 'amount_range': {
                const amount = parseFloat(expense.amount);
                const min = config.min || 0;
                const max = config.max || Infinity;
                return amount >= min && amount <= max;
            }

            case 'date_range': {
                const expenseDate = new Date(expense.date);
                const startDate = config.startDate ? new Date(config.startDate) : new Date(0);
                const endDate = config.endDate ? new Date(config.endDate) : new Date();
                return expenseDate >= startDate && expenseDate <= endDate;
            }

            case 'combined': {
                // All conditions must match
                const textMatch = config.keywords ?
                    config.keywords.some(kw => expense.description.toLowerCase().includes(kw.toLowerCase())) : true;
                const amountMatch = config.min && config.max ?
                    parseFloat(expense.amount) >= config.min && parseFloat(expense.amount) <= config.max : true;
                return textMatch && amountMatch;
            }

            default:
                return false;
        }
    }

    /**
     * Get suggestion based on historical patterns
     */
    async getPatternBasedSuggestion(userId, expense) {
        try {
            const patterns = await db.query.categorizationPatterns.findMany({
                where: and(
                    eq(categorizationPatterns.userId, userId),
                    eq(categorizationPatterns.enabled, true)
                ),
                orderBy: desc(categorizationPatterns.confidence)
            });

            const description = expense.description.toLowerCase();

            // Find matching patterns
            for (const pattern of patterns) {
                if (description.includes(pattern.pattern.toLowerCase())) {
                    return {
                        categoryId: pattern.categoryId,
                        confidence: Math.max(0.7, pattern.confidence),
                        source: 'pattern_based',
                        patternId: pattern.id,
                        occurrences: pattern.occurrenceCount,
                        reasoning: `Matched historical pattern with ${pattern.occurrenceCount} occurrences`
                    };
                }
            }

            return null;
        } catch (error) {
            console.error('Error in pattern-based suggestion:', error);
            return null;
        }
    }

    /**
     * Get suggestion from ML model
     */
    async getMLBasedSuggestion(userId, expense) {
        try {
            // Use existing categorization service
            const prediction = await categorizationService.predictCategory(
                userId,
                expense.description,
                expense.amount,
                expense.date
            );

            if (prediction && prediction.categoryId) {
                return {
                    categoryId: prediction.categoryId,
                    confidence: prediction.confidence || 0.7,
                    source: 'ml_model',
                    modelVersion: prediction.modelVersion || '1.0',
                    reasoning: `ML model prediction with ${(prediction.confidence * 100).toFixed(1)}% confidence`
                };
            }

            return null;
        } catch (error) {
            console.error('Error in ML-based suggestion:', error);
            return null;
        }
    }

    /**
     * Rank and aggregate suggestions
     */
    rankAndAggregatesuggestions(suggestions) {
        if (suggestions.length === 0) return null;

        // Weight by source
        const sourceWeights = {
            'rule_based': 1.0,
            'merchant_pattern': 0.9,
            'pattern_based': 0.8,
            'ml_model': 0.75
        };

        // Score each suggestion
        const scoredSuggestions = suggestions.map(s => ({
            ...s,
            score: s.confidence * (sourceWeights[s.source] || 0.5)
        }));

        // Sort by score
        scoredSuggestions.sort((a, b) => b.score - a.score);

        // Return top suggestion with adjusted confidence
        const top = scoredSuggestions[0];
        return {
            ...top,
            confidence: Math.min(top.score, 0.99) // Cap at 99%
        };
    }

    /**
     * Log a categorization suggestion
     */
    async logCategorySuggestion(expenseId, userId, categoryId, confidence, source, alternatives = []) {
        try {
            await db.insert(categorySuggestions).values({
                expenseId,
                userId,
                suggestedCategoryId: categoryId,
                confidenceScore: confidence.toString(),
                suggestionSource: source,
                alternativePredictions: JSON.stringify(alternatives.map(a => ({
                    categoryId: a.categoryId,
                    confidence: a.confidence,
                    source: a.source
                })))
            });
        } catch (error) {
            console.error('Error logging category suggestion:', error);
        }
    }

    /**
     * Record user correction for training
     */
    async recordCorrection(expenseId, userId, correctedCategoryId, originalCategoryId = null, feedback = null) {
        try {
            // Get previous suggestion confidence
            const previousSuggestion = await db.query.categorySuggestions.findFirst({
                where: and(
                    eq(categorySuggestions.expenseId, expenseId),
                    eq(categorySuggestions.userId, userId)
                ),
                orderBy: desc(categorySuggestions.createdAt)
            });

            // Record correction
            const correction = await db.insert(expenseCorrections).values({
                expenseId,
                userId,
                originalCategoryId: originalCategoryId || previousSuggestion?.suggestedCategoryId,
                correctedCategoryId,
                confidenceBefore: previousSuggestion?.confidenceScore,
                confidenceAfter: null, // Will be updated after correction
                reason: 'user_correction',
                feedback
            }).returning();

            // Update expense with correction
            await db.update(expenses)
                .set({
                    categoryId: correctedCategoryId,
                    autoCategorized: false,
                    updatedAt: new Date()
                })
                .where(eq(expenses.id, expenseId));

            // Learn from correction
            const expense = await db.query.expenses.findFirst({
                where: eq(expenses.id, expenseId)
            });

            if (expense) {
                // Update merchant with new category association
                await merchantRecognizer.learnFromCorrection(
                    userId,
                    expense.description,
                    correctedCategoryId,
                    parseFloat(expense.amount)
                );

                // Log pattern if high confidence
                const pattern = expense.description.toLowerCase().split(' ')[0];
                if (pattern.length > 3) {
                    // Update or create pattern
                    const existingPattern = await db.query.categorizationPatterns.findFirst({
                        where: and(
                            eq(categorizationPatterns.userId, userId),
                            eq(categorizationPatterns.pattern, pattern),
                            eq(categorizationPatterns.categoryId, correctedCategoryId)
                        )
                    });

                    if (existingPattern) {
                        await db.update(categorizationPatterns)
                            .set({
                                occurrenceCount: (existingPattern.occurrenceCount || 0) + 1,
                                confidence: Math.min(
                                    1.0,
                                    ((existingPattern.confidence * existingPattern.occurrenceCount) + 1) /
                                    ((existingPattern.occurrenceCount || 0) + 1)
                                ),
                                updatedAt: new Date()
                            })
                            .where(eq(categorizationPatterns.id, existingPattern.id));
                    } else if (pattern.length > 3) {
                        await db.insert(categorizationPatterns).values({
                            userId,
                            pattern,
                            categoryId: correctedCategoryId,
                            confidence: 0.7,
                            occurrenceCount: 1,
                            isSystemPattern: false,
                            patternType: 'keyword'
                        });
                    }
                }
            }

            return correction[0];
        } catch (error) {
            console.error('Error recording correction:', error);
            throw error;
        }
    }

    /**
     * Batch categorize multiple expenses
     */
    async batchCategorize(userId, expenseIds) {
        const results = [];

        for (const expenseId of expenseIds) {
            try {
                const result = await this.categorizeExpense(expenseId, userId);
                results.push({
                    expenseId,
                    success: true,
                    ...result
                });
            } catch (error) {
                results.push({
                    expenseId,
                    success: false,
                    error: error.message
                });
            }
        }

        return {
            total: expenseIds.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        };
    }

    /**
     * Get categorization statistics for a user
     */
    async getCategorizationStats(userId, daysBack = 30) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysBack);

            const totalExpenses = await db.select({ count: sql`COUNT(*)`.mapWith(Number) })
                .from(expenses)
                .where(and(
                    eq(expenses.userId, userId),
                    gte(expenses.createdAt, startDate)
                ));

            const autoCategorized = await db.select({ count: sql`COUNT(*)`.mapWith(Number) })
                .from(expenses)
                .where(and(
                    eq(expenses.userId, userId),
                    eq(expenses.autoCategorized, true),
                    gte(expenses.createdAt, startDate)
                ));

            const corrections = await db.select({ count: sql`COUNT(*)`.mapWith(Number) })
                .from(expenseCorrections)
                .where(and(
                    eq(expenseCorrections.userId, userId),
                    gte(expenseCorrections.createdAt, startDate)
                ));

            const suggestions = await db.select({ count: sql`COUNT(*)`.mapWith(Number) })
                .from(categorySuggestions)
                .where(and(
                    eq(categorySuggestions.userId, userId),
                    gte(categorySuggestions.createdAt, startDate)
                ));

            return {
                period: `Last ${daysBack} days`,
                totalExpenses: totalExpenses[0]?.count || 0,
                autoCategorized: autoCategorized[0]?.count || 0,
                autoCategorizationRate: totalExpenses[0]?.count ? 
                    ((autoCategorized[0]?.count || 0) / (totalExpenses[0]?.count || 1) * 100).toFixed(2) + '%' : '0%',
                userCorrections: corrections[0]?.count || 0,
                suggestionsGenerated: suggestions[0]?.count || 0,
                recommendationAcceptanceRate: suggestions[0]?.count ? 
                    ((autoCategorized[0]?.count || 0) / (suggestions[0]?.count || 1) * 100).toFixed(2) + '%' : '0%'
            };
        } catch (error) {
            console.error('Error getting categorization stats:', error);
            throw error;
        }
    }
}

export default new SmartCategorizationEngine();
