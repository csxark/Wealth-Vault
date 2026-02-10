
import db from '../config/db.js';
import { currencyWallets } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

class WalletService {
    /**
     * Create or retrieve a wallet for a specific currency
     */
    async getOrCreateWallet(userId, currency, vaultId = null) {
        let [wallet] = await db.select().from(currencyWallets).where(
            and(
                eq(currencyWallets.userId, userId),
                eq(currencyWallets.currency, currency.toUpperCase())
            )
        );

        if (!wallet) {
            [wallet] = await db.insert(currencyWallets).values({
                userId,
                currency: currency.toUpperCase(),
                vaultId,
                balance: '0',
                isDefault: currency.toUpperCase() === 'USD'
            }).returning();
        }

        return wallet;
    }

    /**
     * Update wallet balance atomically
     */
    async updateBalance(walletId, amount, tx = db) {
        return await tx.update(currencyWallets)
            .set({
                balance: sql`${currencyWallets.balance} + ${amount.toString()}`,
                updatedAt: new Date()
            })
            .where(eq(currencyWallets.id, walletId))
            .returning();
    }

    /**
     * Set default wallet
     */
    async setDefaultWallet(userId, walletId) {
        return await db.transaction(async (tx) => {
            // Unset current default
            await tx.update(currencyWallets)
                .set({ isDefault: false })
                .where(eq(currencyWallets.userId, userId));

            // Set new default
            return await tx.update(currencyWallets)
                .set({ isDefault: true })
                .where(eq(currencyWallets.id, walletId))
                .returning();
        });
    }

    /**
     * Get user net worth in base currency
     */
    async calculateNetWorth(userId, baseCurrency = 'USD') {
        const wallets = await db.select().from(currencyWallets).where(eq(currencyWallets.userId, userId));
        // Note: Real conversion logic would use FX rates table.
        // For now returning raw balances.
        return wallets.reduce((acc, w) => acc + parseFloat(w.balance), 0);
    }
}

export default new WalletService();
