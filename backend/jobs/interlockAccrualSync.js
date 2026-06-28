import cron from 'node-cron';
import db from '../config/db.js';
import { internalDebts, economicVolatilityIndices } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Daily job to sync interest accruals for internal vault-to-vault lending.
 * Implements simple daily compounding for active internal loans.
 */
class InterlockAccrualSync {
    init() {
        // Run daily at midnight
        cron.schedule('0 0 * * *', async () => {
            await this.execute();
        });
    }

    async execute() {
        console.log('[AccrualSync] Starting internal debt accrual sync...');
        const now = new Date();

        try {
            // Fetch all active internal debts
            const activeDebts = await db.select().from(internalDebts).where(eq(internalDebts.status, 'active'));

            // Fetch latest macro indices for floating rates
            const macroIndices = await db.select().from(economicVolatilityIndices);
            const indexMap = Object.fromEntries(macroIndices.map(idx => [idx.indexName, parseFloat(idx.currentValue)]));

            console.log(`[AccrualSync] Found ${activeDebts.length} active internal debts.`);

            for (const debt of activeDebts) {
                const lastAccrual = new Date(debt.lastAccrualDate || debt.createdAt);
                const timeDiff = now.getTime() - lastAccrual.getTime();
                const daysSince = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

                if (daysSince > 0) {
                    let annualRate;
                    if (debt.rateType === 'floating' && debt.indexSource && indexMap[debt.indexSource] !== undefined) {
                        const baseIndex = indexMap[debt.indexSource];
                        const spread = parseFloat(debt.interestSpread || '0');
                        annualRate = (baseIndex + spread) / 100;
                        console.log(`[AccrualSync] Debt ${debt.id} using floating rate: ${baseIndex}% + ${spread}% spread = ${annualRate * 100}%`);
                    } else {
                        annualRate = parseFloat(debt.interestRate) / 100;
                    }

                    const dailyRate = annualRate / 365;
                    const principal = parseFloat(debt.principalAmount);
                    const currentBalance = parseFloat(debt.currentBalance);

                    // Calculate new balance with daily compounding
                    const newBalance = currentBalance * Math.pow(1 + dailyRate, daysSince);
                    const totalAccrued = newBalance - principal;

                    await db.update(internalDebts)
                        .set({
                            currentBalance: newBalance.toFixed(8),
                            accruedInterest: totalAccrued.toFixed(8),
                            lastAccrualDate: now,
                            updatedAt: now,
                            metadata: {
                                ...debt.metadata,
                                lastAccrualCalculation: {
                                    date: now.toISOString(),
                                    daysCalculated: daysSince,
                                    previousBalance: currentBalance.toFixed(8),
                                    accrualAmount: (newBalance - currentBalance).toFixed(8),
                                    appliedRate: (annualRate * 100).toFixed(4) + '%'
                                }
                            }
                        })
                        .where(eq(internalDebts.id, debt.id));

                    console.log(`[AccrualSync] Updated debt ${debt.id} (${debt.borrowerVaultId}): New Balance ${newBalance.toFixed(2)}`);
                }
            }

            console.log('[AccrualSync] Internal debt accrual sync completed successfully.');
        } catch (error) {
            console.error('[AccrualSync] Error during internal debt accrual sync:', error);
        }
    }
}

export default new InterlockAccrualSync();
