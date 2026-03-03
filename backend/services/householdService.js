import { eq, and, inArray, sum, gte, lte, desc, asc } from 'drizzle-orm';
import db from '../config/db.js';
import {
    households, householdMembers, householdAccounts, householdSnapshots,
    householdRebalancingOrders, householdGoals, householdSpendingSummaries,
    householdApprovals, users, vaults, vaultMembers, investments, expenses
} from '../db/schema.js';
import { AppError } from '../utils/AppError.js';

class HouseholdService {
    /**
     * Create a new household
     */
    async createHousehold(userId, { name, description, householdType = 'family', baseCurrency = 'USD' }) {
        if (!name || !name.trim()) {
            throw new AppError(400, 'Household name is required');
        }

        const [household] = await db.insert(households).values({
            name: name.trim(),
            description: description?.trim(),
            householdType,
            baseCurrency,
            createdBy: userId,
        }).returning();

        // Add creator as primary member
        await db.insert(householdMembers).values({
            householdId: household.id,
            userId,
            role: 'primary',
            canApproveRebalancing: true,
            canApproveTransfers: true,
            canViewAllAccounts: true,
        });

        return household;
    }

    /**
     * Get household details with member and account info
     */
    async getHousehold(householdId, userId) {
        const household = await db.query.households.findFirst({
            where: eq(households.id, householdId),
            with: {
                members: {
                    with: { user: { columns: { id: true, email: true, fname: true, lname: true } } }
                },
                accounts: true,
            }
        });

        if (!household) {
            throw new AppError(404, 'Household not found');
        }

        // Verify user is member
        this.validateMemberAccess(household.members, userId);

        return household;
    }

    /**
     * Add new member to household
     */
    async addMember(householdId, userId, { inviteeEmail, role = 'member', relationship }) {
        // Validate requester is household owner or admin
        const requester = await db.query.householdMembers.findFirst({
            where: and(
                eq(householdMembers.householdId, householdId),
                eq(householdMembers.userId, userId)
            )
        });

        if (!requester || !['primary', 'secondary'].includes(requester.role)) {
            throw new AppError(403, 'Only household organizers can add members');
        }

        // Find user by email
        const invitee = await db.query.users.findFirst({
            where: eq(users.email, inviteeEmail)
        });

        if (!invitee) {
            throw new AppError(404, 'User not found');
        }

        // Create or update membership
        const existing = await db.query.householdMembers.findFirst({
            where: and(
                eq(householdMembers.householdId, householdId),
                eq(householdMembers.userId, invitee.id)
            )
        });

        if (existing && existing.status === 'active') {
            throw new AppError(409, 'User is already a household member');
        }

        const [member] = await db.insert(householdMembers).values({
            householdId,
            userId: invitee.id,
            role,
            relationship,
            status: 'active',
        }).onConflictDoUpdate({
            target: [householdMembers.householdId, householdMembers.userId],
            set: { status: 'active', role, relationship }
        }).returning();

        return member;
    }

    /**
     * Link vault to household account
     */
    async linkAccountToHousehold(householdId, userId, { vaultId, accountName, accountType, isJoint, jointOwnerIds = [] }) {
        // Verify owner can link accounts
        const member = await db.query.householdMembers.findFirst({
            where: and(
                eq(householdMembers.householdId, householdId),
                eq(householdMembers.userId, userId)
            )
        });

        if (!member || !['primary', 'secondary'].includes(member.role)) {
            throw new AppError(403, 'Not authorized to link accounts to this household');
        }

        // Verify vault access
        const vaultMember = await db.query.vaultMembers.findFirst({
            where: and(
                eq(vaultMembers.vaultId, vaultId),
                eq(vaultMembers.userId, userId)
            )
        });

        if (!vaultMember) {
            throw new AppError(403, 'You do not have access to this vault');
        }

        const [account] = await db.insert(householdAccounts).values({
            householdId,
            vaultId,
            accountName: accountName.trim(),
            accountType,
            primaryOwnerId: userId,
            isJoint,
            jointOwnerIds: jointOwnerIds || [],
        }).returning();

        return account;
    }

    /**
     * Calculate household net worth and asset allocation
     */
    async calculateHouseholdAggregation(householdId) {
        const household = await db.query.households.findFirst({
            where: eq(households.id, householdId),
            with: { accounts: true }
        });

        if (!household) {
            throw new AppError(404, 'Household not found');
        }

        let totalNetWorth = 0;
        let totalAssets = 0;
        let totalLiabilities = 0;
        let cashBalance = 0;
        let investmentValue = 0;
        let assetAllocation = {};

        // Aggregate across all visible accounts
        for (const account of household.accounts) {
            if (account.isHidden || !account.includeInNetWorth) continue;

            try {
                // Get vault balance (simplified - in production would aggregate all holdings)
                const vaultData = await db.query.vaults.findFirst({
                    where: eq(vaults.id, account.vaultId)
                });

                if (!vaultData) continue;

                // Get investments in vault
                const vaultInvestments = await db.select({
                    value: sum(investments.currentValue)
                }).from(investments).where(eq(investments.vaultId, account.vaultId));

                const investmentVal = Number(vaultInvestments[0]?.value || 0);
                investmentValue += investmentVal;
                totalAssets += investmentVal;

                // Calculate allocation by asset type
                const key = account.accountType;
                assetAllocation[key] = (assetAllocation[key] || 0) + investmentVal * account.weight;
            } catch (error) {
                console.error(`Error aggregating account ${account.vaultId}:`, error.message);
            }
        }

        totalNetWorth = totalAssets - totalLiabilities;

        // Calculate target allocation variance
        const household_config = household;
        const targetAllocation = household_config.metadata?.targetAllocation || {};
        const allocationVsTarget = {};

        for (const [assetType, currentValue] of Object.entries(assetAllocation)) {
            const currentPct = totalAssets > 0 ? (currentValue / totalAssets) * 100 : 0;
            const targetPct = targetAllocation[assetType] || 0;
            allocationVsTarget[assetType] = currentPct - targetPct;
        }

        // Create snapshot
        const today = new Date().toISOString().split('T')[0];
        const [snapshot] = await db.insert(householdSnapshots).values({
            householdId,
            snapshotDate: today,
            totalNetWorth: String(totalNetWorth),
            totalAssets: String(totalAssets),
            totalLiabilities: String(totalLiabilities),
            cashBalance: String(cashBalance),
            investmentValue: String(investmentValue),
            accountCount: household.accounts.filter(a => !a.isHidden).length,
            baseCurrency: household.baseCurrency,
            assetAllocation,
            allocationVsTarget,
        }).returning();

        return snapshot;
    }

    /**
     * Generate household rebalancing recommendations
     */
    async generateRebalancingSuggestions(householdId, userId, { targetAllocation }) {
        const member = await db.query.householdMembers.findFirst({
            where: and(
                eq(householdMembers.householdId, householdId),
                eq(householdMembers.userId, userId)
            )
        });

        if (!member) {
            throw new AppError(403, 'Not a household member');
        }

        // Get current household snapshot
        const today = new Date().toISOString().split('T')[0];
        const snapshot = await db.query.householdSnapshots.findFirst({
            where: and(
                eq(householdSnapshots.householdId, householdId),
                eq(householdSnapshots.snapshotDate, today)
            )
        });

        if (!snapshot) {
            throw new AppError(404, 'No snapshot available for rebalancing');
        }

        // Calculate suggested moves
        const suggestedMoves = [];
        const currentAllocation = snapshot.assetAllocation || {};
        const totalValue = Number(snapshot.totalAssets);

        for (const [assetType, targetPct] of Object.entries(targetAllocation)) {
            const currentValue = currentAllocation[assetType] || 0;
            const currentPct = (currentValue / totalValue) * 100;
            const difference = (targetPct - currentPct) * (totalValue / 100);

            if (Math.abs(difference) > 100) { // Only suggest if difference > $100
                suggestedMoves.push({
                    assetType,
                    currentValue,
                    targetValue: (targetPct / 100) * totalValue,
                    difference,
                    action: difference > 0 ? 'buy' : 'sell',
                    reason: `Rebalance ${assetType} from ${currentPct.toFixed(2)}% to ${targetPct.toFixed(2)}%`
                });
            }
        }

        // Save rebalancing order
        const [order] = await db.insert(householdRebalancingOrders).values({
            householdId,
            initiatedBy: userId,
            orderType: 'manual',
            targetAllocation,
            currentAllocation,
            suggestedMoves,
            requiresApproval: member.household?.collaborativeApprovalsRequired || false,
            status: 'proposed',
        }).returning();

        return order;
    }

    /**
     * Get household net worth trend over time
     */
    async getNetWorthTrend(householdId, { days = 30 } = {}) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];

        const snapshots = await db.select()
            .from(householdSnapshots)
            .where(and(
                eq(householdSnapshots.householdId, householdId),
                gte(householdSnapshots.snapshotDate, startDateStr)
            ))
            .orderBy(asc(householdSnapshots.snapshotDate));

        return snapshots.map(s => ({
            date: s.snapshotDate,
            netWorth: Number(s.totalNetWorth),
            assets: Number(s.totalAssets),
            liabilities: Number(s.totalLiabilities),
            allocation: s.assetAllocation,
        }));
    }

    /**
     * Get consolidated household spending
     */
    async getHouseholdSpending(householdId, { period = 'month', months = 3 } = {}) {
        const household = await db.query.households.findFirst({
            where: eq(households.id, householdId),
            with: { members: true, accounts: true }
        });

        if (!household) {
            throw new AppError(404, 'Household not found');
        }

        // Get all member IDs
        const memberIds = household.members.map(m => m.userId);

        // Get spending summaries
        const summaries = await db.select()
            .from(householdSpendingSummaries)
            .where(and(
                eq(householdSpendingSummaries.householdId, householdId),
                eq(householdSpendingSummaries.summaryPeriod, period)
            ))
            .orderBy(desc(householdSpendingSummaries.summaryDate))
            .limit(months);

        return summaries;
    }

    /**
     * Create household joint goal
     */
    async createJointGoal(householdId, userId, {
        goalName, goalType, targetAmount, deadline, priority = 'medium',
        fundingStrategy = 'proportional', memberContributions = {}
    }) {
        const member = await db.query.householdMembers.findFirst({
            where: and(
                eq(householdMembers.householdId, householdId),
                eq(householdMembers.userId, userId)
            )
        });

        if (!member) {
            throw new AppError(403, 'Not a household member');
        }

        const [goal] = await db.insert(householdGoals).values({
            householdId,
            createdByUserId: userId,
            goalName: goalName.trim(),
            goalType,
            targetAmount: String(targetAmount),
            deadline: new Date(deadline),
            priority,
            fundingStrategy,
            memberContributions: memberContributions || {},
            status: 'active',
        }).returning();

        return goal;
    }

    /**
     * Request approval from household members (collaborative approvals)
     */
    async requestApproval(householdId, userId, {
        requestType, referenceId, description, requiredApprovers
    }) {
        const [approval] = await db.insert(householdApprovals).values({
            householdId,
            requestType,
            referenceId,
            requestedBy: userId,
            description,
            requiredApprovers: requiredApprovers || [],
            status: 'pending',
        }).returning();

        return approval;
    }

    /**
     * Approve or reject household request
     */
    async respondToApproval(approvalId, userId, { action, notes }) {
        const approval = await db.query.householdApprovals.findFirst({
            where: eq(householdApprovals.id, approvalId)
        });

        if (!approval) {
            throw new AppError(404, 'Approval request not found');
        }

        const requiredApprovers = approval.requiredApprovers || [];
        if (!requiredApprovers.includes(userId)) {
            throw new AppError(403, 'You are not authorized to approve this request');
        }

        let currentApprovals = approval.currentApprovals || [];
        let rejections = approval.rejections || [];

        if (action === 'approve') {
            currentApprovals.push({ userId, approvalDate: new Date(), notes });
        } else if (action === 'reject') {
            rejections.push({ userId, rejectionDate: new Date(), reason: notes });
        }

        const minRequired = approval.minApprovalsRequired || 1;
        const allApprovals = currentApprovals.filter(a => a.userId) || [];
        const newStatus = allApprovals.length >= minRequired ? 'approved' : (rejections.length > 0 ? 'rejected' : 'pending');

        const [updated] = await db.update(householdApprovals)
            .set({
                currentApprovals,
                rejections,
                status: newStatus,
                decidedAt: new Date(),
                decidedBy: userId,
            })
            .where(eq(householdApprovals.id, approvalId))
            .returning();

        return updated;
    }

    /**
     * Helper: Validate user is household member
     */
    validateMemberAccess(members, userId) {
        const isMember = members.some(m => m.userId === userId);
        if (!isMember) {
            throw new AppError(403, 'Not a member of this household');
        }
    }

    /**
     * Get aggregated household portfolio performance
     */
    async getHouseholdPerformance(householdId, { period = '1y' } = {}) {
        const household = await db.query.households.findFirst({
            where: eq(households.id, householdId),
            with: { snapshots: true }
        });

        if (!household) {
            throw new AppError(404, 'Household not found');
        }

        // Get snapshots for period
        let snapshots = household.snapshots || [];

        // Filter by period
        const daysMap = { '1m': 30, '3m': 90, '6m': 180, '1y': 365 };
        const days = daysMap[period] || 365;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        snapshots = snapshots.filter(s => new Date(s.snapshotDate) >= cutoffDate);

        if (snapshots.length < 2) {
            return { period, data: [], performance: null };
        }

        // Calculate metrics
        const firstSnapshot = snapshots[0];
        const lastSnapshot = snapshots[snapshots.length - 1];

        const startNetWorth = Number(firstSnapshot.totalNetWorth);
        const endNetWorth = Number(lastSnapshot.totalNetWorth);
        const totalReturn = ((endNetWorth - startNetWorth) / startNetWorth) * 100;

        return {
            period,
            totalReturn: totalReturn.toFixed(2),
            startNetWorth,
            endNetWorth,
            snapshots: snapshots.map(s => ({
                date: s.snapshotDate,
                netWorth: Number(s.totalNetWorth),
                allocation: s.assetAllocation,
            }))
        };
    }
}

export default new HouseholdService();
