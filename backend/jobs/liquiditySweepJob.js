import cron from 'node-cron';
import db from '../config/db.js';
import { internalDebts, vaultBalances } from '../db/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import interlockService from '../services/interlockService.js';

/**
 * Liquidity Sweep Job (#467)
 * Nightly job to automatically settle internal debts when vaults have surplus cash.
 */
class LiquiditySweepJob {
    init() {
        // Run daily at 1 AM
        cron.schedule('0 1 * * *', async () => {
            console.log('--- Starting Liquidity Sweep Job ---');
            await this.execute();
            console.log('--- Liquidity Sweep Job Completed ---');
        });
    }

    async execute() {
        try {
            // 1. Fetch all active internal debts ordered by priority (highest first)
            const activeDebts = await db.select().from(internalDebts)
                .where(eq(internalDebts.status, 'active'))
                .orderBy(desc(internalDebts.repaymentPriority));

            if (activeDebts.length === 0) return;

            // 2. Group by borrower vault
            const borrowerVaults = [...new Set(activeDebts.map(d => d.borrowerVaultId))];

            for (const vaultId of borrowerVaults) {
                // Fetch vault balance and debts for this specific vault
                const debtsForVault = activeDebts.filter(d => d.borrowerVaultId === vaultId);
                const userId = debtsForVault[0].userId;

                const [vBalance] = await db.select().from(vaultBalances)
                    .where(and(eq(vaultBalances.vaultId, vaultId), eq(vaultBalances.userId, userId)));

                if (!vBalance) continue;

                let availableSweepCash = parseFloat(vBalance.balance);

                // Process each debt in order of priority
                for (const debt of debtsForVault) {
                    const threshold = parseFloat(debt.autoSweepThreshold || '0');
                    const balanceToRepay = parseFloat(debt.currentBalance);

                    // Only sweep if the cash exceeds the specific threshold for this debt repayment
                    if (availableSweepCash > threshold) {
                        const sweepAmount = Math.min(availableSweepCash - threshold, balanceToRepay);

                        if (sweepAmount > 0.00000001) { // Threshold for tiny amounts
                            console.log(`Auto-Sweeping ${sweepAmount.toFixed(8)} from Vault ${vaultId} to settle Debt ${debt.id} (Priority ${debt.repaymentPriority})`);
                            try {
                                await interlockService.recordRepayment(userId, debt.id, sweepAmount);
                                availableSweepCash -= sweepAmount;
                            } catch (error) {
                                console.error(`Error auto-sweeping debt ${debt.id}:`, error);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Fatal error in Liquidity Sweep Job:', error);
        }
    }
}

export default new LiquiditySweepJob();
