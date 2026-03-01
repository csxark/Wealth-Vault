import db from '../config/db.js';
import { merchants } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Merchant Recognizer
 * Normalizes transaction descriptions to identify merchants.
 */
class MerchantRecognizer {
    constructor() {
        this.STOP_WORDS = ['inc', 'llc', 'corp', 'limited', 'ltd', 'co', 'the', 'store', 'shop'];
    }

    /**
     * Recognize merchant from description
     */
    async recognize(userId, description) {
        if (!description) return null;

        const normalized = this.normalize(description);

        // Try exact match on normalized name
        const match = await db.select()
            .from(merchants)
            .where(and(
                eq(merchants.userId, userId),
                eq(merchants.normalizedName, normalized)
            ))
            .limit(1);

        if (match.length > 0) return match[0];

        // Try fuzzy match or partial word match
        const parts = normalized.split(' ');
        if (parts.length > 0) {
            const partialMatch = await db.select()
                .from(merchants)
                .where(and(
                    eq(merchants.userId, userId),
                    sql`${merchants.normalizedName} LIKE ${'%' + parts[0] + '%'}`
                ))
                .limit(1);

            if (partialMatch.length > 0) return partialMatch[0];
        }

        return null;
    }

    /**
     * Normalize description for matching
     */
    normalize(text) {
        return text.toLowerCase()
            .replace(/[0-9]/g, '') // Remove numbers (often dates/store IDs)
            .replace(/[^a-z\s]/g, '') // Remove symbols
            .split(' ')
            .filter(word => word.length > 2 && !this.STOP_WORDS.includes(word))
            .join(' ')
            .trim();
    }

    /**
     * Learn merchant association from transaction
     */
    async learn(userId, description, categoryId) {
        const normalized = this.normalize(description);
        if (!normalized) return;

        const existing = await db.select()
            .from(merchants)
            .where(and(
                eq(merchants.userId, userId),
                eq(merchants.normalizedName, normalized)
            ))
            .limit(1);

        if (existing.length === 0) {
            await db.insert(merchants)
                .values({
                    userId,
                    name: description.split(' ')[0], // Best guess at name
                    normalizedName: normalized,
                    defaultCategoryId: categoryId,
                    metadata: { learnedFrom: description }
                });
        }
    }

    /**
     * Create or update merchant profile
     */
    async upsertMerchant(userId, data) {
        const normalized = this.normalize(data.name);

        const existing = await db.select()
            .from(merchants)
            .where(and(
                eq(merchants.userId, userId),
                eq(merchants.normalizedName, normalized)
            ))
            .limit(1);

        if (existing.length > 0) {
            return await db.update(merchants)
                .set({ ...data, updatedAt: new Date() })
                .where(eq(merchants.id, existing[0].id))
                .returning();
        } else {
            return await db.insert(merchants)
                .values({
                    ...data,
                    userId,
                    normalizedName: normalized
                })
                .returning();
        }
    }

    /**
     * Get verified global merchants (mock)
     */
    async getGlobalMerchants() {
        // In a real app, this would query a global DB or external API
        return [
            { name: 'Amazon', normalizedName: 'amazon', industry: 'Retail' },
            { name: 'Uber', normalizedName: 'uber', industry: 'Transport' },
            { name: 'Netflix', normalizedName: 'netflix', industry: 'Entertainment' }
        ];
    }
}

export default new MerchantRecognizer();
