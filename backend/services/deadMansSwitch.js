import db from '../config/db.js';
import { inactivityTriggers, inheritanceRules, vaults, fixedAssets } from '../db/schema.js';
import { eq, lt, and } from 'drizzle-orm';
import crypto from 'crypto';

class DeadMansSwitch {
    /**
     * Update user's last seen timestamp
     */
    async updateActivity(userId, activityType = 'api_call') {
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

    /**
     * Process proof-of-life challenge
     */
    async sendProofOfLifeChallenge(userId) {
        const token = crypto.randomBytes(32).toString('hex');

        await db.update(inactivityTriggers)
            .set({
                challengeToken: token,
                challengeSentAt: new Date()
            })
            .where(eq(inactivityTriggers.userId, userId));

        // In production, send email/SMS with challenge link
        console.log(`[Dead Man's Switch] Challenge sent to user ${userId}: Token ${token}`);

        return token;
    }

    /**
     * Verify proof-of-life challenge
     */
    async verifyChallenge(userId, token) {
        const trigger = await db.query.inactivityTriggers.findFirst({
            where: eq(inactivityTriggers.userId, userId)
        });

        if (!trigger || trigger.challengeToken !== token) {
            throw new Error('Invalid challenge token');
        }

        // Reset inactivity
        await this.updateActivity(userId, 'challenge_response');

        await db.update(inactivityTriggers)
            .set({
                challengeToken: null,
                challengeSentAt: null
            })
            .where(eq(inactivityTriggers.userId, userId));

        return true;
    }

    /**
     * Trigger inheritance protocol for a user
     */
    async triggerInheritance(userId) {
        console.log(`[Dead Man's Switch] TRIGGERING INHERITANCE for user ${userId}`);

        // Get all active inheritance rules
        const rules = await db.query.inheritanceRules.findMany({
            where: and(
                eq(inheritanceRules.userId, userId),
                eq(inheritanceRules.status, 'active')
            ),
            with: {
                beneficiary: {
                    columns: { id: true, firstName: true, lastName: true, email: true }
                }
            }
        });

        if (rules.length === 0) {
            console.log(`[Dead Man's Switch] No inheritance rules found for user ${userId}`);
            return;
        }

        // Mark rules as triggered
        await db.update(inheritanceRules)
            .set({
                status: 'triggered',
                triggeredAt: new Date()
            })
            .where(and(
                eq(inheritanceRules.userId, userId),
                eq(inheritanceRules.status, 'active')
            ));

        // Execute distribution
        for (const rule of rules) {
            await this.executeDistribution(rule);
        }

        // Update trigger status
        await db.update(inactivityTriggers)
            .set({
                status: 'triggered',
                triggeredAt: new Date()
            })
            .where(eq(inactivityTriggers.userId, userId));

        return rules;
    }

    /**
     * Execute asset distribution to beneficiary
     */
    async executeDistribution(rule) {
        const { beneficiaryId, assetType, assetId, distributionPercentage, vaultId, conditions } = rule;

        console.log(`[Inheritance] Distributing ${distributionPercentage}% of ${assetType} to beneficiary ${beneficiaryId}`);

        // If trustee approval required, create approval request instead
        if (conditions.trusteeApprovalRequired && rule.trusteeId) {
            console.log(`[Inheritance] Trustee approval required - creating request`);
            // await governanceService.createApprovalRequest(...)
            return;
        }

        // Execute immediate transfer logic
        if (assetType === 'vault' && vaultId) {
            // Transfer vault ownership or add beneficiary as co-owner
            await db.update(vaults)
                .set({
                    ownerId: beneficiaryId,
                    metadata: {
                        inheritedFrom: rule.userId,
                        inheritedAt: new Date()
                    }
                })
                .where(eq(vaults.id, vaultId));

            console.log(`[Inheritance] Vault ${vaultId} transferred to ${beneficiaryId}`);
        }

        if (assetType === 'fixed_asset' && assetId) {
            // Transfer specific asset
            await db.update(fixedAssets)
                .set({
                    userId: beneficiaryId,
                    metadata: {
                        inheritedFrom: rule.userId,
                        inheritedAt: new Date()
                    }
                })
                .where(eq(fixedAssets.id, assetId));

            console.log(`[Inheritance] Asset ${assetId} transferred to ${beneficiaryId}`);
        }

        // Mark rule as executed
        await db.update(inheritanceRules)
            .set({
                status: 'executed',
                executedAt: new Date()
            })
            .where(eq(inheritanceRules.id, rule.id));
    }

    /**
     * Add or update inheritance rule
     */
    async addInheritanceRule(userId, ruleData) {
        const { beneficiaryId, assetType, assetId, distributionPercentage, vaultId, conditions, trusteeId, notes } = ruleData;

        const [rule] = await db.insert(inheritanceRules).values({
            userId,
            beneficiaryId,
            assetType,
            assetId,
            distributionPercentage: distributionPercentage ? distributionPercentage.toString() : '100',
            vaultId,
            conditions: conditions || {},
            trusteeId,
            notes,
            status: 'active'
        }).returning();

        return rule;
    }

    /**
     * Get user's inheritance rules
     */
    async getUserInheritanceRules(userId) {
        const rules = await db.query.inheritanceRules.findMany({
            where: eq(inheritanceRules.userId, userId),
            with: {
                beneficiary: {
                    columns: { id: true, firstName: true, lastName: true, email: true }
                }
            },
            orderBy: (inheritanceRules, { desc }) => [desc(inheritanceRules.createdAt)]
        });

        return rules;
    }

    /**
     * Revoke inheritance rule
     */
    async revokeRule(ruleId, userId) {
        const rule = await db.query.inheritanceRules.findFirst({
            where: and(
                eq(inheritanceRules.id, ruleId),
                eq(inheritanceRules.userId, userId)
            )
        });

        if (!rule) throw new Error('Rule not found or unauthorized');

        if (rule.status === 'executed') {
            throw new Error('Cannot revoke executed rule');
        }

        await db.update(inheritanceRules)
            .set({
                status: 'revoked',
                updatedAt: new Date()
            })
            .where(eq(inheritanceRules.id, ruleId));

        return rule;
    }

    /**
     * Get inactivity status for a user
     */
    async getInactivityStatus(userId) {
        const trigger = await db.query.inactivityTriggers.findFirst({
            where: eq(inactivityTriggers.userId, userId)
        });

        if (!trigger) {
            // Create initial record
            await this.updateActivity(userId, 'initial_setup');
            return { inactivityDays: 0, status: 'active' };
        }

        return trigger;
    }
}

export default new DeadMansSwitch();
