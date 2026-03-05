import db from '../config/db.js';
import { merchants, merchantRatings, merchantLogos, merchantFrequencyPatterns } from '../db/schema.js';
import { eq, and, sql, desc, avg } from 'drizzle-orm';

/**
 * Enhanced Merchant Recognizer
 * Normalizes transaction descriptions to identify merchants with logos, ratings, and frequency data.
 * Issue #639: Smart Expense Categorization & Merchant Recognition
 */
class MerchantRecognizer {
    constructor() {
        this.STOP_WORDS = ['inc', 'llc', 'corp', 'limited', 'ltd', 'co', 'the', 'store', 'shop', 'store', 'location', 'branch'];
        this.MERCHANT_ALIASES = {
            'amazon': ['amzn', 'amazon.com', 'amazon prime'],
            'netflix': ['nflx'],
            'uber': ['uberx', 'ubereats', 'uber eats'],
            'spotify': ['spotify ab'],
            'apple': ['apple inc', 'app store', 'itunes']
        };
    }

    /**
     * Recognize merchant from description with confidence score
     */
    async recognize(userId, description, amount = null) {
        if (!description) return null;

        const normalized = this.normalize(description);
        if (!normalized) return null;

        try {
            // Try exact match on normalized name
            const exactMatch = await db.query.merchants.findFirst({
                where: and(
                    eq(merchants.userId, userId),
                    eq(merchants.normalizedName, normalized)
                ),
                with: {
                    defaultCategory: true,
                }
            });

            if (exactMatch) {
                return await this.enrichMerchantData(exactMatch);
            }

            // Try fuzzy match or partial word match
            const nameParts = normalized.split(' ').filter(p => p.length > 2);
            if (nameParts.length > 0) {
                // Split the normalized name into keywords
                const keywords = nameParts.slice(0, 2); // Use first 2 keywords
                
                // Search for merchants with similar keywords
                const partialMatches = await db.query.merchants.findMany({
                    where: and(
                        eq(merchants.userId, userId),
                        sql`${merchants.normalizedName} ILIKE ${'%' + keywords[0] + '%'}`
                    ),
                    limit: 3
                });

                if (partialMatches.length > 0) {
                    // Return best match enriched with data
                    return await this.enrichMerchantData(partialMatches[0]);
                }
            }

            // Try alias matching
            const aliasMatch = await this.findByAlias(userId, normalized);
            if (aliasMatch) {
                return await this.enrichMerchantData(aliasMatch);
            }

            return null;
        } catch (error) {
            console.error('Error in merchant recognition:', error);
            return null;
        }
    }

    /**
     * Find merchant by aliases
     */
    async findByAlias(userId, normalizedName) {
        for (const [primary, aliases] of Object.entries(this.MERCHANT_ALIASES)) {
            if (aliases.some(alias => normalizedName.includes(alias) || alias.includes(normalizedName))) {
                // Return primary merchant if exists
                return await db.query.merchants.findFirst({
                    where: and(
                        eq(merchants.userId, userId),
                        eq(merchants.normalizedName, primary)
                    )
                });
            }
        }
        return null;
    }

    /**
     * Enrich merchant data with logos, ratings, frequency patterns
     */
    async enrichMerchantData(merchant) {
        try {
            // Get logos
            const logos = await db.query.merchantLogos.findMany({
                where: eq(merchantLogos.merchantId, merchant.id),
                orderBy: desc(merchantLogos.isPrimary)
            });

            // Get average rating
            const ratingsData = await db
                .select({
                    avgRating: avg(merchantRatings.rating),
                    count: sql`COUNT(*)`.mapWith(Number)
                })
                .from(merchantRatings)
                .where(eq(merchantRatings.merchantId, merchant.id));

            const avgRating = ratingsData[0]?.avgRating ? parseFloat(ratingsData[0].avgRating) : null;
            const ratingCount = ratingsData[0]?.count || 0;

            // Get frequency patterns
            const frequencyPatterns = await db.query.merchantFrequencyPatterns.findMany({
                where: eq(merchantFrequencyPatterns.merchantId, merchant.id),
                orderBy: desc(merchantFrequencyPatterns.confidenceScore)
            });

            return {
                ...merchant,
                logos: logos.length > 0 ? logos : null,
                primaryLogo: logos.find(l => l.isPrimary) || logos[0] || null,
                rating: {
                    average: avgRating,
                    count: ratingCount,
                    trustScore: ratingCount > 0 ? Math.min(ratingCount / 10, 1) : 0
                },
                frequencyPatterns: frequencyPatterns.length > 0 ? frequencyPatterns[0] : null,
                merchantType: merchant.merchantType || 'general',
                isSubscriptionService: merchant.isSubscriptionService || false
            };
        } catch (error) {
            console.error('Error enriching merchant data:', error);
            return merchant; // Return basic merchant data on error
        }
    }

    /**
     * Normalize description for matching
     */
    normalize(text) {
        if (!text) return '';
        
        return text.toLowerCase()
            .replace(/[0-9\-_]/g, ' ') // Replace numbers and separators with spaces
            .replace(/[^a-z\s]/g, '') // Remove symbols
            .split(' ')
            .filter(word => word.length > 2 && !this.STOP_WORDS.includes(word))
            .join(' ')
            .trim();
    }

    /**
     * Learn merchant association from transaction correction
     */
    async learnFromCorrection(userId, description, categoryId, amount = null) {
        const normalized = this.normalize(description);
        if (!normalized) return null;

        try {
            const existing = await db.query.merchants.findFirst({
                where: and(
                    eq(merchants.userId, userId),
                    eq(merchants.normalizedName, normalized)
                )
            });

            let merchant;
            if (!existing) {
                // Create new merchant
                const result = await db.insert(merchants).values({
                    userId,
                    name: description.split(' ')[0], // Best guess at name
                    normalizedName: normalized,
                    defaultCategoryId: categoryId,
                    metadata: {
                        learnedFrom: description,
                        averageAmount: amount,
                        learnedAt: new Date().toISOString()
                    }
                }).returning();
                merchant = result[0];
            } else {
                // Update existing merchant with better category mapping
                merchant = await db.update(merchants)
                    .set({
                        defaultCategoryId: categoryId,
                        metadata: {
                            ...existing.metadata,
                            lastLearned: new Date().toISOString(),
                            averageAmount: amount
                        },
                        updatedAt: new Date()
                    })
                    .where(eq(merchants.id, existing.id))
                    .returning();
                merchant = merchant[0];
            }

            return merchant;
        } catch (error) {
            console.error('Error learning from correction:', error);
            throw error;
        }
    }

    /**
     * Create or update merchant profile
     */
    async upsertMerchant(userId, data) {
        const normalized = this.normalize(data.name);
        if (!normalized) throw new Error('Invalid merchant name');

        try {
            const existing = await db.query.merchants.findFirst({
                where: and(
                    eq(merchants.userId, userId),
                    eq(merchants.normalizedName, normalized)
                )
            });

            let merchant;
            if (existing) {
                [merchant] = await db.update(merchants)
                    .set({
                        ...data,
                        normalizedName: normalized,
                        updatedAt: new Date()
                    })
                    .where(eq(merchants.id, existing.id))
                    .returning();
            } else {
                [merchant] = await db.insert(merchants)
                    .values({
                        userId,
                        ...data,
                        normalizedName: normalized
                    })
                    .returning();
            }

            return merchant;
        } catch (error) {
            console.error('Error upserting merchant:', error);
            throw error;
        }
    }

    /**
     * Rate a merchant
     */
    async rateMerchant(merchantId, userId, rating, review = null, feedbackType = null) {
        if (rating < 1 || rating > 5) {
            throw new Error('Rating must be between 1 and 5');
        }

        try {
            const result = await db.insert(merchantRatings)
                .values({
                    merchantId,
                    userId,
                    rating: rating.toString(), // Store as string for numeric type
                    review,
                    feedbackType
                })
                .onConflictDoUpdate({
                    target: [merchantRatings.merchantId, merchantRatings.userId],
                    set: {
                        rating: rating.toString(),
                        review,
                        feedbackType,
                        updatedAt: new Date()
                    }
                })
                .returning();

            return result[0];
        } catch (error) {
            console.error('Error rating merchant:', error);
            throw error;
        }
    }

    /**
     * Add or update merchant logo
     */
    async addMerchantLogo(merchantId, logoUrl, options = {}) {
        try {
            // Mark others as non-primary if this is primary
            if (options.isPrimary) {
                await db.update(merchantLogos)
                    .set({ isPrimary: false })
                    .where(eq(merchantLogos.merchantId, merchantId));
            }

            const result = await db.insert(merchantLogos)
                .values({
                    merchantId,
                    logoUrl,
                    logoUrlHd: options.logoUrlHd,
                    colorPrimary: options.colorPrimary,
                    colorSecondary: options.colorSecondary,
                    logoSource: options.logoSource || 'user',
                    isVerified: options.isVerified || false,
                    isPrimary: options.isPrimary || false
                })
                .returning();

            return result[0];
        } catch (error) {
            console.error('Error adding merchant logo:', error);
            throw error;
        }
    }

    /**
     * Get merchant suggestions for autocomplete
     */
    async suggestMerchants(userId, query, limit = 10) {
        if (!query || query.length < 2) return [];

        try {
            const normalized = this.normalize(query);
            const nameParts = normalized.split(' ');
            
            const suggestions = await db.query.merchants.findMany({
                where: and(
                    eq(merchants.userId, userId),
                    sql`${merchants.normalizedName} ILIKE ${'%' + nameParts[0] + '%'}`
                ),
                limit,
                orderBy: desc(merchants.updatedAt)
            });

            // Enrich with logos and ratings
            return Promise.all(suggestions.map(m => this.enrichMerchantData(m)));
        } catch (error) {
            console.error('Error suggesting merchants:', error);
            return [];
        }
    }

    /**
     * Get global merchants (mock data for initial application)
     */
    async getGlobalMerchants() {
        // In a real app, this would query a global DB or external API
        return [
            { name: 'Amazon', normalizedName: 'amazon', industry: 'Retail', merchantType: 'retailer' },
            { name: 'Uber', normalizedName: 'uber', industry: 'Transport', merchantType: 'service' },
            { name: 'Netflix', normalizedName: 'netflix', industry: 'Entertainment', merchantType: 'subscription', isSubscriptionService: true },
            { name: 'Starbucks', normalizedName: 'starbucks', industry: 'Food & Beverage', merchantType: 'restaurant' },
            { name: 'Spotify', normalizedName: 'spotify', industry: 'Entertainment', merchantType: 'subscription', isSubscriptionService: true }
        ];
    }
}

export default new MerchantRecognizer();
