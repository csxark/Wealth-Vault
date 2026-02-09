import db from '../config/db.js';
import { auditSnapshots, stateDeltas, expenses, goals, investments, debts } from '../db/schema.js';
import { eq, and, lte, gte } from 'drizzle-orm';

/**
 * State Reconstructor - Rebuilds account state at any point in time
 * Uses audit snapshots and state deltas to reconstruct historical states
 */
class StateReconstructor {
    /**
     * Reconstruct account state at a specific date
     * @param {string} userId - User ID
     * @param {Date} targetDate - Target date to reconstruct
     * @returns {Object} Reconstructed account state
     */
    async reconstructState(userId, targetDate) {
        try {
            // Find the closest snapshot before target date
            const [baselineSnapshot] = await db.select()
                .from(auditSnapshots)
                .where(and(
                    eq(auditSnapshots.userId, userId),
                    lte(auditSnapshots.snapshotDate, targetDate)
                ))
                .orderBy(auditSnapshots.snapshotDate, 'desc')
                .limit(1);

            if (!baselineSnapshot) {
                // No snapshot found, build from scratch
                return await this.buildStateFromScratch(userId, targetDate);
            }

            // Get all deltas between snapshot and target date
            const deltas = await db.select()
                .from(stateDeltas)
                .where(and(
                    eq(stateDeltas.userId, userId),
                    gte(stateDeltas.createdAt, baselineSnapshot.snapshotDate),
                    lte(stateDeltas.createdAt, targetDate)
                ))
                .orderBy(stateDeltas.createdAt, 'asc');

            // Apply deltas to baseline state
            let state = { ...baselineSnapshot.accountState };

            for (const delta of deltas) {
                state = this.applyDelta(state, delta);
            }

            return {
                date: targetDate,
                state,
                snapshotUsed: baselineSnapshot.id,
                deltasApplied: deltas.length
            };
        } catch (error) {
            console.error('State reconstruction failed:', error);
            throw new Error(`Failed to reconstruct state: ${error.message}`);
        }
    }

    /**
     * Build state from scratch by querying all resources up to target date
     */
    async buildStateFromScratch(userId, targetDate) {
        const [expenseData, goalData, investmentData, debtData] = await Promise.all([
            db.select().from(expenses).where(and(
                eq(expenses.userId, userId),
                lte(expenses.date, targetDate)
            )),
            db.select().from(goals).where(and(
                eq(goals.userId, userId),
                lte(goals.createdAt, targetDate)
            )),
            db.select().from(investments).where(and(
                eq(investments.userId, userId),
                lte(investments.createdAt, targetDate)
            )),
            db.select().from(debts).where(and(
                eq(debts.userId, userId),
                lte(debts.createdAt, targetDate)
            ))
        ]);

        return {
            date: targetDate,
            state: {
                expenses: expenseData,
                goals: goalData,
                investments: investmentData,
                debts: debtData,
                totalExpenses: expenseData.reduce((sum, e) => sum + parseFloat(e.amount), 0),
                totalInvestments: investmentData.reduce((sum, i) => sum + parseFloat(i.marketValue || 0), 0),
                totalDebts: debtData.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0)
            },
            snapshotUsed: null,
            deltasApplied: 0
        };
    }

    /**
     * Apply a state delta to current state
     */
    applyDelta(state, delta) {
        const { resourceType, operation, afterState } = delta;

        if (!state[resourceType]) {
            state[resourceType] = [];
        }

        switch (operation) {
            case 'CREATE':
                state[resourceType].push(afterState);
                break;
            case 'UPDATE':
                const updateIndex = state[resourceType].findIndex(r => r.id === afterState.id);
                if (updateIndex !== -1) {
                    state[resourceType][updateIndex] = afterState;
                }
                break;
            case 'DELETE':
                state[resourceType] = state[resourceType].filter(r => r.id !== delta.resourceId);
                break;
        }

        return state;
    }

    /**
     * Create a snapshot of current state for faster future reconstructions
     */
    async createSnapshot(userId) {
        try {
            const currentState = await this.buildStateFromScratch(userId, new Date());

            const [snapshot] = await db.insert(auditSnapshots).values({
                userId,
                snapshotDate: new Date(),
                accountState: currentState.state,
                transactionCount: currentState.state.expenses?.length || 0,
                checksum: this.generateChecksum(currentState.state),
                compressionType: 'none',
                metadata: {
                    createdBy: 'stateReconstructor',
                    version: '1.0'
                }
            }).returning();

            return snapshot;
        } catch (error) {
            console.error('Snapshot creation failed:', error);
            throw error;
        }
    }

    /**
     * Generate checksum for state integrity verification
     */
    generateChecksum(state) {
        const crypto = await import('crypto');
        return crypto.createHash('sha256')
            .update(JSON.stringify(state))
            .digest('hex');
    }
}

export default new StateReconstructor();
