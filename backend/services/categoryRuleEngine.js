import db from '../config/db.js';
import { categorizationRules, categories, expenses } from '../db/schema.js';
import { eq, and, desc, gte, lte } from 'drizzle-orm';

/**
 * Category Rule Engine
 * Allows users to create, manage, and test custom categorization rules
 * Issue #639: Smart Expense Categorization & Merchant Recognition
 */
class CategoryRuleEngine {
    constructor() {
        this.CONDITION_TYPES = ['text_match', 'amount_range', 'date_range', 'combined'];
    }

    /**
     * Create a new categorization rule
     * Example format:
     * {
     *   categoryId: 'uuid',
     *   conditionType: 'text_match',
     *   conditionConfig: { keywords: ['amazon', 'aws'] },
     *   priority: 10,
     *   notes: 'Amazon purchases'
     * }
     */
    async createRule(userId, ruleData) {
        try {
            // Validate inputs
            this.validateRuleData(ruleData);

            const rule = await db.insert(categorizationRules)
                .values({
                    userId,
                    categoryId: ruleData.categoryId,
                    priority: ruleData.priority || 0,
                    conditionType: ruleData.conditionType,
                    conditionConfig: JSON.stringify(ruleData.conditionConfig),
                    isActive: ruleData.isActive !== false,
                    enabled: true,
                    notes: ruleData.notes,
                    matchCount: 0,
                    ruleType: 'custom',
                    matchingAlgorithm: this.inferAlgorithm(ruleData.conditionType),
                    isML: false,
                    accuracyScore: 0
                })
                .returning();

            return rule[0];
        } catch (error) {
            console.error('Error creating rule:', error);
            throw error;
        }
    }

    /**
     * Infer matching algorithm based on condition type
     */
    inferAlgorithm(conditionType) {
        const mapping = {
            'text_match': 'fuzzy',
            'amount_range': 'exact',
            'date_range': 'exact',
            'combined': 'semantic'
        };
        return mapping[conditionType] || 'exact';
    }

    /**
     * Validate rule data
     */
    validateRuleData(ruleData) {
        if (!ruleData.categoryId) {
            throw new Error('Category ID is required');
        }

        if (!ruleData.conditionType || !this.CONDITION_TYPES.includes(ruleData.conditionType)) {
            throw new Error(`Invalid condition type. Must be one of: ${this.CONDITION_TYPES.join(', ')}`);
        }

        if (!ruleData.conditionConfig || typeof ruleData.conditionConfig !== 'object') {
            throw new Error('Condition config must be a valid object');
        }

        // Type-specific validation
        switch (ruleData.conditionType) {
            case 'text_match':
                if (!Array.isArray(ruleData.conditionConfig.keywords) || ruleData.conditionConfig.keywords.length === 0) {
                    throw new Error('Text match requires non-empty keywords array');
                }
                break;

            case 'amount_range':
                if (typeof ruleData.conditionConfig.min !== 'number' || typeof ruleData.conditionConfig.max !== 'number') {
                    throw new Error('Amount range requires min and max numbers');
                }
                if (ruleData.conditionConfig.min > ruleData.conditionConfig.max) {
                    throw new Error('Min amount cannot be greater than max amount');
                }
                break;

            case 'date_range':
                if (ruleData.conditionConfig.startDate && !this.isValidDate(ruleData.conditionConfig.startDate)) {
                    throw new Error('Invalid start date');
                }
                if (ruleData.conditionConfig.endDate && !this.isValidDate(ruleData.conditionConfig.endDate)) {
                    throw new Error('Invalid end date');
                }
                break;

            case 'combined':
                // Validate both text and amount conditions if present
                if (ruleData.conditionConfig.keywords && 
                    (!Array.isArray(ruleData.conditionConfig.keywords) || ruleData.conditionConfig.keywords.length === 0)) {
                    throw new Error('Combined rule keywords must be a non-empty array');
                }
                break;
        }
    }

    /**
     * Check if valid date
     */
    isValidDate(dateStr) {
        const date = new Date(dateStr);
        return !isNaN(date.getTime());
    }

    /**
     * Update a rule
     */
    async updateRule(userId, ruleId, updateData) {
        try {
            // Verify ownership
            const existing = await db.query.categorizationRules.findFirst({
                where: and(
                    eq(categorizationRules.id, ruleId),
                    eq(categorizationRules.userId, userId)
                )
            });

            if (!existing) {
                throw new Error('Rule not found or not authorized');
            }

            // Validate if condition config is being updated
            if (updateData.conditionConfig) {
                this.validateRuleData({
                    categoryId: updateData.categoryId || existing.categoryId,
                    conditionType: updateData.conditionType || existing.conditionType,
                    conditionConfig: updateData.conditionConfig
                });
            }

            const updated = await db.update(categorizationRules)
                .set({
                    categoryId: updateData.categoryId,
                    priority: updateData.priority,
                    conditionType: updateData.conditionType,
                    conditionConfig: updateData.conditionConfig ? JSON.stringify(updateData.conditionConfig) : undefined,
                    isActive: updateData.isActive,
                    enabled: updateData.enabled,
                    notes: updateData.notes,
                    updatedAt: new Date()
                })
                .where(and(
                    eq(categorizationRules.id, ruleId),
                    eq(categorizationRules.userId, userId)
                ))
                .returning();

            return updated[0];
        } catch (error) {
            console.error('Error updating rule:', error);
            throw error;
        }
    }

    /**
     * Delete a rule
     */
    async deleteRule(userId, ruleId) {
        try {
            const deleted = await db.delete(categorizationRules)
                .where(and(
                    eq(categorizationRules.id, ruleId),
                    eq(categorizationRules.userId, userId)
                ))
                .returning();

            if (deleted.length === 0) {
                throw new Error('Rule not found or not authorized');
            }

            return { success: true, deletedRule: deleted[0] };
        } catch (error) {
            console.error('Error deleting rule:', error);
            throw error;
        }
    }

    /**
     * Get all rules for a user
     */
    async getRulesForUser(userId) {
        try {
            const rules = await db.query.categorizationRules.findMany({
                where: eq(categorizationRules.userId, userId),
                orderBy: desc(categorizationRules.priority),
                with: {
                    category: true
                }
            });

            return rules.map(r => ({
                ...r,
                conditionConfig: typeof r.conditionConfig === 'string' ? 
                    JSON.parse(r.conditionConfig) : r.conditionConfig
            }));
        } catch (error) {
            console.error('Error fetching rules:', error);
            throw error;
        }
    }

    /**
     * Test a rule against an expense
     */
    async testRule(userId, ruleId, expenseId) {
        try {
            const rule = await db.query.categorizationRules.findFirst({
                where: and(
                    eq(categorizationRules.id, ruleId),
                    eq(categorizationRules.userId, userId)
                )
            });

            if (!rule) {
                throw new Error('Rule not found');
            }

            const expense = await db.query.expenses.findFirst({
                where: eq(expenses.id, expenseId)
            });

            if (!expense) {
                throw new Error('Expense not found');
            }

            const matches = this.evaluateRule(rule, expense);

            return {
                ruleId,
                expenseId,
                matches,
                rule: {
                    id: rule.id,
                    notes: rule.notes,
                    conditionType: rule.conditionType
                },
                expense: {
                    id: expense.id,
                    description: expense.description,
                    amount: expense.amount,
                    date: expense.date
                }
            };
        } catch (error) {
            console.error('Error testing rule:', error);
            throw error;
        }
    }

    /**
     * Test a rule against multiple recent expenses
     */
    async testRuleOnRecentExpenses(userId, ruleId) {
        try {
            const rule = await db.query.categorizationRules.findFirst({
                where: and(
                    eq(categorizationRules.id, ruleId),
                    eq(categorizationRules.userId, userId)
                )
            });

            if (!rule) {
                throw new Error('Rule not found');
            }

            // Get recent expenses (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const recentExpenses = await db.query.expenses.findMany({
                where: and(
                    eq(expenses.userId, userId),
                    gte(expenses.createdAt, thirtyDaysAgo)
                ),
                limit: 50,
                orderBy: desc(expenses.createdAt)
            });

            const results = [];
            let matchCount = 0;

            for (const expense of recentExpenses) {
                const matches = this.evaluateRule(rule, expense);
                if (matches) {
                    matchCount++;
                    results.push({
                        expenseId: expense.id,
                        description: expense.description,
                        amount: expense.amount,
                        date: expense.date,
                        matches: true
                    });
                }
            }

            const matchRate = recentExpenses.length > 0 ? 
                (matchCount / recentExpenses.length * 100).toFixed(2) : 0;

            return {
                ruleId,
                rule: rule.notes,
                testExpenses: recentExpenses.length,
                matchedExpenses: matchCount,
                matchRate: `${matchRate}%`,
                results
            };
        } catch (error) {
            console.error('Error testing rule on recent expenses:', error);
            throw error;
        }
    }

    /**
     * Evaluate a rule against an expense
     */
    evaluateRule(rule, expense) {
        const config = typeof rule.conditionConfig === 'string' ? 
            JSON.parse(rule.conditionConfig) : rule.conditionConfig;

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
                let textMatch = true;
                let amountMatch = true;

                if (config.keywords && Array.isArray(config.keywords)) {
                    const description = expense.description.toLowerCase();
                    textMatch = config.keywords.some(kw => description.includes(kw.toLowerCase()));
                }

                if (typeof config.min === 'number' && typeof config.max === 'number') {
                    const amount = parseFloat(expense.amount);
                    amountMatch = amount >= config.min && amount <= config.max;
                }

                return textMatch && amountMatch;
            }

            default:
                return false;
        }
    }

    /**
     * Get rule statistics
     */
    async getRuleStats(userId, ruleId) {
        try {
            const rule = await db.query.categorizationRules.findFirst({
                where: and(
                    eq(categorizationRules.id, ruleId),
                    eq(categorizationRules.userId, userId)
                ),
                with: {
                    category: true
                }
            });

            if (!rule) {
                throw new Error('Rule not found');
            }

            return {
                ruleId: rule.id,
                ruleName: rule.notes || 'Unnamed Rule',
                category: rule.category?.name,
                matchCount: rule.matchCount || 0,
                lastMatchAt: rule.lastMatchAt,
                falsePositives: rule.falsePositiveCount || 0,
                accuracy: rule.accuracyScore || 0,
                enabled: rule.enabled,
                priority: rule.priority
            };
        } catch (error) {
            console.error('Error getting rule stats:', error);
            throw error;
        }
    }

    /**
     * Create rule templates for common scenarios
     */
    static readonly TEMPLATES = {
        subscription: {
            name: 'Subscription Service',
            conditionType: 'text_match',
            conditionConfig: { keywords: ['subscription', 'monthly', 'annual', 'recurring'] }
        },
        groceries: {
            name: 'Grocery Store',
            conditionType: 'text_match',
            conditionConfig: { keywords: ['grocery', 'whole foods', 'trader joes', 'safeway', 'kroger'] }
        },
        dining: {
            name: 'Restaurant/Dining',
            conditionType: 'text_match',
            conditionConfig: { keywords: ['restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'starbucks'] }
        },
        transportation: {
            name: 'Transportation',
            conditionType: 'text_match',
            conditionConfig: { keywords: ['uber', 'lyft', 'taxi', 'gas station', 'parking'] }
        },
        smallPurchases: {
            name: 'Small Purchases',
            conditionType: 'amount_range',
            conditionConfig: { min: 0, max: 10 }
        },
        largePurchases: {
            name: 'Large Purchases',
            conditionType: 'amount_range',
            conditionConfig: { min: 100, max: 99999 }
        },
        venmo: {
            name: 'Friend Payments (Venmo)',
            conditionType: 'text_match',
            conditionConfig: { keywords: ['venmo', 'cash app', 'paypal friends', 'request money'] }
        }
    };

    /**
     * Get rule template
     */
    static getTemplate(templateKey) {
        return this.TEMPLATES[templateKey] || null;
    }

    /**
     * List available templates
     */
    static getAvailableTemplates() {
        return Object.entries(this.TEMPLATES).map(([key, value]) => ({
            key,
            name: value.name,
            conditionType: value.conditionType
        }));
    }

    /**
     * Create rule from template
     */
    async createRuleFromTemplate(userId, templateKey, categoryId, ruleNotes) {
        const template = CategoryRuleEngine.getTemplate(templateKey);
        if (!template) {
            throw new Error(`Template '${templateKey}' not found`);
        }

        return this.createRule(userId, {
            categoryId,
            conditionType: template.conditionType,
            conditionConfig: template.conditionConfig,
            notes: ruleNotes || template.name,
            priority: 0
        });
    }
}

export default new CategoryRuleEngine();
