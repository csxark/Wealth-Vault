import db from '../config/db.js';
import { currencyWallets } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

class WalletService {
    /**
     * Get all wallets for a user
     */
    async getUserWallets(userId) {
        return await db.query.currencyWallets.findMany({
            where: eq(currencyWallets.userId, userId),
            orderBy: (currencyWallets, { desc }) => [desc(currencyWallets.isDefault)]
        });
    }

    /**
     * Get specific wallet by ID or Currency
     */
    async getWallet(userId, currencyOrId) {
        if (!currencyOrId) return null;

        // Check if it's a UUID (ID)
        const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(currencyOrId);

        if (isUuid) {
            return await db.query.currencyWallets.findFirst({
                where: and(
                    eq(currencyWallets.userId, userId),
                    eq(currencyWallets.id, currencyOrId)
                )
            });
        }

        // Otherwise treat as currency code
        return await db.query.currencyWallets.findFirst({
            where: and(
                eq(currencyWallets.userId, userId),
                eq(currencyWallets.currency, currencyOrId.toUpperCase())
            )
        });
    }

    /**
     * Create a new wallet
     */
    async createWallet(userId, currency, isDefault = false) {
        // Check if wallet already exists
        const existing = await this.getWallet(userId, currency);
        if (existing) return existing;

        // If setting as default, unset other defaults
        if (isDefault) {
            await db.update(currencyWallets)
                .set({ isDefault: false })
                .where(eq(currencyWallets.userId, userId));
        }

        const [wallet] = await db.insert(currencyWallets).values({
            userId,
            currency: currency.toUpperCase(),
            balance: '0',
            isDefault
        }).returning();

        return wallet;
    }

    /**
     * Update balance with sub-millisecond precision logic
     */
    async updateBalance(walletId, amount, type = 'add') {
        const amountStr = amount.toString();
        const sign = type === 'add' ? '+' : '-';

        return await db.update(currencyWallets)
            .set({
                balance: sql`${currencyWallets.balance} ${sql.raw(sign)} ${amountStr}`,
                updatedAt: new Date()
            })
            .where(eq(currencyWallets.id, walletId))
            .returning();
    }

    /**
     * Ensure user has at least a default USD wallet
     */
    async ensureBaseWallets(userId) {
        const wallets = await this.getUserWallets(userId);
        if (wallets.length === 0) {
            const usdWallet = await this.createWallet(userId, 'USD', true);
            return [usdWallet];
        }
        return wallets;
    }
}

export default new WalletService();
