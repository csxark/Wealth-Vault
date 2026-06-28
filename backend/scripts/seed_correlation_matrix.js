import db from '../config/db.js';
import { assetCorrelationMatrix } from '../db/schema.js';

/**
 * Seeding Script for Asset Correlation Matrix (#482)
 * Populates relationships between common ETFs and their proxy counterparts.
 */
async function seedCorrelations() {
    console.log('🌱 Seeding Asset Correlation Matrix...');

    const correlations = [
        // S&P 500 Proxies
        { base: 'SPY', proxy: 'VOO', coeff: 0.999, beta: 1.00 },
        { base: 'SPY', proxy: 'IVV', coeff: 0.999, beta: 1.00 },

        // Total Stock Market Proxies
        { base: 'VTI', proxy: 'SCHB', coeff: 0.995, beta: 1.01 },
        { base: 'VTI', proxy: 'ITOT', coeff: 0.994, beta: 1.00 },

        // Tech / Nasdaq Proxies
        { base: 'QQQ', proxy: 'VGT', coeff: 0.950, beta: 1.10 },
        { base: 'QQQ', proxy: 'XLK', coeff: 0.960, beta: 1.05 },

        // International Proxies
        { base: 'VXUS', proxy: 'IXUS', coeff: 0.990, beta: 1.00 },
        { base: 'VEA', proxy: 'IEFA', coeff: 0.985, beta: 0.99 },

        // Emerging Markets
        { base: 'VWO', proxy: 'IEMG', coeff: 0.970, beta: 0.98 },

        // Crypto Proxies (Rough correlations)
        { base: 'BTC', proxy: 'MARA', coeff: 0.850, beta: 2.50 },
        { base: 'BTC', proxy: 'MICROSTRATEGY', coeff: 0.920, beta: 1.80 }
    ];

    try {
        for (const c of correlations) {
            await db.insert(assetCorrelationMatrix).values({
                baseAssetSymbol: c.base,
                proxyAssetSymbol: c.proxy,
                correlationCoefficient: c.coeff.toString(),
                beta: c.beta.toString()
            }).onConflictDoUpdate({
                target: [assetCorrelationMatrix.baseAssetSymbol, assetCorrelationMatrix.proxyAssetSymbol],
                set: { correlationCoefficient: c.coeff.toString(), beta: c.beta.toString() }
            });
        }
        console.log('✅ Correlation Matrix seeded successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    }
}

// Check if run directly
if (import.meta.url.endsWith(process.argv[1])) {
    seedCorrelations();
}

export default seedCorrelations;
