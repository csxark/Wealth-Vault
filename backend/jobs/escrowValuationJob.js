import cron from 'node-cron';
import db from '../config/db.js';
import { activeHedges } from '../db/schema.js';
import stochasticHedgingService from '../services/stochasticHedgingService.js';
import marginCallMitigator from '../services/marginCallMitigator.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * EscrowValuationJob (#481)
 * Runs every hour to revalue all high-stakes FX hedges.
 */
class EscrowValuationJob {
    start() {
        // Run every hour
        cron.schedule('0 * * * *', async () => {
            await this.revalueAllHedges();
        });
        logInfo('EscrowValuationJob scheduled (hourly)');
    }

    async revalueAllHedges() {
        logInfo('📉 Revaluing all active escrow hedges...');
        try {
            const hedges = await db.select().from(activeHedges);

            for (const hedge of hedges) {
                // 1. Revalue PnL
                await stochasticHedgingService.revalueHedge(hedge.id);

                // 2. Evaluate if margin call is needed
                await marginCallMitigator.evaluateMarginHealth(hedge.id);
            }
        } catch (err) {
            logError('Escrow valuation cycle failed:', err);
        }
    }
}

export default new EscrowValuationJob();
