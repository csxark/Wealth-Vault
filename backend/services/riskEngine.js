import db from '../config/db.js';
import { currencyWallets, fixedAssets, marketIndices } from '../db/schema.js';
import { eq } from 'drizzle-orm';

class RiskEngine {
    /**
     * Calculate Value-at-Risk (VaR) for a user's portfolio
     * Returns the 95% confidence max loss over 1 day
     */
    async calculatePortfolioVaR(userId) {
        const wallets = await db.query.currencyWallets.findMany({ where: eq(currencyWallets.userId, userId) });
        const assets = await db.query.fixedAssets.findMany({ where: eq(fixedAssets.userId, userId) });

        let totalValue = 0;
        wallets.forEach(w => totalValue += parseFloat(w.balance || 0));
        assets.forEach(a => totalValue += parseFloat(a.currentValue || 0));

        if (totalValue === 0) return 0;

        // Weighted Average Volatility (Mocking asset-specific vol)
        const assetsVol = 0.18; // Fixed assets typically higher vol
        const cashVol = 0.02;   // Cash vol typically low (FX risk only)

        const weightedVol = ((totalValue * 0.2) * assetsVol + (totalValue * 0.8) * cashVol) / totalValue;

        // Parametric VaR (1.65 for 95% confidence)
        // VaR = Value * Volatility * 1.65 * sqrt(1/252) for 1 day
        const dailyVol = weightedVol / Math.sqrt(252);
        const var95 = totalValue * dailyVol * 1.65;

        return {
            amount: parseFloat(var95.toFixed(2)),
            percentage: parseFloat(((var95 / totalValue) * 100).toFixed(2)),
            confidence: 95,
            horizon: '1 day'
        };
    }

    /**
     * Calculate Portfolio Beta relative to S&P500
     */
    async calculatePortfolioBeta(userId) {
        const assets = await db.query.fixedAssets.findMany({ where: eq(fixedAssets.userId, userId) });

        if (assets.length === 0) return 1.0; // Default to market beta if no specific assets

        // Categorize assets to weigh beta
        let totalWeight = 0;
        let weightedBeta = 0;

        assets.forEach(asset => {
            const val = parseFloat(asset.currentValue);
            totalWeight += val;

            // Asset category betas
            let beta = 1.0;
            switch (asset.category) {
                case 'real_estate': beta = 0.6; break;
                case 'jewelry': beta = 0.3; break;
                case 'crypto': beta = 2.5; break;
                case 'vehicle': beta = 0.1; break;
                default: beta = 1.0;
            }
            weightedBeta += (val * beta);
        });

        return parseFloat((weightedBeta / totalWeight).toFixed(2));
    }
}

export default new RiskEngine();
