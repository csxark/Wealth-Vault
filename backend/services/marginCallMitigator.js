import db from '../config/db.js';
import { activeHedges, escrowContracts, vaultBalances } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { logWarning, logInfo } from '../utils/logger.js';
import marginEngine from './marginEngine.js';

/**
 * MarginCallMitigator (#481)
 * Monitors hedge health and triggers automated liquidity sweeps to prevent liquidation.
 */
class MarginCallMitigator {
    /**
     * Checks if a hedge's PnL has eaten into the maintenance margin.
     */
    async evaluateMarginHealth(hedgeId) {
        const [hedge] = await db.select().from(activeHedges).where(eq(activeHedges.id, hedgeId));
        if (!hedge) return;

        const currentPnL = parseFloat(hedge.currentValue || 0);
        const marginBuffer = parseFloat(hedge.marginBuffer || 0);

        // If PnL is negative and exceeds 70% of the buffer, trigger mitigation
        if (currentPnL < 0 && Math.abs(currentPnL) > (marginBuffer * 0.70)) {
            logWarning(`[MarginCall] Critical shortfall for hedge ${hedgeId}. shortfall: ${Math.abs(currentPnL)}`);
            await this.triggerEmergencySweep(hedge.contractId, Math.abs(currentPnL));
        }
    }

    /**
     * Finds the safest user vault and sweeps capital to top up the escrow's margin.
     */
    async triggerEmergencySweep(contractId, amountNeeded) {
        const [contract] = await db.select().from(escrowContracts).where(eq(escrowContracts.id, contractId));

        // Find vault with highest USD/Base balance not involved in the escrow
        const balances = await db.select().from(vaultBalances).where(eq(vaultBalances.userId, contract.userId));
        const sorted = balances.sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));

        const bestSource = sorted.find(b => b.vaultId !== contract.vaultId);

        if (bestSource && parseFloat(bestSource.balance) >= amountNeeded) {
            logInfo(`[MarginSweep] Liquidity found. Moving ${amountNeeded} from Vault ${bestSource.vaultId} to support Escrow ${contractId}`);

            // Execute the ledger move (Mocking the transactional move logic usually in marginEngine)
            await marginEngine.transferMargin(bestSource.vaultId, contract.vaultId, amountNeeded, 'ESCROW_MARGIN_CALL');

            // Update the hedge buffer to reflect new capital
            await db.update(activeHedges)
                .set({ marginBuffer: (parseFloat(amountNeeded) * 1.5).toString() })
                .where(eq(activeHedges.contractId, contractId));
        } else {
            logWarning(`[MarginCall] FATAL: No liquidity found to mitigate margin call for contract ${contractId}`);
        }
    }
}

export default new MarginCallMitigator();
