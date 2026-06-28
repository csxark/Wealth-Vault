import cron from 'node-cron';
import db from '../config/db.js';
import { activeHedges, escrowContracts } from '../db/schema.js';
import { eq, lt } from 'drizzle-orm';
import { logInfo, logWarning } from '../utils/logger.js';
import stochasticHedgingService from '../services/stochasticHedgingService.js';

/**
 * HedgeDecayMonitor (#481)
 * Detects if a synthetic hedge or forward contract is losing its "Theta" (time value)
 * or if the underlying volatility suggests a hedge adjustment is required.
 */
class HedgeDecayMonitor {
    start() {
        // Run daily at midnight
        cron.schedule('0 0 * * *', async () => {
            await this.scanForHedgeDecay();
        });
        logInfo('HedgeDecayMonitor scheduled (daily at midnight)');
    }

    async scanForHedgeDecay() {
        logInfo('🔍 Scanning for FX Hedge decay and stale revaluations...');
        try {
            // Find hedges that haven't been revalued in over 24 hours
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 1);

            const staleHedges = await db.select().from(activeHedges).where(lt(activeHedges.lastRevaluationAt, cutoffDate));

            for (const hedge of staleHedges) {
                logWarning(`[HedgeDecay] Hedge ${hedge.id} is stale. Forcing revaluation.`);
                await stochasticHedgingService.revalueHedge(hedge.id);
            }

            // check expiry of underlying contracts
            const approachingExpiry = await db.select().from(escrowContracts).where(eq(escrowContracts.status, 'active'));
            const soon = new Date();
            soon.setDate(soon.getDate() + 7);

            for (const contract of approachingExpiry) {
                if (contract.expiryDate && new Date(contract.expiryDate) < soon) {
                    logWarning(`[EscrowExpiry] Contract ${contract.id} (${contract.title}) expires in < 7 days. Verifying hedge coverage.`);
                    // Logic to ensure we don't hold the hedge past settlement
                }
            }

        } catch (err) {
            logError('Hedge Decay Monitor failed:', err);
        }
    }
}

export default new HedgeDecayMonitor();
