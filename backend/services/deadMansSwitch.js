import db from '../config/db.js';
import {
    inactivityTriggers,
    inheritanceRules,
    vaults,
    fixedAssets,
    inheritanceExecutors,
    assetStepUpLogs,
    approvalRequests,
    users
} from '../db/schema.js';
import { eq, lt, and, sql } from 'drizzle-orm';
import crypto from 'crypto';
import portfolioService from './portfolioService.js';
import taxService from './taxService.js';

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
                challengeSentAt: new Date(),
                status: 'warned'
            })
            .where(eq(inactivityTriggers.userId, userId));

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

        await this.updateActivity(userId, 'challenge_response');

        await db.update(inactivityTriggers)
            .set({
                challengeToken: null,
                challengeSentAt: null,
                status: 'active'
            })
            .where(eq(inactivityTriggers.userId, userId));

        return true;
    }

    /**
     * Trigger inheritance protocol for a user
     */
    async triggerInheritance(userId) {
        console.log(`[Dead Man's Switch] EVALUATING INHERITANCE for user ${userId}`);

        const rules = await db.query.inheritanceRules.findMany({
            where: and(
                eq(inheritanceRules.userId, userId),
                eq(inheritanceRules.status, 'active')
            )
        });

        if (rules.length === 0) {
            console.log(`[Dead Man's Switch] No inheritance rules found for user ${userId}`);
            return;
        }

        // Get total portfolio value for dynamic allocation evaluation
        const portfolioSummaries = await portfolioService.getPortfolioSummaries(userId);
        const totalNetWorth = portfolioSummaries.reduce((sum, p) => sum + p.totalValue, 0);

        const results = [];

        for (const rule of rules) {
            // Evaluate Dynamic Allocation Conditions
            const conditions = rule.conditions || {};
            if (conditions.minPortfolioValue && totalNetWorth < parseFloat(conditions.minPortfolioValue)) {
                console.log(`[Inheritance] Skipping rule ${rule.id} - Net worth $${totalNetWorth} < threshold $${conditions.minPortfolioValue}`);
                continue;
            }

            // Check for Multi-Sig / Executor Approval requirement
            if (conditions.requiresExecutorApproval) {
                console.log(`[Inheritance] Rule ${rule.id} requires multi-sig approval`);

                await db.update(inheritanceRules)
                    .set({ status: 'awaiting_approval', triggeredAt: new Date() })
                    .where(eq(inheritanceRules.id, rule.id));

                // Notify executors (simulated by creating inheritanceExecutors records if not already there)
                // In a real system, the executors would have been predefined in the rule creation

                // Create a master approval request for governance visibility
                await db.insert(approvalRequests).values({
                    vaultId: rule.vaultId || null,
                    requesterId: userId,
                    resourceType: 'inheritance_trigger',
                    resourceId: rule.id,
                    action: 'trigger',
                    requestData: { rule, totalNetWorth },
                    requiredApprovals: conditions.multiSigRequirement || 1,
                    status: 'pending'
                });

                results.push({ ruleId: rule.id, status: 'awaiting_approval' });
            } else {
                // Execute immediate distribution
                await this.executeDistribution(rule);
                results.push({ ruleId: rule.id, status: 'executed' });
            }
        }

        // Update inactivity trigger status
        await db.update(inactivityTriggers)
            .set({
                status: 'triggered',
                triggeredAt: new Date()
            })
            .where(eq(inactivityTriggers.userId, userId));

        return results;
    }

    /**
     * Execute asset distribution to beneficiary with Tax Step-Up calculation
     */
    async executeDistribution(rule) {
        const { beneficiaryId, assetType, assetId, distributionPercentage, vaultId, userId } = rule;
        const percentage = parseFloat(distributionPercentage || '100');

        console.log(`[Inheritance] Executing distribution of ${percentage}% of ${assetType} ${assetId || ''} to beneficiary ${beneficiaryId}`);

        // Automated Tax-Basis Step-Up Calculation
        if (assetType === 'fixed_asset' && assetId) {
            const [asset] = await db.select().from(fixedAssets).where(eq(fixedAssets.id, assetId));
            if (asset) {
                const originalBasis = parseFloat(asset.purchasePrice || '0');
                const steppedUpBasis = parseFloat(asset.currentValue || '0');

                // Update asset ownership and cost basis
                await db.update(fixedAssets)
                    .set({
                        userId: beneficiaryId,
                        purchasePrice: steppedUpBasis.toString(), // New basis for heir
                        metadata: {
                            ...asset.metadata,
                            inheritedFrom: userId,
                            inheritedAt: new Date(),
                            originalBasis: originalBasis,
                            taxStepUpApplied: true
                        }
                    })
                    .where(eq(fixedAssets.id, assetId));

                // Record Step-Up log
                await db.insert(assetStepUpLogs).values({
                    assetId,
                    assetType: 'fixed_asset',
                    inheritedBy: beneficiaryId,
                    inheritedFrom: userId,
                    originalBasis: originalBasis.toString(),
                    steppedUpBasis: steppedUpBasis.toString(),
                    taxYear: new Date().getFullYear(),
                    notes: `Automatic basis step-up applied at inheritance transfer.`
                });

                console.log(`[Inheritance] Asset ${assetId} transferred with stepped-up basis: $${steppedUpBasis}`);
            }
        } else if (assetType === 'vault' && vaultId) {
            // Transfer vault ownership
            await db.update(vaults)
                .set({
                    ownerId: beneficiaryId,
                    updatedAt: new Date()
                })
                .where(eq(vaults.id, vaultId));

            console.log(`[Inheritance] Vault ${vaultId} transferred to ${beneficiaryId}`);
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
     * Approve inheritance by an executor (Multi-Sig logic)
     */
    async approveInheritance(ruleId, executorId) {
        // Verify executor is authorized
        const rule = await db.query.inheritanceRules.findFirst({
            where: eq(inheritanceRules.id, ruleId),
            with: { executors: true }
        });

        if (!rule) throw new Error('Inheritance rule not found');
        if (rule.status !== 'awaiting_approval' && rule.status !== 'triggered') {
            throw new Error(`Rule is in status ${rule.status}, approval not possible`);
        }

        // Record executor approval
        await db.insert(inheritanceExecutors).values({
            ruleId,
            executorId,
            status: 'approved',
            approvedAt: new Date()
        }).onConflictDoUpdate({
            target: [inheritanceExecutors.ruleId, inheritanceExecutors.executorId],
            set: { status: 'approved', approvedAt: new Date() }
        });

        // Check if threshold reached
        const approvals = await db.select({ count: sql`count(*)` })
            .from(inheritanceExecutors)
            .where(and(
                eq(inheritanceExecutors.ruleId, ruleId),
                eq(inheritanceExecutors.status, 'approved')
            ));

        const required = rule.conditions?.multiSigRequirement || 1;
        console.log(`[Inheritance] Rule ${ruleId} has ${approvals[0].count} of ${required} required approvals`);

        if (parseInt(approvals[0].count) >= required) {
            console.log(`[Inheritance] Threshold reached for rule ${ruleId}. Executing distribution...`);
            await this.executeDistribution(rule);

            // Update master approval request
            await db.update(approvalRequests)
                .set({ status: 'approved', approvedAt: new Date() })
                .where(and(
                    eq(approvalRequests.resourceType, 'inheritance_trigger'),
                    eq(approvalRequests.resourceId, ruleId)
                ));
        }

        return {
            currentApprovals: parseInt(approvals[0].count),
            requiredApprovals: required,
            status: parseInt(approvals[0].count) >= required ? 'executed' : 'awaiting_more_approvals'
        };
    }

    /**
     * Add or update inheritance rule
     */
    async addInheritanceRule(userId, ruleData) {
        const { beneficiaryId, assetType, assetId, distributionPercentage, vaultId, conditions, notes, executors } = ruleData;

        const [rule] = await db.insert(inheritanceRules).values({
            userId,
            beneficiaryId,
            assetType,
            assetId,
            distributionPercentage: distributionPercentage ? distributionPercentage.toString() : '100',
            vaultId,
            conditions: conditions || {
                inactivityThreshold: 90,
                minPortfolioValue: '0',
                requiresExecutorApproval: true,
                multiSigRequirement: 2
            },
            notes,
            status: 'active'
        }).returning();

        // Add executors if provided
        if (executors && executors.length > 0) {
            for (const execId of executors) {
                await db.insert(inheritanceExecutors).values({
                    ruleId: rule.id,
                    executorId: execId,
                    status: 'pending'
                });
            }
        }

        return rule;
    }

    async getUserInheritanceRules(userId) {
        return await db.query.inheritanceRules.findMany({
            where: eq(inheritanceRules.userId, userId),
            with: {
                beneficiary: {
                    columns: { id: true, firstName: true, lastName: true, email: true }
                },
                executors: {
                    with: {
                        executor: {
                            columns: { id: true, firstName: true, lastName: true, email: true }
                        }
                    }
                }
            },
            orderBy: (inheritanceRules, { desc }) => [desc(inheritanceRules.createdAt)]
        });
    }

    async revokeRule(ruleId, userId) {
        const rule = await db.query.inheritanceRules.findFirst({
            where: and(
                eq(inheritanceRules.id, ruleId),
                eq(inheritanceRules.userId, userId)
            )
        });

        if (!rule) throw new Error('Rule not found or unauthorized');
        if (rule.status === 'executed') throw new Error('Cannot revoke executed rule');

        await db.update(inheritanceRules)
            .set({ status: 'revoked', updatedAt: new Date() })
            .where(eq(inheritanceRules.id, ruleId));

        return rule;
    }

    async getInactivityStatus(userId) {
        const trigger = await db.query.inactivityTriggers.findFirst({
            where: eq(inactivityTriggers.userId, userId)
        });

        if (!trigger) {
            await this.updateActivity(userId, 'initial_setup');
            return { inactivityDays: 0, status: 'active' };
        }

        return trigger;
    }
}

export default new DeadMansSwitch();

