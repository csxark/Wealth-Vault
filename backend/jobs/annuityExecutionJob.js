import cron from 'node-cron';
import db from '../config/db.js';
import { trustStructures, vaults } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import vaultService from '../services/vaultService.js';
import ledgerService from '../services/ledgerService.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Annuity Execution Job (#511)
 * Coordinates the required annual annuity payouts from GRATs back to the Grantor.
 * This is a critical legal requirement to maintain the trust's tax-exempt status.
 * Runs daily to check for trusts reaching their anniversary date.
 */
class AnnuityExecutionJob {
    constructor() {
        this.task = null;
    }

    start() {
        // Run daily at 1:00 AM
        this.task = cron.schedule('0 1 * * *', async () => {
            logInfo('[Annuity Job] Checking for pending trust annuity payouts');
            await this.processAnnuities();
        });

        logInfo('[Annuity Job] Annuity Execution service started (Daily schedule)');
    }

    async processAnnuities() {
        try {
            // 1. Fetch active GRATs that haven't expired
            const activeGRATs = await db.select().from(trustStructures).where(
                and(
                    eq(trustStructures.trustType, 'GRAT'),
                    eq(trustStructures.status, 'active')
                )
            );

            const today = new Date();

            for (const trust of activeGRATs) {
                const createdAt = new Date(trust.createdAt);

                // Check if it's the anniversary day (simplified for demo)
                // In production, we'd check if (today - createdAt) is a multiple of 1 year
                const isAnniversary = today.getMonth() === createdAt.getMonth() && today.getDate() === createdAt.getDate();

                if (isAnniversary) {
                    await this.executePayout(trust);
                }
            }
        } catch (error) {
            logError('[Annuity Job] Batch processing failed:', error);
        }
    }

    /**
     * Executes the actual fund movement for a single trust.
     */
    async executePayout(trust) {
        logInfo(`[Annuity Job] Executing payout for trust: ${trust.trustName}`);

        try {
            const amount = parseFloat(trust.initialFundingAmount) * (parseFloat(trust.annuityPayoutPrc) / 100);

            // 1. Find Grantor's target vault (usually a personal cash vault)
            const grantorVault = await db.query.vaults.findFirst({
                where: and(
                    eq(vaults.ownerId, trust.userId),
                    eq(vaults.name, 'Personal Cash Vault') // Standard convention
                )
            });

            if (!grantorVault || !trust.annuityPayerVaultId) {
                logError(`[Annuity Job] Skip trust ${trust.id}: Missing source or target vault`);
                return;
            }

            // 2. Move funds
            await vaultService.sweepCashToTarget(
                trust.userId,
                trust.annuityPayerVaultId,
                grantorVault.id,
                amount
            );

            logInfo(`[Annuity Job] Payout Successful: $${amount} moved to ${grantorVault.name}`);

            // 3. Update trust metadata with payout log
            const history = trust.metadata.payoutHistory || [];
            history.push({
                date: new Date(),
                amount,
                status: 'success'
            });

            await db.update(trustStructures)
                .set({ metadata: { ...trust.metadata, payoutHistory: history } })
                .where(eq(trustStructures.id, trust.id));

        } catch (error) {
            logError(`[Annuity Job] Individual payout failed for ${trust.id}:`, error);
        }
    }

    stop() {
        if (this.task) this.task.stop();
    }
}

export default new AnnuityExecutionJob();
