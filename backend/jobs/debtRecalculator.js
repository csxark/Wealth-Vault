import cron from 'node-cron';
import db from '../config/db.js';
import { debts, users } from '../db/schema.js';
import refinanceScout from '../services/refinanceScout.js';
import debtEngine from '../services/debtEngine.js';
import { logInfo, logError } from '../utils/logger.js';
import auditService from '../services/auditService.js';

/**
 * Debt Recalculator Job (L3)
 * Nightly job to update "Arbitrage Alpha" as global interest rates fluctuate.
 */
class DebtRecalculator {
    startScheduledJob() {
        // Run at 2 AM daily
        cron.schedule('0 2 * * *', async () => {
            logInfo('[Debt Recalculator] Starting nightly scan...');
            await this.scanAllUsers();
        });
    }

    async scanAllUsers() {
        try {
            const allUsers = await db.select().from(users);

            for (const user of allUsers) {
                // 1. Scan for refinance opportunities based on current market rates
                const proposals = await refinanceScout.scanForRefinance(user.id);

                if (proposals.length > 0) {
                    await auditService.logAuditEvent({
                        userId: user.id,
                        action: 'REFINANCE_SCAN_COMPLETED',
                        resourceType: 'debt',
                        metadata: { proposalsFound: proposals.length }
                    });
                }

                // 2. Perform amortization updates for all active debts
                const userDebts = await db.select().from(debts).where(eq(debts.userId, user.id));
                for (const debt of userDebts) {
                    await debtEngine.calculateAmortization(debt.id);
                }
            }
            logInfo('[Debt Recalculator] Nightly scan completed.');
        } catch (error) {
            logError('[Debt Recalculator] Job failed:', error);
        }
    }
}

export default new DebtRecalculator();
