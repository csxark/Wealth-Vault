import db from '../config/db.js';
import { spvEntities, lpCommitments, waterfallTiers, capitalCalls, ledgerEntries, ledgerAccounts, entities } from '../db/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import ledgerService from './ledgerService.js';

/**
 * SPV Manager Service (#510)
 * Handles the organizational lifecycle of Private Equity / Real Estate SPVs.
 */
class SPVManagerService {
    /**
     * Create a new SPV structure with GP and Waterfall rules.
     */
    async createSPV(userId, spvData) {
        const { name, description, gpEntityId, initialAssetValue, tiers } = spvData;

        logInfo(`[SPV Manager] Initializing new vehicle: ${name}`);

        return await db.transaction(async (tx) => {
            // 1. Create SPV Entity
            const [spv] = await tx.insert(spvEntities).values({
                userId,
                name,
                description,
                gpEntityId,
                initialAssetValue: initialAssetValue.toString(),
                status: 'active'
            }).returning();

            // 2. Insert Waterfall Tiers
            if (tiers && tiers.length > 0) {
                const tiersToInsert = tiers.map((tier, idx) => ({
                    spvId: spv.id,
                    tierOrder: idx + 1,
                    name: tier.name,
                    allocationType: tier.allocationType,
                    thresholdIrr: tier.thresholdIrr?.toString(),
                    lpSplit: tier.lpSplit.toString(),
                    gpSplit: tier.gpSplit.toString()
                }));

                await tx.insert(waterfallTiers).values(tiersToInsert);
            }

            return spv;
        });
    }

    /**
     * Add an LP commitment to an existing SPV.
     */
    async addLPCommitment(spvId, commitmentData) {
        const { lpEntityId, committedAmount } = commitmentData;

        logInfo(`[SPV Manager] Recording $${committedAmount} commitment from LP ${lpEntityId}`);

        return await db.transaction(async (tx) => {
            // 1. Calculate ownership percentage based on total commitments (simplified)
            const existingCommitments = await tx.select().from(lpCommitments).where(eq(lpCommitments.spvId, spvId));
            const newTotal = existingCommitments.reduce((sum, c) => sum + parseFloat(c.committedAmount), 0) + parseFloat(committedAmount);

            // 2. Insert commitment
            const [commitment] = await tx.insert(lpCommitments).values({
                spvId,
                lpEntityId,
                committedAmount: committedAmount.toString(),
                ownershipPrc: (parseFloat(committedAmount) / newTotal).toString(),
                status: 'active'
            }).returning();

            // 3. Update SPV total commitment
            await tx.update(spvEntities)
                .set({ totalCommittedCapital: newTotal.toString() })
                .where(eq(spvEntities.id, spvId));

            // 4. Trigger recalculation of all other LPs' ownership (simplified/lazy for demo)
            // In production, this would be a full loop or a trigger.

            return commitment;
        });
    }

    /**
     * Issue a capital call for the entire SPV.
     */
    async issueCapitalCall(spvId, totalCallAmount, dueDate = null) {
        logInfo(`[SPV Manager] Issuing $${totalCallAmount} capital call for SPV ${spvId}`);

        return await db.transaction(async (tx) => {
            // 1. Record the call in the tracking table
            const [call] = await tx.insert(capitalCalls).values({
                spvId,
                callAmount: totalCallAmount.toString(),
                dueDate: dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days default
                status: 'open'
            }).returning();

            // 2. Calculate individual calls for each LP
            const lps = await tx.select().from(lpCommitments).where(eq(lpCommitments.spvId, spvId));

            // 3. Update SPV total called capital
            const spv = await tx.query.spvEntities.findFirst({ where: eq(spvEntities.id, spvId) });
            const newTotalCalled = parseFloat(spv.totalCalledCapital) + parseFloat(totalCallAmount);

            await tx.update(spvEntities)
                .set({ totalCalledCapital: newTotalCalled.toString() })
                .where(eq(spvEntities.id, spvId));

            return { call, lpCount: lps.length };
        });
    }
}

export default new SPVManagerService();
