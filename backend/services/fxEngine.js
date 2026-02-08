import db from '../config/db.js';
import { fxRates, fxTransactions, currencyWallets } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import walletService from './walletService.js';

class FXEngine {
    /**
     * Convert currency between wallets
     */
    async convertCurrency(userId, sourceCurrency, targetCurrency, amount, metadata = {}) {
        const pair = `${sourceCurrency.toUpperCase()}/${targetCurrency.toUpperCase()}`;
        const inversePair = `${targetCurrency.toUpperCase()}/${sourceCurrency.toUpperCase()}`;

        // Get live rate
        let rateData = await db.query.fxRates.findFirst({
            where: eq(fxRates.pair, pair)
        });

        let rate;
        if (rateData) {
            rate = parseFloat(rateData.rate);
        } else {
            // Try inverse
            const inverseRateData = await db.query.fxRates.findFirst({
                where: eq(fxRates.pair, inversePair)
            });
            if (!inverseRateData) throw new Error(`Exchange rate for ${pair} not available`);
            rate = 1 / parseFloat(inverseRateData.rate);
        }

        // Wallets
        const sourceWallet = await walletService.getWallet(userId, sourceCurrency);
        let targetWallet = await walletService.getWallet(userId, targetCurrency);

        if (!sourceWallet || parseFloat(sourceWallet.balance) < amount) {
            throw new Error('Insufficient balance in source wallet');
        }

        if (!targetWallet) {
            // Auto-create wallet if target currency doesn't exist for user
            targetWallet = await walletService.createWallet(userId, targetCurrency);
        }

        const targetAmount = amount * rate;
        const fee = amount * 0.001; // 0.1% fee base cost

        // Execute atomic transaction
        return await db.transaction(async (tx) => {
            // 1. Deduct from source
            await tx.update(currencyWallets)
                .set({
                    balance: sql`${currencyWallets.balance} - ${amount.toString()}`,
                    updatedAt: new Date()
                })
                .where(eq(currencyWallets.id, sourceWallet.id));

            // 2. Add to target (minus fee)
            const afterFee = targetAmount - (fee * rate);
            await tx.update(currencyWallets)
                .set({
                    balance: sql`${currencyWallets.balance} + ${afterFee.toFixed(8)}`,
                    updatedAt: new Date()
                })
                .where(eq(currencyWallets.id, targetWallet.id));

            // 3. Record transaction
            const [transaction] = await tx.insert(fxTransactions).values({
                userId,
                sourceWalletId: sourceWallet.id,
                targetWalletId: targetWallet.id,
                sourceCurrency: sourceCurrency.toUpperCase(),
                targetCurrency: targetCurrency.toUpperCase(),
                sourceAmount: amount.toString(),
                targetAmount: afterFee.toFixed(8),
                exchangeRate: rate.toFixed(8),
                fee: fee.toFixed(2),
                status: 'completed',
                metadata
            }).returning();

            return transaction;
        });
    }

    /**
     * Fetch all live rates
     */
    async getLiveRates() {
        return await db.query.fxRates.findMany();
    }

    /**
     * Get specific pair rate
     */
    async getRate(pair) {
        return await db.query.fxRates.findFirst({
            where: eq(fxRates.pair, pair.toUpperCase())
        });
    }
}

export default new FXEngine();
