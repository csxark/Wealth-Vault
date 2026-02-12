import AssetRepository from '../repositories/AssetRepository.js';

class AssetService {
    /**
     * Create a new fixed asset
     */
    async createAsset(userId, assetData) {
        const { name, category, purchasePrice, purchaseDate, currentValue, currency, location, description, appreciationRate, metadata } = assetData;

        const asset = await AssetRepository.create({
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
        });

        // Create initial valuation entry
        await this.addValuation(asset.id, currentValue || purchasePrice, 'manual');

        return asset;
    }

    /**
     * Get all assets for a user
     */
    async getUserAssets(userId) {
        const assets = await AssetRepository.findAll(userId);

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
        await AssetRepository.update(assetId, {
            currentValue: newValue.toString(),
            updatedAt: new Date()
        });

        // Log valuation history
        await this.addValuation(assetId, newValue, source);

        return await AssetRepository.findFirst(assetId);
    }

    /**
     * Add valuation entry
     */
    async addValuation(assetId, value, source = 'manual') {
        return await AssetRepository.addValuation({
            assetId,
            value: value.toString(),
            source
        });
    }

    /**
     * Apply appreciation/depreciation based on configured rate
     */
    async applyAppreciation(assetId) {
        const asset = await AssetRepository.findFirst(assetId);

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
        const assets = await AssetRepository.findSimpleAll(userId);

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
        const asset = await AssetRepository.delete(assetId, userId);

        if (!asset) throw new Error('Asset not found or unauthorized');

        return asset;
    }

    /**
     * Get asset by ID
     */
    async getAssetById(assetId, userId) {
        const asset = await AssetRepository.findById(assetId, userId);

        if (!asset) throw new Error('Asset not found');

        return asset;
    }

    /**
     * Update asset details
     */
    async updateAsset(assetId, userId, updates) {
        const asset = await AssetRepository.findFirst(assetId);

        if (!asset || asset.userId !== userId) throw new Error('Asset not found or unauthorized');

        return await AssetRepository.update(assetId, {
            ...updates,
            updatedAt: new Date()
        });
    }
}

export default new AssetService();
