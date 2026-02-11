/**
 * Settlement Service
 * Handles debt calculation, simplification, and settlement management for collaborative vaults
 */

import { db } from '../config/db.js';
import { 
    vaultBalances, 
    settlements, 
    debtTransactions, 
    expenses, 
    users, 
    vaultMembers,
    vaults 
} from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import {
    simplifyDebts,
    calculateNetBalances,
    calculateOwedBreakdown,
    calculateUserTotals,
    calculateSettlementPriority,
    calculateEqualSplit,
    calculatePercentageSplit,
    calculateExactSplit,
    roundCurrency,
    addCurrency,
    subtractCurrency
} from '../utils/ledgerMath.js';

/**
 * Create debt transactions when an expense is added to a vault
 * @param {Object} expense - Expense object
 * @param {string} paidById - User who paid for the expense
 * @param {Array} splitDetails - Array of {userId, splitType, splitValue}
 * @returns {Array} Created debt transactions
 */
export async function createDebtTransactions(expense, paidById, splitDetails) {
    const { id: expenseId, amount, vaultId } = expense;
    
    if (!vaultId) {
        throw new Error('Expense must belong to a vault for debt tracking');
    }

    const transactions = [];
    let calculatedSplits = [];

    // Determine split type and calculate amounts
    if (splitDetails && splitDetails.length > 0) {
        const firstSplit = splitDetails[0];
        
        if (firstSplit.splitType === 'percentage') {
            calculatedSplits = calculatePercentageSplit(
                amount,
                splitDetails.map(s => ({ userId: s.userId, percentage: s.splitValue }))
            );
        } else if (firstSplit.splitType === 'exact') {
            calculatedSplits = calculateExactSplit(
                amount,
                splitDetails.map(s => ({ userId: s.userId, amount: s.splitValue }))
            );
        } else { // equal split
            const memberIds = splitDetails.map(s => s.userId);
            const split = calculateEqualSplit(amount, memberIds.length);
            
            calculatedSplits = memberIds.map((userId, index) => ({
                userId,
                amount: split.perPerson + (index === 0 ? split.remainder : 0)
            }));
        }
    } else {
        // Default: equal split among all vault members
        const members = await db.select({ userId: vaultMembers.userId })
            .from(vaultMembers)
            .where(eq(vaultMembers.vaultId, vaultId));
        
        const split = calculateEqualSplit(amount, members.length);
        calculatedSplits = members.map((m, index) => ({
            userId: m.userId,
            amount: split.perPerson + (index === 0 ? split.remainder : 0)
        }));
    }

    // Create debt transaction for each split (excluding the payer owing themselves)
    for (const split of calculatedSplits) {
        if (split.userId !== paidById && split.amount > 0) {
            const [transaction] = await db.insert(debtTransactions).values({
                vaultId,
                expenseId,
                paidById,
                owedById: split.userId,
                amount: split.amount,
                splitType: splitDetails?.[0]?.splitType || 'equal',
                splitValue: split.amount,
                isSettled: false
            }).returning();
            
            transactions.push(transaction);
        }
    }

    // Update vault balances
    await updateVaultBalances(vaultId);

    return transactions;
}

/**
 * Update vault balances based on debt transactions
 * @param {string} vaultId - Vault ID
 */
export async function updateVaultBalances(vaultId) {
    // Get all vault members
    const members = await db.select({ userId: vaultMembers.userId })
        .from(vaultMembers)
        .where(eq(vaultMembers.vaultId, vaultId));

    // Get all debt transactions for this vault
    const debts = await db.select()
        .from(debtTransactions)
        .where(eq(debtTransactions.vaultId, vaultId));

    // Calculate net balances
    const balances = calculateNetBalances(debts, members.map(m => m.userId));

    // Update or create balance records
    for (const [userId, balance] of Object.entries(balances)) {
        const existing = await db.select()
            .from(vaultBalances)
            .where(
                and(
                    eq(vaultBalances.vaultId, vaultId),
                    eq(vaultBalances.userId, userId)
                )
            )
            .limit(1);

        if (existing.length > 0) {
            await db.update(vaultBalances)
                .set({ 
                    balance: balance.toString(),
                    updatedAt: new Date()
                })
                .where(eq(vaultBalances.id, existing[0].id));
        } else {
            await db.insert(vaultBalances).values({
                vaultId,
                userId,
                balance: balance.toString()
            });
        }
    }
}

/**
 * Get simplified debt structure for a vault (who owes whom)
 * @param {string} vaultId - Vault ID
 * @returns {Object} Simplified debt structure
 */
export async function getSimplifiedDebts(vaultId) {
    // Get current balances
    const balanceRecords = await db.select()
        .from(vaultBalances)
        .where(eq(vaultBalances.vaultId, vaultId));

    if (balanceRecords.length === 0) {
        return {
            vaultId,
            transactions: [],
            totalDebt: 0,
            members: []
        };
    }

    // Convert to format for simplification
    const balances = balanceRecords.map(b => ({
        userId: b.userId,
        balance: parseFloat(b.balance)
    }));

    // Simplify debts
    const simplifiedTransactions = simplifyDebts(balances);
    
    // Calculate totals
    const totalDebt = simplifiedTransactions.reduce((sum, t) => sum + t.amount, 0);

    // Get user details
    const userIds = [...new Set(simplifiedTransactions.flatMap(t => [t.from, t.to]))];
    const userRecords = await db.select({
        id: users.id,
        name: users.name,
        email: users.email
    }).from(users).where(sql`${users.id} IN ${userIds}`);

    const userMap = {};
    userRecords.forEach(u => {
        userMap[u.id] = { name: u.name, email: u.email };
    });

    // Enrich transactions with user details
    const enrichedTransactions = simplifiedTransactions.map(t => ({
        ...t,
        fromUser: userMap[t.from],
        toUser: userMap[t.to]
    }));

    // Calculate settlement priority
    const prioritizedTransactions = calculateSettlementPriority(enrichedTransactions);

    return {
        vaultId,
        transactions: prioritizedTransactions,
        totalDebt: roundCurrency(totalDebt),
        memberCount: balanceRecords.length,
        lastUpdated: new Date()
    };
}

/**
 * Get detailed breakdown for a specific user
 * @param {string} vaultId - Vault ID
 * @param {string} userId - User ID
 * @returns {Object} User's debt breakdown
 */
export async function getUserDebtBreakdown(vaultId, userId) {
    // Get all balances for the vault
    const balanceRecords = await db.select()
        .from(vaultBalances)
        .where(eq(vaultBalances.vaultId, vaultId));

    const balances = {};
    balanceRecords.forEach(b => {
        balances[b.userId] = parseFloat(b.balance);
    });

    // Get breakdown
    const breakdown = calculateOwedBreakdown(balances);
    const userBreakdown = breakdown.find(b => b.userId === userId);

    if (!userBreakdown) {
        return {
            userId,
            vaultId,
            netBalance: 0,
            owes: [],
            owed: [],
            totalOwing: 0,
            totalOwed: 0
        };
    }

    // Enrich with user details
    const relatedUserIds = [
        ...userBreakdown.owes.map(o => o.to),
        ...userBreakdown.owed.map(o => o.from)
    ];

    const userRecords = await db.select({
        id: users.id,
        name: users.name,
        email: users.email
    }).from(users).where(sql`${users.id} IN ${relatedUserIds}`);

    const userMap = {};
    userRecords.forEach(u => {
        userMap[u.id] = { name: u.name, email: u.email };
    });

    return {
        userId,
        vaultId,
        netBalance: userBreakdown.netBalance,
        owes: userBreakdown.owes.map(o => ({
            ...o,
            user: userMap[o.to]
        })),
        owed: userBreakdown.owed.map(o => ({
            ...o,
            user: userMap[o.from]
        })),
        totalOwing: userBreakdown.owes.reduce((sum, o) => sum + o.amount, 0),
        totalOwed: userBreakdown.owed.reduce((sum, o) => sum + o.amount, 0)
    };
}

/**
 * Create a settlement between two users
 * @param {Object} settlementData - {vaultId, payerId, payeeId, amount, description}
 * @returns {Object} Created settlement
 */
export async function createSettlement(settlementData) {
    const { vaultId, payerId, payeeId, amount, description } = settlementData;

    // Validate that both users are vault members
    const payerMember = await db.select()
        .from(vaultMembers)
        .where(and(
            eq(vaultMembers.vaultId, vaultId),
            eq(vaultMembers.userId, payerId)
        ))
        .limit(1);

    const payeeMember = await db.select()
        .from(vaultMembers)
        .where(and(
            eq(vaultMembers.vaultId, vaultId),
            eq(vaultMembers.userId, payeeId)
        ))
        .limit(1);

    if (payerMember.length === 0 || payeeMember.length === 0) {
        throw new Error('Both users must be members of the vault');
    }

    // Create settlement
    const [settlement] = await db.insert(settlements).values({
        vaultId,
        payerId,
        payeeId,
        amount: amount.toString(),
        description,
        status: 'pending',
        confirmedByPayer: false,
        confirmedByPayee: false
    }).returning();

    return settlement;
}

/**
 * Confirm a settlement (by payer or payee)
 * @param {string} settlementId - Settlement ID
 * @param {string} userId - User confirming
 * @param {string} role - 'payer' or 'payee'
 * @returns {Object} Updated settlement
 */
export async function confirmSettlement(settlementId, userId, role) {
    const [settlement] = await db.select()
        .from(settlements)
        .where(eq(settlements.id, settlementId))
        .limit(1);

    if (!settlement) {
        throw new Error('Settlement not found');
    }

    if (settlement.status === 'confirmed') {
        throw new Error('Settlement already confirmed');
    }

    const updates = {
        updatedAt: new Date()
    };

    if (role === 'payer' && settlement.payerId === userId) {
        updates.confirmedByPayer = true;
    } else if (role === 'payee' && settlement.payeeId === userId) {
        updates.confirmedByPayee = true;
    } else {
        throw new Error('User not authorized to confirm this settlement');
    }

    // Check if both parties have confirmed
    const bothConfirmed = (
        (role === 'payer' && settlement.confirmedByPayee) ||
        (role === 'payee' && settlement.confirmedByPayer)
    ) && updates.confirmedByPayer !== false && updates.confirmedByPayee !== false;

    if (bothConfirmed) {
        updates.status = 'confirmed';
        updates.settledAt = new Date();
        
        // Mark related debt transactions as settled
        await settleDebtsBetweenUsers(
            settlement.vaultId,
            settlement.payerId,
            settlement.payeeId,
            parseFloat(settlement.amount)
        );
    }

    const [updated] = await db.update(settlements)
        .set(updates)
        .where(eq(settlements.id, settlementId))
        .returning();

    return updated;
}

/**
 * Mark debt transactions as settled between two users
 * @param {string} vaultId - Vault ID
 * @param {string} userId1 - First user
 * @param {string} userId2 - Second user
 * @param {number} amount - Amount settled
 */
async function settleDebtsBetweenUsers(vaultId, userId1, userId2, amount) {
    let remaining = amount;

    // Get unsettled debts between these users (in either direction)
    const debts = await db.select()
        .from(debtTransactions)
        .where(
            and(
                eq(debtTransactions.vaultId, vaultId),
                eq(debtTransactions.isSettled, false),
                sql`(
                    (${debtTransactions.paidById} = ${userId1} AND ${debtTransactions.owedById} = ${userId2}) OR
                    (${debtTransactions.paidById} = ${userId2} AND ${debtTransactions.owedById} = ${userId1})
                )`
            )
        )
        .orderBy(debtTransactions.createdAt);

    for (const debt of debts) {
        if (remaining <= 0) break;

        const debtAmount = parseFloat(debt.amount);
        
        if (debtAmount <= remaining) {
            // Fully settle this debt
            await db.update(debtTransactions)
                .set({ 
                    isSettled: true,
                    settledAt: new Date()
                })
                .where(eq(debtTransactions.id, debt.id));
            
            remaining = subtractCurrency(remaining, debtAmount);
        }
    }

    // Update vault balances
    await updateVaultBalances(vaultId);
}

/**
 * Get settlement history for a vault
 * @param {string} vaultId - Vault ID
 * @param {Object} options - {limit, offset, status}
 * @returns {Array} Settlements
 */
export async function getSettlementHistory(vaultId, options = {}) {
    const { limit = 50, offset = 0, status } = options;

    let query = db.select({
        settlement: settlements,
        payer: {
            id: users.id,
            name: users.name,
            email: users.email
        },
        payee: {
            id: sql`payee_user.id`,
            name: sql`payee_user.name`,
            email: sql`payee_user.email`
        }
    })
    .from(settlements)
    .leftJoin(users, eq(settlements.payerId, users.id))
    .leftJoin(sql`users as payee_user`, sql`${settlements.payeeId} = payee_user.id`)
    .where(eq(settlements.vaultId, vaultId));

    if (status) {
        query = query.where(eq(settlements.status, status));
    }

    const results = await query
        .orderBy(sql`${settlements.createdAt} DESC`)
        .limit(limit)
        .offset(offset);

    return results;
}

/**
 * Cancel a pending settlement
 * @param {string} settlementId - Settlement ID
 * @param {string} userId - User canceling (must be payer or payee)
 * @returns {Object} Cancelled settlement
 */
export async function cancelSettlement(settlementId, userId) {
    const [settlement] = await db.select()
        .from(settlements)
        .where(eq(settlements.id, settlementId))
        .limit(1);

    if (!settlement) {
        throw new Error('Settlement not found');
    }

    if (settlement.status !== 'pending') {
        throw new Error('Only pending settlements can be cancelled');
    }

    if (settlement.payerId !== userId && settlement.payeeId !== userId) {
        throw new Error('Only payer or payee can cancel the settlement');
    }

    const [cancelled] = await db.update(settlements)
        .set({ 
            status: 'cancelled',
            updatedAt: new Date()
        })
        .where(eq(settlements.id, settlementId))
        .returning();

    return cancelled;
}

/**
 * Get pending settlements for a user across all vaults
 * @param {string} userId - User ID
 * @returns {Array} Pending settlements
 */
export async function getUserPendingSettlements(userId) {
    const results = await db.select({
        settlement: settlements,
        vault: vaults,
        payer: {
            id: users.id,
            name: users.name
        },
        payee: {
            id: sql`payee_user.id`,
            name: sql`payee_user.name`
        }
    })
    .from(settlements)
    .leftJoin(vaults, eq(settlements.vaultId, vaults.id))
    .leftJoin(users, eq(settlements.payerId, users.id))
    .leftJoin(sql`users as payee_user`, sql`${settlements.payeeId} = payee_user.id`)
    .where(
        and(
            sql`(${settlements.payerId} = ${userId} OR ${settlements.payeeId} = ${userId})`,
            eq(settlements.status, 'pending')
        )
    )
    .orderBy(sql`${settlements.createdAt} DESC`);

    return results;
}

export default {
    createDebtTransactions,
    updateVaultBalances,
    getSimplifiedDebts,
    getUserDebtBreakdown,
    createSettlement,
    confirmSettlement,
    cancelSettlement,
    getSettlementHistory,
    getUserPendingSettlements
};
