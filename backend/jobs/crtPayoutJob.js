import cron from 'node-cron';
import db from '../config/db.js';
import { charitableTrusts, crtPayouts, vaults } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import vaultService from '../services/vaultService.js';

/**
 * CRT Payout Job (#535)
 * Monthly execution engine for Charitable Remainder Trust income interest.
 * Ensures the grantor receives their defined annuity/unitrust payout.
 */
class CRTPayoutJob {
    constructor() {
        this.task = null;
    }

    start() {
        // Run on the 1st of every month at 4:00 AM
        this.task = cron.schedule('0 4 1 * *', async () => {
            logInfo('[CRT Job] Processing monthly trust payouts');
            await this.executePayouts();
        });

        logInfo('[CRT Job] Charitable Payout service initialized (Monthly schedule)');
    }

    async executePayouts() {
        try {
            const activeTrusts = await db.select().from(charitableTrusts).where(eq(charitableTrusts.status, 'active'));

            for (const trust of activeTrusts) {
                logInfo(`[CRT Job] Processing payout for trust: ${trust.name}`);

                // Calculate Monthly Payout
                // For CRAT: fixed based on initial; For CRUT: based on current balance
                const annualMultiplier = parseFloat(trust.payoutRate);
                const annualAmount = trust.trustType === 'CRAT'
                    ? parseFloat(trust.initialContribution) * annualMultiplier
                    : parseFloat(trust.currentValue) * annualMultiplier;

                const monthlyAmount = annualAmount / 12;

                await db.transaction(async (tx) => {
                    // 1. Record Payout
                    await tx.insert(crtPayouts).values({
                        trustId: trust.id,
                        amount: monthlyAmount.toFixed(2),
                        payoutDate: new Date(),
                        taxCharacter: 'ordinary' // Simplified logic
                    });

                    // 2. Move Cash using Vault Service
                    // Funds move from CRT Vault to the user's main operational vault
                    const mainVault = await tx.query.vaults.findFirst({
                        where: and(eq(vaults.ownerId, trust.userId), eq(vaults.name, 'Main Operational Vault'))
                    });

                    if (mainVault && trust.vaultId) {
                        await vaultService.sweepCashToTarget(trust.userId, trust.vaultId, mainVault.id, monthlyAmount);
                    }

                    // 3. Update Current Value (Balance tracking)
                    const newValue = parseFloat(trust.currentValue) - monthlyAmount;
                    await tx.update(charitableTrusts)
                        .set({ currentValue: newValue.toFixed(2), updatedAt: new Date() })
                        .where(eq(charitableTrusts.id, trust.id));
                });
            }
        } catch (error) {
            logError('[CRT Job] Payout processing failing:', error);
        }
    }

    stop() {
        if (this.task) this.task.stop();
    }
}

export default new CRTPayoutJob();
