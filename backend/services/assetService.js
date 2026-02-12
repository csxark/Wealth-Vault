import db from '../config/db.js';
import { fixedAssets, assetValuations, marketIndices } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import eventBus from '../events/eventBus.js';

class AssetService {
    /**
     * Create a new fixed asset
     */
    async createAsset(userId, assetData) {
        const { name, category, purchasePrice, purchaseDate, currentValue, currency, location, description, appreciationRate, metadata } = assetData;

        const [asset] = await db.insert(fixedAssets).values({
            userId,
            name,
            category,
            purchasePrice: purchasePrice.toString(),
            purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
            currentValue: (currentValue || purchasePrice).toString(),
            currency: currency || 'USD',
            location,
            description,
            appreciationRate: appreciationRate ? appreciationRate.toString() : '0',
            metadata: metadata || {},
        }).returning();

        // Create initial valuation entry
        await this.addValuation(asset.id, currentValue || purchasePrice, 'manual');

        eventBus.emit('ASSET_CREATED', asset);

        return asset;
    }

    /**
     * Get all assets for a user
     */
    async getUserAssets(userId) {
        const assets = await db.query.fixedAssets.findMany({
            where: eq(fixedAssets.userId, userId),
            with: {
                valuations: {
                    orderBy: [desc(assetValuations.date)],
                    limit: 5
                }
            },
            orderBy: [desc(fixedAssets.createdAt)]
        });

        // Calculate metrics for each asset
        return assets.map(asset => {
            const purchasePrice = parseFloat(asset.purchasePrice);
            const currentValue = parseFloat(asset.currentValue);
            const gainLoss = currentValue - purchasePrice;
            const gainLossPercent = purchasePrice > 0 ? (gainLoss / purchasePrice) * 100 : 0;

            return {
                ...asset,
                metrics: {
                    gainLoss,
                    gainLossPercent: gainLossPercent.toFixed(2),
                    totalValue: currentValue
                }
            };
        });
    }

    /**
     * Update asset valuation
     */
    async updateAssetValue(assetId, newValue, source = 'manual') {
        // Update current value
        await db.update(fixedAssets)
            .set({
                currentValue: newValue.toString(),
                updatedAt: new Date()
            })
            .where(eq(fixedAssets.id, assetId));

        // Log valuation history
        await this.addValuation(assetId, newValue, source);

        return await db.query.fixedAssets.findFirst({
            where: eq(fixedAssets.id, assetId)
        });
    }

    /**
     * Add valuation entry
     */
    async addValuation(assetId, value, source = 'manual') {
        return await db.insert(assetValuations).values({
            assetId,
            value: value.toString(),
            date: new Date(),
            source
        }).returning();
    }

    /**
     * Apply appreciation/depreciation based on configured rate
     */
    async applyAppreciation(assetId) {
        const asset = await db.query.fixedAssets.findFirst({
            where: eq(fixedAssets.id, assetId)
        });

        if (!asset || !asset.appreciationRate) return null;

        const currentValue = parseFloat(asset.currentValue);
        const rate = parseFloat(asset.appreciationRate) / 100; // Convert to decimal
        const dailyRate = rate / 365; // Daily appreciation

        const newValue = currentValue * (1 + dailyRate);

        return await this.updateAssetValue(assetId, newValue, 'market_adjustment');
    }

    /**
     * Get total portfolio value
     */
    async getPortfolioValue(userId) {
        const assets = await db.select().from(fixedAssets).where(eq(fixedAssets.userId, userId));

        let totalValue = 0;
        let totalPurchasePrice = 0;

        assets.forEach(asset => {
            totalValue += parseFloat(asset.currentValue);
            totalPurchasePrice += parseFloat(asset.purchasePrice);
        });

        return {
            totalValue,
            totalPurchasePrice,
            totalGainLoss: totalValue - totalPurchasePrice,
            totalGainLossPercent: totalPurchasePrice > 0 ? ((totalValue - totalPurchasePrice) / totalPurchasePrice) * 100 : 0,
            assetCount: assets.length
        };
    }

    /**
     * Delete an asset
     */
    async deleteAsset(assetId, userId) {
        // Verify ownership
        const [asset] = await db.select().from(fixedAssets).where(
            and(eq(fixedAssets.id, assetId), eq(fixedAssets.userId, userId))
        );

        if (!asset) throw new Error('Asset not found or unauthorized');

        await db.delete(fixedAssets).where(eq(fixedAssets.id, assetId));

        eventBus.emit('ASSET_DELETED', { id: assetId, userId });

        return asset;
    }

    /**
     * Get asset by ID
     */
    async getAssetById(assetId, userId) {
        const asset = await db.query.fixedAssets.findFirst({
            where: and(eq(fixedAssets.id, assetId), eq(fixedAssets.userId, userId)),
            with: {
                valuations: {
                    orderBy: [desc(assetValuations.date)],
                    limit: 20
                }
            }
        });

        if (!asset) throw new Error('Asset not found');

        return asset;
    }

    /**
     * Update asset details
     */
    async updateAsset(assetId, userId, updates) {
        const [asset] = await db.select().from(fixedAssets).where(
            and(eq(fixedAssets.id, assetId), eq(fixedAssets.userId, userId))
        );

        if (!asset) throw new Error('Asset not found or unauthorized');

        const [updated] = await db.update(fixedAssets)
            .set({
                ...updates,
                updatedAt: new Date()
            })
            .where(eq(fixedAssets.id, assetId))
            .returning();

        eventBus.emit('ASSET_UPDATED', updated);

        return updated;
    }

    /**
     * Batch update asset valuations
     */
    async batchUpdateValuations(userId, getConversionRate, baseCurrencyCode) {
        const assets = await db.select().from(fixedAssets).where(eq(fixedAssets.userId, userId));

        const updates = assets.map(async (asset) => {
            const currency = asset.currency || 'USD';
            const rate = getConversionRate(currency);

            if (rate !== null) {
                const currentValue = parseFloat(asset.currentValue || 0);
                const baseValue = (currentValue * rate); // Parenthesis for clarity

                await db.update(fixedAssets)
                    .set({
                        baseCurrencyValue: baseValue.toFixed(2),
                        baseCurrencyCode: baseCurrencyCode,
                        valuationDate: new Date()
                    })
                    .where(eq(fixedAssets.id, asset.id));
            }
        });
        await Promise.all(updates);
    }
}

export default new AssetService();
