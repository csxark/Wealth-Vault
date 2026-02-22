import db from '../config/db.js';
import { internalClearingLogs, liquidityPools, bankAccounts, marketRatesOracle } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import { calculateOffsetSavings } from '../utils/settlementMath.js';

/**
 * FX Settlement Service (#455)
 * Manages internal "Ledger Offsetting" to zero out cross-currency movements.
 */
class FXSettlement {
    /**
     * Execute an internal settlement between two vaults
     */
    async settleInternally(userId, fromVaultId, toVaultId, fromCurrency, toCurrency, amount) {
        logInfo(`[FX Settlement] Initiating internal clearing: ${amount} ${fromCurrency} -> ${toCurrency}`);

        try {
            return await db.transaction(async (tx) => {
                // 1. Get real-time rate from oracle
                const [rateData] = await tx.select().from(marketRatesOracle).where(and(
                    eq(marketRatesOracle.baseCurrency, fromCurrency),
                    eq(marketRatesOracle.quoteCurrency, toCurrency)
                ));

                const rate = rateData ? parseFloat(rateData.midRate) : 1.0; // Fallback to 1.0 for same currency
                const settledAmount = amount * rate;

                // 2. Validate Liquidity in the 'from' pool
                const [pool] = await tx.select().from(liquidityPools).where(and(
                    eq(liquidityPools.userId, userId),
                    eq(liquidityPools.currencyCode, fromCurrency)
                ));

                if (!pool || parseFloat(pool.totalBalance) < amount) {
                    throw new Error(`Insufficient internal liquidity in ${fromCurrency} pool for offset settlement.`);
                }

                // 3. Update Bank Accounts (The Ledger moves)
                // Deduct from source
                await tx.update(bankAccounts)
                    .set({ balance: sql`balance - ${amount}` })
                    .where(and(eq(bankAccounts.id, fromVaultId), eq(bankAccounts.userId, userId)));

                // Add to destination
                await tx.update(bankAccounts)
                    .set({ balance: sql`balance + ${settledAmount}` })
                    .where(and(eq(bankAccounts.id, toVaultId), eq(bankAccounts.userId, userId)));

                // 4. Calculate Savings (Spread avoided)
                const savings = calculateOffsetSavings(amount, rate);

                // 5. Log internal clearing
                const [log] = await tx.insert(internalClearingLogs).values({
                    userId,
                    fromVaultId,
                    toVaultId,
                    fromCurrency,
                    toCurrency,
                    amountOrig: amount.toString(),
                    amountSettled: settledAmount.toString(),
                    appliedExchangeRate: rate.toString(),
                    savingsVsMarket: savings.toString(),
                    settlementStatus: 'completed',
                    clearingMethod: 'ledger_offset'
                }).returning();

                logInfo(`[FX Settlement] Settlement successful. Internal Savings: ${savings}`);

                return {
                    settledAmount,
                    appliedRate: rate,
                    savings,
                    clearingId: log.id
                };
            });
        } catch (error) {
            logError(`[FX Settlement] Internal settlement failed:`, error);
            throw error;
        }
    }
}

export default new FXSettlement();
