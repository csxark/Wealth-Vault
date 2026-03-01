import { ApiResponse } from '../utils/ApiResponse.js';
import currencyService from '../services/currencyService.js';
import db from '../config/db.js';
import { vaultBalances } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

/**
 * Currency Validator Middleware (L3)
 * Ensures that multi-currency settlements have sufficient liquidity and valid corridors.
 */
export const validateSettlementLiquidity = async (req, res, next) => {
    const { fromEntityId, amountUSD, currency = 'USD' } = req.body;

    if (!fromEntityId || !amountUSD) {
        return new ApiResponse(400, null, 'Entity and amount are required for settlement').send(res);
    }

    try {
        // 1. Check aggregate liquidity across all vaults for the given entity
        const balances = await db.select({
            totalInUSD: sql`SUM(CASE 
                WHEN ${vaultBalances.currency} = 'USD' THEN ${vaultBalances.balance}
                ELSE ${vaultBalances.balance} * 1.0 -- Placeholder: in real system we'd join with rates
            END)`
        })
            .from(vaultBalances)
            .where(eq(vaultBalances.vaultId, fromEntityId)); // Simplified: using vaultId as proxy for entity account

        const totalAvailable = parseFloat(balances[0]?.totalInUSD || 0);

        if (totalAvailable < parseFloat(amountUSD)) {
            return new ApiResponse(403, {
                required: amountUSD,
                available: totalAvailable
            }, 'Insufficient liquidity for cross-entity settlement').send(res);
        }

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Currency Support Validator
 * Ensures that requested currencies are supported by the system
 */
export const validateCurrencySupport = (req, res, next) => {
    const { sourceCurrency, targetCurrency, currency } = req.body;
    
    // List of supported currencies (can be moved to config)
    const supportedCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'BTC', 'ETH'];
    
    const currenciesToCheck = [sourceCurrency, targetCurrency, currency].filter(Boolean);
    
    const unsupported = currenciesToCheck.filter(curr => !supportedCurrencies.includes(curr));
    
    if (unsupported.length > 0) {
        return new ApiResponse(400, {
            unsupportedCurrencies: unsupported,
            supportedCurrencies
        }, `Unsupported currency: ${unsupported.join(', ')}`).send(res);
    }
    
    next();
};
