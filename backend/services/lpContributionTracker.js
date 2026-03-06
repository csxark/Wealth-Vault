import db from '../config/db.js';
import { lpCommitments, capitalCalls, ledgerEntries, ledgerAccounts, entities, vaults, spvEntities } from '../db/schema.js';
import { eq, and, sql, desc, or } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import { calculateIRR, calculateMOIC } from '../utils/irrCalculator.js';
import vaultService from './vaultService.js';
import ledgerService from './ledgerService.js';

/**
 * LP Contribution Tracker (#510)
 * Manages "Capital Commitments" vs. "Called Capital," and tracks funding.
 * Also keeps the true IRR for each LP.
 */
class LPContributionTracker {
    /**
     * Record a specific LP's funding of a capital call.
     */
    async fundCapitalCall(userId, lpCommitmentId, callId, amount) {
        logInfo(`[LP Tracker] Funding $${amount} for call ${callId} from commitment ${lpCommitmentId}`);

        return await db.transaction(async (tx) => {
            // 1. Get Commitment and SPV Info
            const [lp] = await tx.select().from(lpCommitments).where(eq(lpCommitments.id, lpCommitmentId));
            const [spv] = await tx.select().from(spvEntities).where(eq(spvEntities.id, lp.spvId));

            // 2. Validate availability in LP's Personal Vault
            // LP has a Personal Vault mapped via their LP Entity ID
            const lpVault = await tx.query.vaults.findFirst({
                where: and(eq(vaults.ownerId, userId), eq(vaults.name, 'Personal Investment Vault')) // Simplified
            });

            if (!lpVault) throw new Error('LP Vault not found');

            const available = await vaultService.getAvailableBalance(lpVault.id);
            if (available < parseFloat(amount)) throw new Error('Insufficient funds in LP vault');

            // 3. Move Funds to SPV Asset Vault (Staging)
            // Use existing vaultService logic
            await vaultService.sweepCashToTarget(userId, lpVault.id, spv.gpEntityId, amount); // Move to SPV controller

            // 4. Update Called Amount
            const newCalledAmount = parseFloat(lp.calledAmount || 0) + parseFloat(amount);
            await tx.update(lpCommitments)
                .set({ calledAmount: newCalledAmount.toString() })
                .where(eq(lpCommitments.id, lpCommitmentId));

            // 5. Audit Entry in Ledger
            await ledgerService.postLedgerEntry(userId, {
                accountId: lpVault.id,
                credit: amount.toString(),
                currency: 'USD',
                description: `Capital Call Funding: ${spv.name}`,
                metadata: { lpCommitmentId, spvId: spv.id, callId }
            });

            return { lpCommitmentId, fundingStatus: 'completed', totalCalled: newCalledAmount };
        });
    }

    /**
     * Get real-time IRR and MOIC for a specific LP commitment.
     */
    async getLPMetrics(lpCommitmentId) {
        // Fetch all cash flows related to this commitment (In and Out)
        // IN: Capital contributions (Credits from LP vault)
        // OUT: Waterfall distributions (Debits to LP vault)

        const flows = await db.select({
            amount: ledgerEntries.baseAmount,
            date: ledgerEntries.createdAt
        }).from(ledgerEntries)
            .where(sql`jsonb_extract_path_text(${ledgerEntries.metadata}, 'lpCommitmentId') = ${lpCommitmentId.toString()}`)
            .orderBy(desc(ledgerEntries.createdAt));

        const formattedFlows = flows.map(f => ({
            amount: parseFloat(f.amount),
            date: f.date
        }));

        return {
            irr: calculateIRR(formattedFlows),
            moic: calculateMOIC(formattedFlows),
            flowCount: flows.length
        };
    }
}

export default new LPContributionTracker();
