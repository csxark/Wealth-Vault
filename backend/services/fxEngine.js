import db from '../config/db.js';
import { fxTransactions, currencyWallets } from '../db/schema.js';
import walletService from './walletService.js';
import currencyService from './currencyService.js';
import { eq } from 'drizzle-orm';

class FXEngine {
    /**
     * Perform currency conversion
     */
    async convertCurrency(userId, { sourceCurrency, targetCurrency, amount }) {
        const sourceAmount = parseFloat(amount);

        // 1. Get Exchange Rate via CurrencyService (Standardized)
        // Uses DB cache or API fetch
        const rate = await currencyService.getExchangeRate(sourceCurrency, targetCurrency);
        if (!rate) throw new Error(`Exchange rate for ${sourceCurrency}/${targetCurrency} not found`);

        const feePercent = 0.005; // 0.5% standard fee
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
