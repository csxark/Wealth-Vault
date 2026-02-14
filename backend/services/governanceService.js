import db from '../config/db.js';
import { multiSigWallets, executorRoles, approvalQuests } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import notificationService from './notificationService.js';

/**
 * Governance Service (L3)
 * Manages M-of-N consensus for Family Office approvals.
 */
class GovernanceService {
    /**
     * Propose a sensitive action for approval
     */
    async proposeQuest(userId, questData) {
        const { walletId, resourceType, resourceId, amount } = questData;

        // Verify user is an executor for this wallet
        const [executor] = await db.select().from(executorRoles)
            .where(and(eq(executorRoles.walletId, walletId), eq(executorRoles.executorId, userId)));

        if (!executor) throw new Error('Unauthorized: You are not an executor for this wallet');

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7-day voting window

        const [quest] = await db.insert(approvalQuests).values({
            walletId,
            resourceType,
            resourceId,
            amount,
            proposerId: userId,
            status: 'pending',
            signatures: [userId], // Proposer signs by default
            expiresAt
        }).returning();

        // Notify other executors
        const others = await db.select().from(executorRoles)
            .where(and(eq(executorRoles.walletId, walletId), sql`${executorRoles.executorId} != ${userId}`));

        for (const o of others) {
            await notificationService.sendNotification(o.executorId, {
                title: 'New Approval Required',
                message: `An action of type ${resourceType} for $${amount} requires your signature.`,
                type: 'governance_vote'
            });
        }

        return quest;
    }

    /**
     * Cast a signature on a pending quest
     */
    async castSignature(userId, questId) {
        const quest = await db.query.approvalQuests.findFirst({
            where: eq(approvalQuests.id, questId),
            with: { wallet: true }
        });

        if (!quest || quest.status !== 'pending') throw new Error('Quest not found or already closed');

        // Check if already signed
        if (quest.signatures.includes(userId)) throw new Error('You have already signed this quest');

        // Check if user is an authorized executor
        const [executor] = await db.select().from(executorRoles)
            .where(and(eq(executorRoles.walletId, quest.walletId), eq(executorRoles.executorId, userId)));

        if (!executor) throw new Error('Unauthorized');

        const updatedSignatures = [...quest.signatures, userId];
        const status = updatedSignatures.length >= quest.wallet.requiredSignatures ? 'approved' : 'pending';

        const [updated] = await db.update(approvalQuests)
            .set({
                signatures: updatedSignatures,
                status
            })
            .where(eq(approvalQuests.id, questId))
            .returning();

        if (status === 'approved') {
            console.log(`[Governance] Quest ${questId} REACHED CONSENSUS (${updatedSignatures.length}/${quest.wallet.requiredSignatures})`);
            // Here we would trigger the actual execution logic (e.g., executing the vault withdrawal)
        }

        return updated;
    }

    /**
     * Get pending approvals for a user
     */
    async getPendingActions(userId) {
        // Find wallets where user is an executor
        const myWallets = await db.select({ id: executorRoles.walletId })
            .from(executorRoles)
            .where(eq(executorRoles.executorId, userId));

        const walletIds = myWallets.map(w => w.id);
        if (walletIds.length === 0) return [];

        return await db.query.approvalQuests.findMany({
            where: and(
                sql`${approvalQuests.walletId} IN ${walletIds}`,
                eq(approvalQuests.status, 'pending')
            )
        });
    }
}

export default new GovernanceService();
