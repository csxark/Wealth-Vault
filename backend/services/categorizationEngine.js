import db from '../config/db.js';
import { categorizationPatterns, categorizationRules, expenses, merchants } from '../db/schema.js';
import { eq, and, desc, sql, ilike } from 'drizzle-orm';
import merchantRecognizer from './merchantRecognizer.js';

/**
 * Advanced Categorization Engine
 * Uses rules, patterns, and merchant recognition to categorize transactions.
 */
class CategorizationEngine {
    constructor() {
        this.CONFIDENCE_THRESHOLD = 0.7;
    }

    /**
     * Categorize a single transaction
     */
    async categorizeTransaction(userId, transactionData) {
        const { description, amount, date } = transactionData;

        // 1. Check for precise rule matches (Highest Priority)
        const ruleMatch = await this.findRuleMatch(userId, transactionData);
        if (ruleMatch) {
            return {
                categoryId: ruleMatch.categoryId,
                method: 'rule',
                confidence: 1.0,
                ruleId: ruleMatch.id
            };
        }

        // 2. Merchant Recognition
        const merchant = await merchantRecognizer.recognize(userId, description);
        if (merchant && merchant.defaultCategoryId) {
            return {
                categoryId: merchant.defaultCategoryId,
                method: 'merchant',
                confidence: merchant.isVerified ? 0.95 : 0.85,
                merchantId: merchant.id
            };
        }

        // 3. Pattern Matching (ML-derived)
        const patternMatch = await this.findPatternMatch(userId, description);
        if (patternMatch && patternMatch.confidence >= this.CONFIDENCE_THRESHOLD) {
            return {
                categoryId: patternMatch.categoryId,
                method: 'pattern',
                confidence: patternMatch.confidence,
                patternId: patternMatch.id
            };
        }

        // 4. Default Guess (Fallthrough)
        return {
            categoryId: null,
            method: 'none',
            confidence: 0
        };
    }

    /**
     * Find matching rule for transaction
     */
    async findRuleMatch(userId, transaction) {
        const rules = await db.select()
            .from(categorizationRules)
            .where(and(
                eq(categorizationRules.userId, userId),
                eq(categorizationRules.isActive, true)
            ))
            .orderBy(desc(categorizationRules.priority));

        for (const rule of rules) {
            if (this.evaluateRule(rule, transaction)) {
                // Update match count asynchronously
                db.update(categorizationRules)
                    .set({
                        matchCount: sql`${categorizationRules.matchCount} + 1`,
                        lastMatchAt: new Date()
                    })
                    .where(eq(categorizationRules.id, rule.id))
                    .execute();

                return rule;
            }
        }
        return null;
    }

    /**
     * Evaluate rule conditions
     */
    evaluateRule(rule, transaction) {
        const { conditionType, conditionConfig } = rule;

        switch (conditionType) {
            case 'text_match':
                return this.matchText(transaction.description, conditionConfig);
            case 'amount_range':
                return this.matchAmount(transaction.amount, conditionConfig);
            case 'combined':
                return this.matchText(transaction.description, conditionConfig.text) &&
                    this.matchAmount(transaction.amount, conditionConfig.amount);
            default:
                return false;
        }
    }

    matchText(text, config) {
        if (!text || !config.pattern) return false;
        const pattern = config.pattern.toLowerCase();
        const description = text.toLowerCase();

        if (config.operator === 'equals') return description === pattern;
        if (config.operator === 'contains') return description.includes(pattern);
        if (config.operator === 'starts_with') return description.startsWith(pattern);
        return false;
    }

    matchAmount(amount, config) {
        const val = parseFloat(amount);
        if (config.min !== undefined && val < config.min) return false;
        if (config.max !== undefined && val > config.max) return false;
        return true;
    }

    /**
     * Find matching pattern (simple fuzzy matching/statistical)
     */
    async findPatternMatch(userId, description) {
        const normalized = description.toLowerCase().trim();

        // Find patterns that are substrings or similar
        const patterns = await db.select()
            .from(categorizationPatterns)
            .where(and(
                eq(categorizationPatterns.userId, userId),
                sql`${categorizationPatterns.pattern} LIKE ${'%' + normalized + '%'}`
            ))
            .orderBy(desc(categorizationPatterns.confidence));

        return patterns[0] || null;
    }

    /**
     * Bulk recategorize existing transactions
     */
    async bulkRecategorize(userId, filter = {}) {
        const transactions = await db.select()
            .from(expenses)
            .where(eq(expenses.userId, userId));

        let updatedCount = 0;
        const results = [];

        for (const tx of transactions) {
            const result = await this.categorizeTransaction(userId, tx);
            if (result.categoryId && result.categoryId !== tx.categoryId) {
                await db.update(expenses)
                    .set({ categoryId: result.categoryId })
                    .where(eq(expenses.id, tx.id));

                updatedCount++;
                results.push({ id: tx.id, old: tx.categoryId, new: result.categoryId });
            }
        }

        return { updatedCount, results };
    }

    /**
     * Learn from user correction
     */
    async learn(userId, transactionId, correctCategoryId) {
        const [tx] = await db.select().from(expenses).where(eq(expenses.id, transactionId)).limit(1);
        if (!tx) return;

        const normalized = tx.description.toLowerCase().trim();

        // 1. Update/Create Pattern
        const existing = await db.select()
            .from(categorizationPatterns)
            .where(and(
                eq(categorizationPatterns.userId, userId),
                eq(categorizationPatterns.pattern, normalized)
            ))
            .limit(1);

        if (existing.length > 0) {
            await db.update(categorizationPatterns)
                .set({
                    categoryId: correctCategoryId,
                    occurrenceCount: existing[0].occurrenceCount + 1,
                    confidence: Math.min(0.99, existing[0].confidence + 0.05)
                })
                .where(eq(categorizationPatterns.id, existing[0].id));
        } else {
            await db.insert(categorizationPatterns)
                .values({
                    userId,
                    pattern: normalized,
                    categoryId: correctCategoryId,
                    confidence: 0.5,
                    occurrenceCount: 1
                });
        }

        // 2. Try to associate with a merchant
        await merchantRecognizer.learn(userId, tx.description, correctCategoryId);
    }
}

export default new CategorizationEngine();
