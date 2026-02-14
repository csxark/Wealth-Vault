import db from '../config/db.js';
import {
    inactivityTriggers,
    inheritanceRules,
    vaults,
    fixedAssets,
    inheritanceExecutors,
    assetStepUpLogs,
    approvalRequests,
    users,
    successionLogs,
    multiSigApprovals
} from '../db/schema.js';
import { eq, lt, and, sql, desc } from 'drizzle-orm';
import crypto from 'crypto';
import portfolioService from './portfolioService.js';
import taxService from './taxService.js';

/**
 * Succession Service - Digital Inheritance & Multi-Sig Heirship Engine (L3)
 * Manages "Dead Man's Switch" logic and automated asset transition.
 */
class SuccessionService {
    /**
     * Update user's last seen timestamp to prevent trigger
     */
    async trackActivity(userId, activityType = 'user_presence') {
        await db.insert(inactivityTriggers)
            .values({
                userId,
                lastSeenAt: new Date(),
                lastActivityType: activityType,
                inactivityDays: 0,
                status: 'active'
            })
            .onConflictDoUpdate({
                target: inactivityTriggers.userId,
                set: {
                    lastSeenAt: new Date(),
                    lastActivityType: activityType,
                    inactivityDays: 0,
                    status: 'active',
                    updatedAt: new Date()
                }
            });
    }

    async updateActivity(userId, type) {
        return this.trackActivity(userId, type);
    }

    /**
     * Trigger the Sovereign Succession process
     */
    async triggerSuccessionEvent(userId, triggerType = 'inactivity') {
        console.log(`[Succession] TRIGGERED for user ${userId} via ${triggerType}`);

        const [log] = await db.insert(successionLogs).values({
            userId,
            triggerType,
            status: 'triggered',
            metadata: {
                triggeredBy: 'system_monitor',
                eventTime: new Date().toISOString()
            }
        }).returning();

        const rules = await db.query.inheritanceRules.findMany({
            where: and(
                eq(inheritanceRules.userId, userId),
                eq(inheritanceRules.status, 'active')
            )
        });

        if (rules.length === 0) {
            await db.update(successionLogs)
                .set({ status: 'failed', metadata: { error: 'No active rules found' } })
                .where(eq(successionLogs.id, log.id));
            return;
        }

        for (const rule of rules) {
            await db.update(inheritanceRules)
                .set({ status: 'triggered', triggeredAt: new Date() })
                .where(eq(inheritanceRules.id, rule.id));
        }

        await db.update(successionLogs)
            .set({
                status: 'multi_sig_pending',
                requiredApprovals: 2
            })
            .where(eq(successionLogs.id, log.id));

        return log;
    }

    /**
     * Cast an approval/signature for a succession event
     */
    async castApproval(successionId, executorId, action = 'APPROVE', req = null) {
        const [succession] = await db.select().from(successionLogs).where(eq(successionLogs.id, successionId));
        if (!succession || succession.status !== 'multi_sig_pending') {
            throw new Error('Succession event not in approval phase');
        }

        const signature = crypto.createHmac('sha256', process.env.JWT_SECRET || 'secret')
            .update(`${successionId}-${executorId}-${Date.now()}`)
            .digest('hex');

        await db.insert(multiSigApprovals).values({
            successionId,
            executorId,
            action,
            signature,
            userAgent: req?.headers?.['user-agent'],
            ipAddress: req?.ip
        });

        await db.update(successionLogs)
            .set({ currentApprovals: sql`${successionLogs.currentApprovals} + 1` })
            .where(eq(successionLogs.id, successionId));

        const updated = await db.select().from(successionLogs).where(eq(successionLogs.id, successionId));
        if (updated[0].currentApprovals >= updated[0].requiredApprovals) {
            await this.executeSuccession(successionId);
        }

        return { signature, status: updated[0].status };
    }

    /**
     * Final Execution: Move assets and apply tax step-up basis
     */
    async executeSuccession(successionId) {
        const [log] = await db.select().from(successionLogs).where(eq(successionLogs.id, successionId));
        if (log.status === 'completed') return;

        await db.update(successionLogs).set({ status: 'executing' }).where(eq(successionLogs.id, successionId));

        const rules = await db.query.inheritanceRules.findMany({
            where: and(
                eq(inheritanceRules.userId, log.userId),
                eq(inheritanceRules.status, 'triggered')
            )
        });

        for (const rule of rules) {
            await this.distributeAsset(rule);
        }

        await db.update(successionLogs)
            .set({ status: 'completed', completedAt: new Date() })
            .where(eq(successionLogs.id, successionId));

        await db.update(inactivityTriggers)
            .set({ status: 'triggered' })
            .where(eq(inactivityTriggers.userId, log.userId));
    }

    async distributeAsset(rule) {
        const { beneficiaryId, assetType, assetId, vaultId, userId } = rule;

        if (assetType === 'fixed_asset' && assetId) {
            const [asset] = await db.select().from(fixedAssets).where(eq(fixedAssets.id, assetId));
            if (asset) {
                const stepUp = await this.calculateStepUp(asset);
                await db.update(fixedAssets)
                    .set({
                        userId: beneficiaryId,
                        purchasePrice: stepUp.steppedUpBasis.toString(),
                        metadata: { inherited: true, from: userId }
                    })
                    .where(eq(fixedAssets.id, assetId));

                await db.insert(assetStepUpLogs).values({
                    assetId,
                    assetType: 'fixed_asset',
                    inheritedBy: beneficiaryId,
                    inheritedFrom: userId,
                    originalBasis: stepUp.originalBasis.toString(),
                    steppedUpBasis: stepUp.steppedUpBasis.toString(),
                    taxYear: new Date().getFullYear(),
                });
            }
        } else if (assetType === 'vault' && vaultId) {
            await db.update(vaults).set({ ownerId: beneficiaryId }).where(eq(vaults.id, vaultId));
        }

        await db.update(inheritanceRules)
            .set({ status: 'executed', executedAt: new Date() })
            .where(eq(inheritanceRules.id, rule.id));
    }

    async calculateStepUp(asset) {
        const originalBasis = parseFloat(asset.purchasePrice || 0);
        const steppedUpBasis = parseFloat(asset.currentValue || originalBasis);
        return { originalBasis, steppedUpBasis };
    }

    async sendProofOfLifeChallenge(userId) {
        const token = crypto.randomBytes(32).toString('hex');
        await db.update(inactivityTriggers)
            .set({ challengeToken: token, challengeSentAt: new Date(), status: 'warned' })
            .where(eq(inactivityTriggers.userId, userId));
        return token;
    }

    async verifyChallenge(userId, token) {
        const [trigger] = await db.select().from(inactivityTriggers).where(eq(inactivityTriggers.userId, userId));
        if (!trigger || trigger.challengeToken !== token) {
            throw new Error('Invalid challenge token');
        }
        await this.trackActivity(userId, 'challenge_response');
        await db.update(inactivityTriggers)
            .set({ challengeToken: null, challengeSentAt: null, status: 'active' })
            .where(eq(inactivityTriggers.userId, userId));
        return true;
    }

    async addInheritanceRule(userId, ruleData) {
        const { beneficiaryId, assetType, assetId, distributionPercentage, vaultId, conditions, notes, executors } = ruleData;
        const [rule] = await db.insert(inheritanceRules).values({
            userId,
            beneficiaryId,
            assetType,
            assetId,
            distributionPercentage: distributionPercentage ? distributionPercentage.toString() : '100',
            vaultId,
            conditions: conditions || { inactivityThreshold: 90, requiresExecutorApproval: true, multiSigRequirement: 2 },
            notes,
            status: 'active'
        }).returning();

        if (executors && executors.length > 0) {
            for (const execId of executors) {
                await db.insert(inheritanceExecutors).values({ ruleId: rule.id, executorId: execId, status: 'pending' });
            }
        }
        return rule;
    }

    async getUserInheritanceRules(userId) {
        return await db.query.inheritanceRules.findMany({
            where: eq(inheritanceRules.userId, userId),
            orderBy: desc(inheritanceRules.createdAt)
        });
    }

    async revokeRule(ruleId, userId) {
        return await db.update(inheritanceRules)
            .set({ status: 'revoked', updatedAt: new Date() })
            .where(and(eq(inheritanceRules.id, ruleId), eq(inheritanceRules.userId, userId)));
    }

    async approveInheritance(ruleId, executorId) {
        return { status: 'recorded' };
    }

    async getInactivityStatus(userId) {
        const [status] = await db.select().from(inactivityTriggers).where(eq(inactivityTriggers.userId, userId));
        return status || { inactivityDays: 0, status: 'active' };
    }

    async getPendingSuccessions(executorId) {
        return await db.select().from(successionLogs).where(eq(successionLogs.status, 'multi_sig_pending'));
    }
}

export default new SuccessionService();
