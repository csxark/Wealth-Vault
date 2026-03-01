import db from '../config/db.js';
import { bylawDefinitions, governanceResolutions, votingRecords, vaults, vaultMembers, users } from '../db/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import notificationService from './notificationService.js';

/**
 * Governance Engine Service (#453)
 * Orchestrates multi-sig spending resolutions and bylaw enforcement.
 */
class GovernanceEngine {
    /**
     * Evaluate a transaction against existing bylaws.
     * Returns true if clear, or throws an error if a resolution is required.
     */
    async evaluateTransaction(userId, vaultId, amount, type = 'spend') {
        logInfo(`[Governance Engine] Evaluating ${type} of ${amount} for vault ${vaultId}`);

        try {
            // 1. Find active bylaws for this vault
            const bylaws = await db.select().from(bylawDefinitions)
                .where(and(eq(bylawDefinitions.vaultId, vaultId), eq(bylawDefinitions.isActive, true)));

            for (const bylaw of bylaws) {
                if (parseFloat(amount) >= parseFloat(bylaw.thresholdAmount)) {
                    logInfo(`[Governance Engine] Threshold breached (${bylaw.thresholdAmount}). Creating resolution.`);

                    // Trigger resolution (multi-sig flow)
                    await this.createResolution(userId, bylaw.id, { amount, vaultId, type });

                    throw new Error(`Transaction pending multi-sig resolution per institutional bylaws.`);
                }
            }

            return true; // No bylaws breached
        } catch (error) {
            if (error.message.includes('pending multi-sig')) throw error;
            logError(`[Governance Engine] Evaluation failed:`, error);
            throw error;
        }
    }

    /**
     * Create a new spending resolution
     */
    async createResolution(userId, bylawId, payload) {
        const [bylaw] = await db.select().from(bylawDefinitions).where(eq(bylawDefinitions.id, bylawId));

        // Count eligible voters (vault members)
        const members = await db.select().from(vaultMembers).where(eq(vaultMembers.vaultId, bylaw.vaultId));

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + (bylaw.votingPeriodHours || 48));

        const [resolution] = await db.insert(governanceResolutions).values({
            userId,
            bylawId,
            resolutionType: payload.type || 'spend',
            status: 'open',
            payload,
            totalEligibleVotes: members.length,
            expiresAt
        }).returning();

        // 6. Notify members (except requester)
        const [vault] = await db.select().from(vaults).where(eq(vaults.id, bylaw.vaultId));
        for (const member of members) {
            if (member.userId !== userId) {
                notificationService.sendGovernanceResolutionNotification(member.userId, resolution, vault.name).catch(e => logError('[Gov Engine] Notification failed:', e));
            }
        }

        return resolution;
    }

    /**
     * Submit a vote on an open resolution
     */
    async submitVote(userId, resolutionId, vote, reason = null) {
        logInfo(`[Governance Engine] User ${userId} voting ${vote} on resolution ${resolutionId}`);

        return await db.transaction(async (tx) => {
            // 1. Validate resolution is still open
            const [res] = await tx.select().from(governanceResolutions).where(eq(governanceResolutions.id, resolutionId));
            if (!res || res.status !== 'open') throw new Error('Resolution is closed or does not exist.');
            if (new Date() > res.expiresAt) throw new Error('Voting period has expired.');

            // 2. Prevent double voting
            const [existing] = await tx.select().from(votingRecords).where(and(
                eq(votingRecords.userId, userId),
                eq(votingRecords.resolutionId, resolutionId)
            ));
            if (existing) throw new Error('User has already voted on this resolution.');

            // 3. Record vote
            await tx.insert(votingRecords).values({ userId, resolutionId, vote, reason });

            // 4. Update tally
            const updateField = vote === 'yes' ? 'votesFor' : 'votesAgainst';
            const [updatedRes] = await tx.update(governanceResolutions)
                .set({ [updateField]: sql`${governanceResolutions[updateField]} + 1` })
                .where(eq(governanceResolutions.id, resolutionId))
                .returning();

            // 5. Check if passed
            const [bylaw] = await tx.select().from(bylawDefinitions).where(eq(bylawDefinitions.id, res.bylawId));
            const quorumMet = (updatedRes.votesFor / updatedRes.totalEligibleVotes) >= bylaw.requiredQuorum;

            if (quorumMet) {
                await tx.update(governanceResolutions)
                    .set({ status: 'passed' })
                    .where(eq(governanceResolutions.id, resolutionId));

                logInfo(`[Governance Engine] Resolution ${resolutionId} PASSED.`);
                // In a full implementation, we would execute the payload here
            }

            return { status: updatedRes.status, quorumMet };
        });
    }
}

export default new GovernanceEngine();
