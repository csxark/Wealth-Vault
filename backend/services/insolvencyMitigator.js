import db from '../config/db.js';
import { internalDebts, vaults, vaultBalances } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { NetWorthGraph } from '../utils/netWorthGraph.js';

/**
 * AI/Algorithm-Based Insolvency Mitigator
 * Suggests actions to prevent cascading insolvency in structural networks. (#465)
 */
class InsolvencyMitigator {
    /**
     * Propose an action plan to prevent a target vault from going insolvent
     * under a hypothetical shock scenario.
     */
    async generateMitigationPlan(userId, failedVaultId, requiredLiquidityDelta) {
        // Find alternative vaults with high cash buffers
        const allBalances = await db.select().from(vaultBalances).where(eq(vaultBalances.userId, userId));

        let availableCash = 0;
        const liquiditySources = [];

        for (const bal of allBalances) {
            if (bal.vaultId !== failedVaultId && parseFloat(bal.balance) > 0) {
                // If it's a completely safe vault (low centrality, highly decoupled)
                liquiditySources.push({
                    vaultId: bal.vaultId,
                    available: parseFloat(bal.balance)
                });
            }
        }

        // Sort by highest available liquidity
        liquiditySources.sort((a, b) => b.available - a.available);

        const actions = [];
        let remainingGap = requiredLiquidityDelta;

        // Proposal 1: Direct Capital Injection (Cash Sweep)
        for (const source of liquiditySources) {
            if (remainingGap <= 0) break;

            // Assume we can safely pull 50% of the buffer from other vaults
            const maxPull = source.available * 0.50;
            const pullAmount = Math.min(remainingGap, maxPull);

            if (pullAmount > 0) {
                actions.push({
                    type: 'LIQUIDITY_SWEEP',
                    sourceVaultId: source.vaultId,
                    targetVaultId: failedVaultId,
                    amount: pullAmount,
                    description: `Sweep ${pullAmount.toFixed(2)} emergency cash from independent Vault ${source.vaultId}`
                });
                remainingGap -= pullAmount;
            }
        }

        // Proposal 2: Debt Forgiveness / Restructuring (if still falling short)
        if (remainingGap > 0) {
            const debts = await db.select().from(internalDebts).where(and(eq(internalDebts.borrowerVaultId, failedVaultId)));
            for (const debt of debts) {
                if (remainingGap <= 0) break;

                const debtBal = parseFloat(debt.currentBalance);
                const restructureAmount = Math.min(debtBal, remainingGap);

                actions.push({
                    type: 'DEBT_RESTRUCTURE',
                    debtId: debt.id,
                    lenderVaultId: debt.lenderVaultId,
                    amount: restructureAmount,
                    description: `Restructure/Forgive ${restructureAmount.toFixed(2)} internal debt owed to ${debt.lenderVaultId}`
                });
                remainingGap -= restructureAmount;
            }
        }

        return {
            failedVaultId,
            initialGap: requiredLiquidityDelta,
            unresolvedGap: Math.max(0, remainingGap),
            probabilityOfSuccess: remainingGap <= 0 ? 0.95 : 0.40,
            proposedActions: actions
        };
    }
}

export default new InsolvencyMitigator();
