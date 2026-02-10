import db from '../config/db.js';
import { settlements, settlementTransactions, users } from '../db/schema.js';
import { eq, and, or, inArray, desc, sql } from 'drizzle-orm';
import splitCalculator from './splitCalculator.js';

/**
 * Settlement Engine - Manages collaborative expense splitting and settlements
 * Handles complex split scenarios and real-time settlement tracking
 */
class SettlementEngine {
    /**
     * Create a new settlement
     */
    async createSettlement(settlementData) {
        try {
            const {
                expenseId,
                creatorId,
                title,
                description,
                totalAmount,
                currency = 'USD',
                splitType,
                participants,
                dueDate,
                isRecurring = false,
                recurringFrequency
            } = settlementData;

            // Calculate split amounts based on type
            const splitRule = await splitCalculator.calculateSplit(
                totalAmount,
                splitType,
                participants
            );

            // Validate split rule
            const validation = splitCalculator.validateSplitRule(splitRule);
            if (!validation.valid) {
                throw new Error(`Invalid split rule: ${validation.errors.join(', ')}`);
            }

            // Create settlement
            const [settlement] = await db.insert(settlements).values({
                expenseId,
                creatorId,
                title,
                description,
                totalAmount: totalAmount.toString(),
                currency,
                splitType,
                splitRule,
                status: 'pending',
                settledAmount: '0',
                remainingAmount: totalAmount.toString(),
                dueDate: dueDate ? new Date(dueDate) : null,
                isRecurring,
                recurringFrequency,
                metadata: {
                    participantCount: participants.length,
                    createdBy: creatorId
                }
            }).returning();

            // Create individual transactions for each participant
            const transactions = await this.createTransactions(settlement.id, splitRule, dueDate);

            return {
                settlement,
                transactions,
                summary: {
                    totalParticipants: participants.length,
                    totalAmount,
                    splitType,
                    transactionCount: transactions.length
                }
            };
        } catch (error) {
            console.error('Failed to create settlement:', error);
            throw new Error(`Settlement creation failed: ${error.message}`);
        }
    }

    /**
     * Create settlement transactions
     */
    async createTransactions(settlementId, splitRule, dueDate) {
        const transactions = [];

        for (const participant of splitRule.participants) {
            if (participant.amount > 0 && participant.userId !== splitRule.payeeId) {
                const [transaction] = await db.insert(settlementTransactions).values({
                    settlementId,
                    payerId: participant.userId,
                    payeeId: splitRule.payeeId || splitRule.creatorId,
                    amount: participant.amount.toString(),
                    amountDue: participant.amount.toString(),
                    amountPaid: '0',
                    amountRemaining: participant.amount.toString(),
                    status: 'pending',
                    dueDate: dueDate ? new Date(dueDate) : null
                }).returning();

                transactions.push(transaction);
            }
        }

        return transactions;
    }

    /**
     * Record a payment for a settlement transaction
     */
    async recordPayment(paymentData) {
        try {
            const {
                transactionId,
                amount,
                paymentMethod,
                paymentReference,
                notes
            } = paymentData;

            // Get transaction
            const [transaction] = await db.select()
                .from(settlementTransactions)
                .where(eq(settlementTransactions.id, transactionId));

            if (!transaction) {
                throw new Error('Transaction not found');
            }

            const amountPaid = parseFloat(transaction.amountPaid) + parseFloat(amount);
            const amountRemaining = parseFloat(transaction.amountDue) - amountPaid;

            // Determine new status
            let newStatus = 'pending';
            if (amountRemaining <= 0) {
                newStatus = 'paid';
            } else if (amountPaid > 0) {
                newStatus = 'partial';
            }

            // Update transaction
            const [updatedTransaction] = await db.update(settlementTransactions)
                .set({
                    amountPaid: amountPaid.toString(),
                    amountRemaining: Math.max(0, amountRemaining).toString(),
                    status: newStatus,
                    paymentMethod,
                    paymentReference,
                    notes,
                    paidAt: newStatus === 'paid' ? new Date() : transaction.paidAt,
                    updatedAt: new Date()
                })
                .where(eq(settlementTransactions.id, transactionId))
                .returning();

            // Update settlement status
            await this.updateSettlementStatus(transaction.settlementId);

            return updatedTransaction;
        } catch (error) {
            console.error('Failed to record payment:', error);
            throw new Error(`Payment recording failed: ${error.message}`);
        }
    }

    /**
     * Update settlement status based on transactions
     */
    async updateSettlementStatus(settlementId) {
        try {
            // Get all transactions for this settlement
            const transactions = await db.select()
                .from(settlementTransactions)
                .where(eq(settlementTransactions.settlementId, settlementId));

            // Calculate totals
            const totalPaid = transactions.reduce((sum, txn) =>
                sum + parseFloat(txn.amountPaid), 0
            );
            const totalDue = transactions.reduce((sum, txn) =>
                sum + parseFloat(txn.amountDue), 0
            );
            const remainingAmount = totalDue - totalPaid;

            // Determine status
            let status = 'pending';
            if (remainingAmount <= 0) {
                status = 'completed';
            } else if (totalPaid > 0) {
                status = 'partial';
            }

            // Check for overdue transactions
            const now = new Date();
            const hasOverdue = transactions.some(txn =>
                txn.status !== 'paid' &&
                txn.dueDate &&
                new Date(txn.dueDate) < now
            );

            // Update settlement
            const [updatedSettlement] = await db.update(settlements)
                .set({
                    settledAmount: totalPaid.toString(),
                    remainingAmount: Math.max(0, remainingAmount).toString(),
                    status,
                    completedAt: status === 'completed' ? new Date() : null,
                    updatedAt: new Date(),
                    metadata: sql`metadata || ${JSON.stringify({ hasOverdue })}`
                })
                .where(eq(settlements.id, settlementId))
                .returning();

            return updatedSettlement;
        } catch (error) {
            console.error('Failed to update settlement status:', error);
            throw error;
        }
    }

    /**
     * Get settlement details with transactions
     */
    async getSettlement(settlementId) {
        try {
            const [settlement] = await db.select()
                .from(settlements)
                .where(eq(settlements.id, settlementId));

            if (!settlement) {
                throw new Error('Settlement not found');
            }

            const transactions = await db.select()
                .from(settlementTransactions)
                .where(eq(settlementTransactions.settlementId, settlementId))
                .orderBy(desc(settlementTransactions.createdAt));

            return {
                ...settlement,
                transactions,
                summary: {
                    totalTransactions: transactions.length,
                    paidTransactions: transactions.filter(t => t.status === 'paid').length,
                    pendingTransactions: transactions.filter(t => t.status === 'pending').length,
                    partialTransactions: transactions.filter(t => t.status === 'partial').length
                }
            };
        } catch (error) {
            console.error('Failed to get settlement:', error);
            throw error;
        }
    }

    /**
     * Get all settlements for a user
     */
    async getUserSettlements(userId, filters = {}) {
        try {
            const { status, limit = 50, offset = 0 } = filters;

            let query = db.select()
                .from(settlements)
                .where(
                    or(
                        eq(settlements.creatorId, userId),
                        sql`${settlements.splitRule}::jsonb @> ${JSON.stringify({ participants: [{ userId }] })}`
                    )
                );

            if (status) {
                query = query.where(eq(settlements.status, status));
            }

            const results = await query
                .orderBy(desc(settlements.createdAt))
                .limit(limit)
                .offset(offset);

            return results;
        } catch (error) {
            console.error('Failed to get user settlements:', error);
            throw error;
        }
    }

    /**
     * Get settlement summary for a user
     */
    async getSettlementSummary(userId) {
        try {
            // Get all transactions where user is payer or payee
            const payerTransactions = await db.select()
                .from(settlementTransactions)
                .where(eq(settlementTransactions.payerId, userId));

            const payeeTransactions = await db.select()
                .from(settlementTransactions)
                .where(eq(settlementTransactions.payeeId, userId));

            // Calculate amounts owed by user
            const totalOwed = payerTransactions
                .filter(t => t.status !== 'paid')
                .reduce((sum, t) => sum + parseFloat(t.amountRemaining), 0);

            // Calculate amounts owed to user
            const totalOwedToUser = payeeTransactions
                .filter(t => t.status !== 'paid')
                .reduce((sum, t) => sum + parseFloat(t.amountRemaining), 0);

            // Calculate net position
            const netPosition = totalOwedToUser - totalOwed;

            return {
                totalOwed,
                totalOwedToUser,
                netPosition,
                status: netPosition > 0 ? 'creditor' : netPosition < 0 ? 'debtor' : 'settled',
                transactions: {
                    asPayer: payerTransactions.length,
                    asPayee: payeeTransactions.length,
                    total: payerTransactions.length + payeeTransactions.length
                }
            };
        } catch (error) {
            console.error('Failed to get settlement summary:', error);
            throw error;
        }
    }

    /**
     * Calculate optimal settlement path (minimize transactions)
     */
    async calculateOptimalSettlement(userId) {
        try {
            // Get all pending transactions for user
            const transactions = await db.select()
                .from(settlementTransactions)
                .where(
                    and(
                        or(
                            eq(settlementTransactions.payerId, userId),
                            eq(settlementTransactions.payeeId, userId)
                        ),
                        inArray(settlementTransactions.status, ['pending', 'partial'])
                    )
                );

            // Build debt graph
            const debts = {};

            transactions.forEach(txn => {
                const payer = txn.payerId;
                const payee = txn.payeeId;
                const amount = parseFloat(txn.amountRemaining);

                if (!debts[payer]) debts[payer] = {};
                if (!debts[payer][payee]) debts[payer][payee] = 0;
                debts[payer][payee] += amount;
            });

            // Optimize using graph algorithm
            const optimized = splitCalculator.optimizeSettlementPath(debts);

            return {
                original: {
                    transactionCount: transactions.length,
                    totalAmount: transactions.reduce((sum, t) =>
                        sum + parseFloat(t.amountRemaining), 0
                    )
                },
                optimized: {
                    transactionCount: optimized.length,
                    transactions: optimized,
                    savings: transactions.length - optimized.length
                }
            };
        } catch (error) {
            console.error('Failed to calculate optimal settlement:', error);
            throw error;
        }
    }

    /**
     * Cancel a settlement
     */
    async cancelSettlement(settlementId, userId) {
        try {
            const [settlement] = await db.select()
                .from(settlements)
                .where(eq(settlements.id, settlementId));

            if (!settlement) {
                throw new Error('Settlement not found');
            }

            if (settlement.creatorId !== userId) {
                throw new Error('Only the creator can cancel a settlement');
            }

            if (settlement.status === 'completed') {
                throw new Error('Cannot cancel a completed settlement');
            }

            // Cancel all pending transactions
            await db.update(settlementTransactions)
                .set({ status: 'cancelled', updatedAt: new Date() })
                .where(
                    and(
                        eq(settlementTransactions.settlementId, settlementId),
                        inArray(settlementTransactions.status, ['pending', 'partial'])
                    )
                );

            // Update settlement status
            const [updated] = await db.update(settlements)
                .set({
                    status: 'cancelled',
                    updatedAt: new Date()
                })
                .where(eq(settlements.id, settlementId))
                .returning();

            return updated;
        } catch (error) {
            console.error('Failed to cancel settlement:', error);
            throw error;
        }
    }
}

export default new SettlementEngine();
