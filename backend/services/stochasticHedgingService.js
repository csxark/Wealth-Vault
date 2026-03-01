import db from '../config/db.js';
import { activeHedges, escrowContracts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import fxService from './fxService.js';
import { logInfo } from '../utils/logger.js';

/**
 * StochasticHedgingService (#481)
 * Calculates and manages derivative hedges for multi-currency escrow locks.
 */
class StochasticHedgingService {
    /**
     * Calculates the required hedge for an escrow contract based on volatility.
     */
    async calculateRequiredHedge(contractId) {
        const [contract] = await db.select().from(escrowContracts).where(eq(escrowContracts.id, contractId));
        if (!contract) return null;

        const { baseCurrency, escrowCurrency, lockedAmount } = contract;

        // Fetch real-time FX rate
        const currentRate = await fxService.getRate(escrowCurrency, baseCurrency);

        // Heuristic: If lock-in currency volatility exceeds threshold, we hedge 100% of notional
        // In a production app, this would use the MonteCarlo logic implemented in #480
        const hedgeType = 'FORWARD'; // Simulating a forward contract hedge

        const [hedge] = await db.insert(activeHedges).values({
            contractId,
            hedgeType,
            notionalAmount: lockedAmount,
            entryRate: currentRate.toString(),
            marginBuffer: (parseFloat(lockedAmount) * 0.10).toString(), // 10% margin buffer
            lastRevaluationAt: new Date()
        }).returning();

        logInfo(`[Hedge] Initialized ${hedgeType} for contract ${contractId} at rate ${currentRate}`);
        return hedge;
    }

    /**
     * Revalues existing hedges against current market spot rates
     */
    async revalueHedge(hedgeId) {
        const [hedge] = await db.select().from(activeHedges).where(eq(activeHedges.id, hedgeId));
        const [contract] = await db.select().from(escrowContracts).where(eq(escrowContracts.id, hedge.contractId));

        const currentRate = await fxService.getRate(contract.escrowCurrency, contract.baseCurrency);
        const pnl = (parseFloat(currentRate) - parseFloat(hedge.entryRate)) * parseFloat(hedge.notionalAmount);

        await db.update(activeHedges).set({
            currentValue: pnl.toString(),
            lastRevaluationAt: new Date()
        }).where(eq(activeHedges.id, hedgeId));

        return { pnl, currentRate };
    }
}

export default new StochasticHedgingService();
