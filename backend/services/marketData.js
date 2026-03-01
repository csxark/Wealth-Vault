import db from '../config/db.js';
import { marketIndices } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import axios from 'axios';

class MarketDataService {
    constructor() {
        // Default indices with historical averages
        this.defaultIndices = [
            { name: 'S&P500', avgAnnualReturn: 10.5, volatility: 16.5 },
            { name: 'Gold', avgAnnualReturn: 3.5, volatility: 18.0 },
            { name: 'RealEstate_US', avgAnnualReturn: 4.8, volatility: 12.0 },
            { name: 'Bonds_10Y', avgAnnualReturn: 5.2, volatility: 7.5 },
            { name: 'Bitcoin', avgAnnualReturn: 45.0, volatility: 75.0 },
            { name: 'NASDAQ', avgAnnualReturn: 12.3, volatility: 20.0 }
        ];
    }

    /**
     * Initialize default market indices
     */
    async initializeDefaults() {
        for (const index of this.defaultIndices) {
            await db.insert(marketIndices)
                .values({
                    name: index.name,
                    avgAnnualReturn: index.avgAnnualReturn.toString(),
                    volatility: index.volatility.toString(),
                    lastUpdated: new Date()
                })
                .onConflictDoNothing();
        }
        console.log('[Market Data] Default indices initialized');
    }

    /**
     * Fetch real-time data from external APIs (optional)
     */
    async updateMarketData() {
        try {
            // Example: Alpha Vantage or Yahoo Finance API
            // For demo, we'll simulate with slight random variations
            const indices = await db.select().from(marketIndices);

            for (const index of indices) {
                // Simulate minor fluctuations
                const currentReturn = parseFloat(index.avgAnnualReturn);
                const drift = (Math.random() - 0.5) * 0.5; // +/- 0.25%

                await db.update(marketIndices)
                    .set({
                        currentValue: (currentReturn + drift).toString(),
                        lastUpdated: new Date()
                    })
                    .where(eq(marketIndices.id, index.id));
            }

            console.log('[Market Data] Indices updated');
        } catch (error) {
            console.error('[Market Data] Update failed:', error.message);
        }
    }

    /**
     * Get index data by name
     */
    async getIndexByName(name) {
        const [index] = await db.select().from(marketIndices).where(eq(marketIndices.name, name));
        return index;
    }

    /**
     * Get all indices
     */
    async getAllIndices() {
        return await db.select().from(marketIndices);
    }

    /**
     * Get sector-specific growth rates
     */
    async getSectorGrowthRate(assetCategory) {
        const mapping = {
            'real_estate': 'RealEstate_US',
            'vehicle': 'RealEstate_US', // Depreciates, but use as baseline
            'jewelry': 'Gold',
            'art': 'S&P500',
            'collectible': 'Gold',
            'stock': 'S&P500',
            'crypto': 'Bitcoin'
        };

        const indexName = mapping[assetCategory] || 'S&P500';
        const index = await this.getIndexByName(indexName);

        return index ? {
            annualReturn: parseFloat(index.avgAnnualReturn),
            volatility: parseFloat(index.volatility)
        } : { annualReturn: 0, volatility: 0 };
    }

    /**
     * Calculate expected return for a portfolio
     */
    calculatePortfolioReturn(assetAllocation) {
        // assetAllocation: { 'S&P500': 60, 'Bonds_10Y': 30, 'Gold': 10 }
        let weightedReturn = 0;
        let totalWeight = 0;

        for (const [indexName, weight] of Object.entries(assetAllocation)) {
            weightedReturn += weight * (this.defaultIndices.find(i => i.name === indexName)?.avgAnnualReturn || 0);
            totalWeight += weight;
        }

        return totalWeight > 0 ? weightedReturn / totalWeight : 0;
    }
}

export default new MarketDataService();
