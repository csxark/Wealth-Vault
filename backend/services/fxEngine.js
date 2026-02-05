import db from '../config/db.js';
import { currencyWallets, fxTransactions, fxRates, users } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import axios from 'axios';

class FxEngine {
    constructor() {
        this.basePairs = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'BTC', 'ETH'];
        this.mockVolatility = false;
    }

    /**
     * updateRates: Fetches and updates real-time rates
     * For demo purposes, we might simulate volatility if no API key
     */
    async updateRates() {
        try {
            // In production, use a real provider like Fixer.io or CoinGecko
            // Here we use a free public API
            const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
            const rates = response.data.rates; // Base USD

            const timestamp = new Date();

            for (const [currency, rate] of Object.entries(rates)) {
                if (!this.basePairs.includes(currency)) continue;

                // Calculate pair string e.g., 'USD/EUR'
                const pair = `USD/${currency}`;
                const inversePair = `${currency}/USD`;
                const inverseRate = 1 / rate;

                await this.upsertRate(pair, rate, timestamp);
                // We might not need to store inverse if we calculate on fly, but good for caching
                if (currency !== 'USD') {
                    await this.upsertRate(inversePair, inverseRate, timestamp);
                }
            }

            // Generate cross rates for arbitrage detection (e.g., EUR/GBP)
            await this.generateCrossRates(rates, timestamp);

            console.log(`[FX Engine] Rates updated at ${timestamp.toISOString()}`);
            return true;
        } catch (error) {
            console.error('[FX Engine] Rate update failed:', error.message);
            return false;
        }
    }

    async upsertRate(pair, rate, timestamp) {
        // Calculate volatility (mock or based on history)
        const volatility = Math.random() * 0.5; // Mock 0-0.5% volatility

        await db.insert(fxRates)
            .values({
                pair,
                rate: rate.toString(),
                lastUpdated: timestamp,
                volatility: volatility.toString()
            })
            .onConflictDoUpdate({
                target: fxRates.pair,
                set: {
                    rate: rate.toString(),
                    lastUpdated: timestamp,
                    volatility: volatility.toString() // Update with new calc
                }
            });
    }

    async generateCrossRates(usdRates, timestamp) {
        // EUR/GBP = (USD/GBP) / (USD/EUR)
        const crosses = [
            ['EUR', 'GBP'], ['EUR', 'INR'], ['GBP', 'INR'],
            ['BTC', 'USD'], ['BTC', 'EUR'], ['ETH', 'USD']
        ];

        for (const [base, quote] of crosses) {
            if (usdRates[base] && usdRates[quote]) {
                const rate = usdRates[quote] / usdRates[base];
                await this.upsertRate(`${base}/${quote}`, rate, timestamp);
            }
        }
    }

    /**
     * executeSwap: Atomic transaction to swap currencies
     */
    async executeSwap(userId, sourceCurrency, targetCurrency, amount, vaultId = null) {
        if (sourceCurrency === targetCurrency) throw new Error("Cannot swap same currency");

        // 1. Get Rate
        // Try direct pair
        let pair = `${sourceCurrency}/${targetCurrency}`;
        let rateRecord = await db.query.fxRates.findFirst({ where: eq(fxRates.pair, pair) });

        let rate;
        if (rateRecord) {
            rate = parseFloat(rateRecord.rate);
        } else {
            // Try inverse
            pair = `${targetCurrency}/${sourceCurrency}`;
            rateRecord = await db.query.fxRates.findFirst({ where: eq(fxRates.pair, pair) });
            if (!rateRecord) throw new Error(`No rate available for ${sourceCurrency}/${targetCurrency}`);
            rate = 1 / parseFloat(rateRecord.rate);
        }

        const targetAmount = amount * rate;
        // Mock fee 0.1%
        const fee = targetAmount * 0.001;
        const finalAmount = targetAmount - fee;

        return await db.transaction(async (tx) => {
            // 2. Check Balance & Deduct Source
            const sourceWallet = await this.getOrCreateWallet(tx, userId, sourceCurrency, vaultId);

            if (parseFloat(sourceWallet.balance) < amount) {
                throw new Error(`Insufficient ${sourceCurrency} balance`);
            }

            await tx.update(currencyWallets)
                .set({ balance: sql`balance - ${amount}`, updatedAt: new Date() })
                .where(eq(currencyWallets.id, sourceWallet.id));

            // 3. Add to Target
            const targetWallet = await this.getOrCreateWallet(tx, userId, targetCurrency, vaultId);

            await tx.update(currencyWallets)
                .set({ balance: sql`balance + ${finalAmount}`, updatedAt: new Date() })
                .where(eq(currencyWallets.id, targetWallet.id));

            // 4. Record Transaction
            const [transaction] = await tx.insert(fxTransactions).values({
                userId,
                sourceWalletId: sourceWallet.id,
                targetWalletId: targetWallet.id,
                sourceCurrency,
                targetCurrency,
                sourceAmount: amount.toString(),
                targetAmount: finalAmount.toString(),
                exchangeRate: rate.toString(),
                fee: fee.toString(),
                status: 'completed'
            }).returning();

            return transaction;
        });
    }

    async getOrCreateWallet(tx, userId, currency, vaultId) {
        const whereClause = vaultId
            ? and(eq(currencyWallets.vaultId, vaultId), eq(currencyWallets.currency, currency))
            : and(eq(currencyWallets.userId, userId), eq(currencyWallets.currency, currency), sql`vault_id IS NULL`);

        let [wallet] = await tx.select().from(currencyWallets).where(whereClause);

        if (!wallet) {
            [wallet] = await tx.insert(currencyWallets).values({
                userId,
                vaultId,
                currency,
                balance: '0'
            }).returning();
        }
        return wallet;
    }

    async getBalances(userId, vaultId = null) {
        const whereClause = vaultId
            ? and(eq(currencyWallets.vaultId, vaultId))
            : and(eq(currencyWallets.userId, userId), sql`vault_id IS NULL`);

        return await db.select().from(currencyWallets).where(whereClause);
    }
}

export default new FxEngine();
