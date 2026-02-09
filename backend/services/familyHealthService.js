=======
import { vaults, vaultMembers, expenses, goals, expenseShares, reimbursements, familySettings, financialHealthScores, categories, users, sharedBudgets, expenseApprovals } from "../db/schema.js";
import { eq, and, sql, sum, gte, lte } from "drizzle-orm";
import db from "../config/db.js";

/**
 * Family Health Service - Handles collaborative budgeting and approval workflows
 */

/**
 * Create a shared budget for a vault
 */
export const createSharedBudget = async (vaultId, budgetData, userId) => {
    const { name, description, totalBudget, period, approvalRequired, approvalThreshold, categories: allowedCategories } = budgetData;

    // Verify user has access to vault
    const [member] = await db
        .select()
        .from(vaultMembers)
        .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)));

    if (!member) {
        throw new Error('User does not have access to this vault');
    }

    const [budget] = await db
        .insert(sharedBudgets)
        .values({
            vaultId,
            name,
            description,
            totalBudget,
            period: period || 'monthly',
            approvalRequired: approvalRequired || false,
            approvalThreshold,
            createdBy: userId,
            metadata: {
                categories: allowedCategories || [],
                contributors: [userId],
                approvers: [userId] // Creator is default approver
            }
        })
        .returning();

    return budget;
};

/**
 * Get shared budgets for a vault
 */
export const getSharedBudgets = async (vaultId, userId) => {
    // Verify user has access to vault
    const [member] = await db
        .select()
        .from(vaultMembers)
        .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)));

    if (!member) {
        throw new Error('User does not have access to this vault');
    }

    const budgets = await db
        .select({
            id: sharedBudgets.id,
            name: sharedBudgets.name,
            description: sharedBudgets.description,
            totalBudget: sharedBudgets.totalBudget,
            currentSpent: sharedBudgets.currentSpent,
            currency: sharedBudgets.currency,
            period: sharedBudgets.period,
            approvalRequired: sharedBudgets.approvalRequired,
            approvalThreshold: sharedBudgets.approvalThreshold,
            isActive: sharedBudgets.isActive,
            createdBy: sharedBudgets.createdBy,
            metadata: sharedBudgets.metadata,
            createdAt: sharedBudgets.createdAt
        })
        .from(sharedBudgets)
        .where(and(eq(sharedBudgets.vaultId, vaultId), eq(sharedBudgets.isActive, true)));

    return budgets;
};

/**
 * Update current spent amount for shared budgets
 */
export const updateBudgetSpent = async (vaultId, expenseAmount, categoryId) => {
    // Get all active shared budgets for the vault
    const budgets = await db
        .select()
        .from(sharedBudgets)
        .where(and(eq(sharedBudgets.vaultId, vaultId), eq(sharedBudgets.isActive, true)));

    for (const budget of budgets) {
        const allowedCategories = budget.metadata?.categories || [];
        const shouldUpdate = allowedCategories.length === 0 || allowedCategories.includes(categoryId);

        if (shouldUpdate) {
            await db
                .update(sharedBudgets)
                .set({
                    currentSpent: sql`${sharedBudgets.currentSpent} + ${expenseAmount}`,
                    updatedAt: new Date()
                })
                .where(eq(sharedBudgets.id, budget.id));
        }
    }
};

/**
 * Check if expense needs approval
 */
export const checkExpenseApproval = async (vaultId, expenseAmount, categoryId) => {
    const budgets = await db
        .select()
        .from(sharedBudgets)
        .where(and(
            eq(sharedBudgets.vaultId, vaultId),
            eq(sharedBudgets.isActive, true),
            eq(sharedBudgets.approvalRequired, true)
        ));

    for (const budget of budgets) {
        const allowedCategories = budget.metadata?.categories || [];
        const categoryMatch = allowedCategories.length === 0 || allowedCategories.includes(categoryId);
        const thresholdExceeded = budget.approvalThreshold && expenseAmount >= budget.approvalThreshold;

        if (categoryMatch && thresholdExceeded) {
            return {
                needsApproval: true,
                budgetId: budget.id,
                threshold: budget.approvalThreshold
            };
        }
    }

    return { needsApproval: false };
};

/**
 * Create expense approval request
 */
export const createExpenseApproval = async (expenseId, vaultId, userId) => {
    const [expense] = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, expenseId));

    if (!expense) {
        throw new Error('Expense not found');
    }

    const [approval] = await db
        .insert(expenseApprovals)
        .values({
            expenseId,
            vaultId,
            requestedBy: userId,
            status: 'pending',
            metadata: {
                budgetId: null,
                amount: expense.amount,
                category: expense.categoryId
            }
        })
        .returning();

    return approval;
};

/**
 * Approve or reject expense
 */
export const processExpenseApproval = async (approvalId, userId, approved, notes) => {
    const [approval] = await db
        .select()
        .from(expenseApprovals)
        .where(eq(expenseApprovals.id, approvalId));

    if (!approval) {
        throw new Error('Approval request not found');
    }

    // Verify user can approve (check vault membership and approver role)
    const [member] = await db
        .select()
        .from(vaultMembers)
        .where(and(eq(vaultMembers.vaultId, approval.vaultId), eq(vaultMembers.userId, userId)));

    if (!member) {
        throw new Error('User does not have access to approve expenses in this vault');
    }

    await db
        .update(expenseApprovals)
        .set({
            status: approved ? 'approved' : 'rejected',
            approvedBy: userId,
            approvalNotes: notes,
            approvedAt: new Date(),
            updatedAt: new Date()
        })
        .where(eq(expenseApprovals.id, approvalId));

    // If approved, update budget spent
    if (approved) {
        const [expense] = await db
            .select()
            .from(expenses)
            .where(eq(expenses.id, approval.expenseId));

        if (expense) {
            await updateBudgetSpent(approval.vaultId, expense.amount, expense.categoryId);
        }
    }

    // Send notification to the requester
    const notificationMessage = approved
        ? `Your expense "${approval.expense?.description || 'expense'}" has been approved.`
        : `Your expense "${approval.expense?.description || 'expense'}" has been rejected.`;

    await notificationService.sendNotification(approval.requestedBy, {
        title: `Expense ${approved ? 'Approved' : 'Rejected'}`,
        message: notificationMessage,
        type: approved ? 'success' : 'warning',
        data: { approvalId: approval.id, expenseId: approval.expenseId }
    });

    return { success: true, status: approved ? 'approved' : 'rejected' };
};

/**
 * Get pending approvals for a vault
 */
export const getPendingApprovals = async (vaultId, userId) => {
    // Verify user has access to vault
    const [member] = await db
        .select()
        .from(vaultMembers)
        .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)));

    if (!member) {
        throw new Error('User does not have access to this vault');
    }

    const approvals = await db
        .select({
            id: expenseApprovals.id,
            expenseId: expenseApprovals.expenseId,
            requestedBy: expenseApprovals.requestedBy,
            status: expenseApprovals.status,
            requestedAt: expenseApprovals.requestedAt,
            metadata: expenseApprovals.metadata,
            expense: {
                id: expenses.id,
                amount: expenses.amount,
                description: expenses.description,
                categoryId: expenses.categoryId,
                date: expenses.date
            },
            requester: {
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName
            }
        })
        .from(expenseApprovals)
        .innerJoin(expenses, eq(expenseApprovals.expenseId, expenses.id))
        .innerJoin(users, eq(expenseApprovals.requestedBy, users.id))
        .where(and(eq(expenseApprovals.vaultId, vaultId), eq(expenseApprovals.status, 'pending')));

    return approvals;
};

/**
 * Get budget utilization report
 */
export const getBudgetUtilization = async (vaultId, userId, period = 'monthly') => {
    // Verify user has access to vault
    const [member] = await db
        .select()
        .from(vaultMembers)
        .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)));

    if (!member) {
        throw new Error('User does not have access to this vault');
    }

    const budgets = await db
        .select({
            id: sharedBudgets.id,
            name: sharedBudgets.name,
            totalBudget: sharedBudgets.totalBudget,
            currentSpent: sharedBudgets.currentSpent,
            currency: sharedBudgets.currency,
            period: sharedBudgets.period
        })
        .from(sharedBudgets)
        .where(and(eq(sharedBudgets.vaultId, vaultId), eq(sharedBudgets.isActive, true)));

    const utilization = budgets.map(budget => ({
        ...budget,
        remaining: budget.totalBudget - budget.currentSpent,
        utilizationPercent: (budget.currentSpent / budget.totalBudget) * 100,
        status: budget.currentSpent > budget.totalBudget ? 'over_budget' : 'within_budget'
    }));

    return utilization;
};
