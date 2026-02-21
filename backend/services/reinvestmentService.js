import db from '../config/db.js';
import { assetProxyMappings, investments } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Reinvestment Service (L3)
 * Logic to identify "Market-Proxy" assets (e.g., swapping BTC for a BTC-ETF) 
 * to maintain exposure while realizing losses without violating Wash Sale rules.
 */
class ReinvestmentService {
    /**
     * Get proxy asset for a given symbol
     */
    async getProxyAsset(symbol) {
        const mapping = await db.query.assetProxyMappings.findFirst({
            where: and(
                eq(assetProxyMappings.originalSymbol, symbol),
                eq(assetProxyMappings.isActive, true)
            ),
            orderBy: [sql`${assetProxyMappings.correlationCoefficient} DESC`]
        });

        if (mapping) return mapping;

        // Fallback defaults if no DB mapping exists
        const fallbacks = {
            'BTC': { proxySymbol: 'IBIT', proxyType: 'ETF', correlation: 0.98 },
            'ETH': { proxySymbol: 'ETHE', proxyType: 'ETF', correlation: 0.95 },
            'SPY': { proxySymbol: 'VOO', proxyType: 'ETF', correlation: 0.99 },
            'QQQ': { proxySymbol: 'VGT', proxyType: 'ETF', correlation: 0.92 },
            'AAPL': { proxySymbol: 'XLK', proxyType: 'ETF', correlation: 0.85 }
        };

        return fallbacks[symbol] || null;
    }

    /**
     * Add or update proxy mapping
     */
    async updateProxyMapping(originalSymbol, proxySymbol, type, correlation) {
        const [mapping] = await db.insert(assetProxyMappings).values({
            originalSymbol,
            proxySymbol,
            proxyType: type,
            correlationCoefficient: correlation.toString()
        }).onConflictDoUpdate({
            target: assetProxyMappings.originalSymbol,
            set: {
                proxySymbol,
                proxyType: type,
                correlationCoefficient: correlation.toString(),
                lastUpdated: new Date()
            }
        }).returning();

        return mapping;
    }

    /**
     * Execute Proxy Reinvestment
     * In a real app, this would trigger a buy order for the proxy asset
     */
    async executeProxyReinvestment(userId, originalSymbol, amount) {
        const proxy = await this.getProxyAsset(originalSymbol);

        if (!proxy) {
            logInfo(`[Reinvestment Service] No suitable proxy found for ${originalSymbol}. Reinvesting in Cash.`);
            return { symbol: 'CASH', amount, type: 'CASH' };
        }

        logInfo(`[Reinvestment Service] Rotating $${amount} from ${originalSymbol} into proxy ${proxy.proxySymbol} (${proxy.proxyType})`);

        return {
            symbol: proxy.proxySymbol,
            amount,
            type: proxy.proxyType,
            correlation: proxy.correlationCoefficient
        };
    }

    /**
     * Global Proxy Sync
     * Syncs new proxy offerings (e.g., new Spot ETFs)
     */
    async syncMarketProxies() {
        // Implementation for syncing with market data providers
        const newProxies = [
            { originalSymbol: 'BTC', proxySymbol: 'FBTC', proxyType: 'ETF', correlation: 0.98 },
            { originalSymbol: 'ETH', proxySymbol: 'ETHW', proxyType: 'ETF', correlation: 0.94 }
        ];

        for (const p of newProxies) {
            await this.updateProxyMapping(p.originalSymbol, p.proxySymbol, p.proxyType, p.correlation);
        }

        return newProxies.length;
    }
}

export default new ReinvestmentService();
