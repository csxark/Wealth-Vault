
import db from '../config/db.js';
import { fxTransactions, fxRates, currencyWallets } from '../db/schema.js';
import walletService from './walletService.js';
import { eq, and } from 'drizzle-orm';

class FXEngine {
    /**
     * Perform currency conversion
     */
    async convertCurrency(userId, { sourceCurrency, targetCurrency, amount }) {
        const pair = `${sourceCurrency.toUpperCase()}/${targetCurrency.toUpperCase()}`;

        // 1. Get current exchange rate
        const [rateData] = await db.select().from(fxRates).where(eq(fxRates.pair, pair));
        if (!rateData) throw new Error(`Exchange rate for ${pair} not found`);

        const rate = parseFloat(rateData.rate);
        const feePercent = 0.005; // 0.5% standard fee
        const sourceAmount = parseFloat(amount);
        const targetAmount = sourceAmount * rate * (1 - feePercent);
        const fee = sourceAmount * rate * feePercent;

        return await db.transaction(async (tx) => {
            // 2. Load/Create wallets
            const sourceWallet = await walletService.getOrCreateWallet(userId, sourceCurrency);
            const targetWallet = await walletService.getOrCreateWallet(userId, targetCurrency);

            if (parseFloat(sourceWallet.balance) < sourceAmount) {
                throw new Error('Insufficient funds in source wallet');
            }

            // 3. Update balances
            await walletService.updateBalance(sourceWallet.id, -sourceAmount, tx);
            await walletService.updateBalance(targetWallet.id, targetAmount, tx);

            // 4. Record transaction
            const [transaction] = await tx.insert(fxTransactions).values({
                userId,
                sourceWalletId: sourceWallet.id,
                targetWalletId: targetWallet.id,
                sourceCurrency,
                targetCurrency,
                sourceAmount: sourceAmount.toString(),
                targetAmount: targetAmount.toString(),
                exchangeRate: rate.toString(),
                fee: fee.toString(),
                status: 'completed'
            }).returning();

            return transaction;
        });
    }

    /**
     * Get transaction history
     */
    async getHistory(userId) {
        return await db.select().from(fxTransactions)
            .where(eq(fxTransactions.userId, userId))
            .orderBy(fxTransactions.createdAt);
    }
}

export default new FXEngine();
