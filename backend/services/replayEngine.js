import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import db from '../config/db.js';
import { auditSnapshots, stateDeltas, expenses, goals, categories } from '../db/schema.js';
import { eq, and, desc, lte, gte } from 'drizzle-orm';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class ReplayEngine {
    /**
     * Create a complete snapshot of user's financial state
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Snapshot data
     */
    async createSnapshot(userId) {
        try {
            // Fetch complete user state
            const [userExpenses, userGoals, userCategories] = await Promise.all([
                db.select().from(expenses).where(eq(expenses.userId, userId)),
                db.select().from(goals).where(eq(goals.userId, userId)),
                db.select().from(categories).where(eq(categories.userId, userId)),
            ]);

            // Calculate total balance
            const totalBalance = userExpenses
                .filter(e => e.status === 'completed')
                .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

            const accountState = {
                expenses: userExpenses,
                goals: userGoals,
                categories: userCategories,
                timestamp: new Date().toISOString(),
            };

            // Compress the state
            const stateString = JSON.stringify(accountState);
            const compressed = await gzip(stateString);

            // Generate checksum
            const checksum = crypto.createHash('sha256').update(stateString).digest('hex');

            // Save snapshot
            const [snapshot] = await db.insert(auditSnapshots).values({
                userId,
                snapshotDate: new Date(),
                totalBalance: totalBalance.toString(),
                accountState: compressed.toString('base64'), // Store as base64 string
                transactionCount: userExpenses.length,
                checksum,
                compressionType: 'gzip',
                metadata: {
                    goalsCount: userGoals.length,
                    categoriesCount: userCategories.length,
                    snapshotSize: compressed.length,
                    originalSize: stateString.length,
                },
            }).returning();

            return snapshot;
        } catch (error) {
            console.error('Snapshot creation error:', error);
            throw new Error('Failed to create snapshot');
        }
    }

    /**
     * Replay user's financial state at a specific point in time
     * @param {string} userId - User ID
     * @param {Date} targetDate - Target date to replay to
     * @returns {Promise<Object>} Reconstructed state
     */
    async replayToDate(userId, targetDate) {
        try {
            const startTime = Date.now();

            // Find the closest snapshot before the target date
            const [baseSnapshot] = await db
                .select()
                .from(auditSnapshots)
                .where(and(eq(auditSnapshots.userId, userId), lte(auditSnapshots.snapshotDate, targetDate)))
                .orderBy(desc(auditSnapshots.snapshotDate))
                .limit(1);

            let reconstructedState;

            if (baseSnapshot) {
                // Decompress snapshot
                const compressed = Buffer.from(baseSnapshot.accountState, 'base64');
                const decompressed = await gunzip(compressed);
                reconstructedState = JSON.parse(decompressed.toString());

                // Verify integrity
                const checksum = crypto.createHash('sha256').update(decompressed.toString()).digest('hex');
                if (checksum !== baseSnapshot.checksum) {
                    throw new Error('Snapshot integrity check failed');
                }

                // Apply deltas from snapshot date to target date
                const deltas = await db
                    .select()
                    .from(stateDeltas)
                    .where(
                        and(
                            eq(stateDeltas.userId, userId),
                            gte(stateDeltas.createdAt, baseSnapshot.snapshotDate),
                            lte(stateDeltas.createdAt, targetDate)
                        )
                    )
                    .orderBy(stateDeltas.createdAt);

                // Apply each delta to reconstruct state
                for (const delta of deltas) {
                    reconstructedState = this.applyDelta(reconstructedState, delta);
                }
            } else {
                // No snapshot found, build from scratch using all deltas up to target date
                const deltas = await db
                    .select()
                    .from(stateDeltas)
                    .where(and(eq(stateDeltas.userId, userId), lte(stateDeltas.createdAt, targetDate)))
                    .orderBy(stateDeltas.createdAt);

                reconstructedState = { expenses: [], goals: [], categories: [] };
                for (const delta of deltas) {
                    reconstructedState = this.applyDelta(reconstructedState, delta);
                }
            }

            const executionTime = Date.now() - startTime;

            return {
                userId,
                targetDate,
                state: reconstructedState,
                metadata: {
                    baseSnapshotDate: baseSnapshot?.snapshotDate || null,
                    deltasApplied: baseSnapshot ? 'incremental' : 'full',
                    executionTime,
                    reconstructedAt: new Date(),
                },
            };
        } catch (error) {
            console.error('Replay error:', error);
            throw new Error('Failed to replay state');
        }
    }

    /**
     * Apply a single delta to a state
     * @param {Object} state - Current state
     * @param {Object} delta - Delta to apply
     * @returns {Object} Updated state
     */
    applyDelta(state, delta) {
        const { resourceType, resourceId, operation, afterState } = delta;
        const collectionKey = `${resourceType}s`; // 'expense' -> 'expenses'

        if (!state[collectionKey]) {
            state[collectionKey] = [];
        }

        switch (operation) {
            case 'CREATE':
                state[collectionKey].push(afterState);
                break;

            case 'UPDATE':
                const updateIndex = state[collectionKey].findIndex(item => item.id === resourceId);
                if (updateIndex !== -1) {
                    state[collectionKey][updateIndex] = afterState;
                }
                break;

            case 'DELETE':
                state[collectionKey] = state[collectionKey].filter(item => item.id !== resourceId);
                break;
        }

        return state;
    }

    /**
     * Trace how a specific transaction affected the balance
     * @param {string} userId - User ID
     * @param {string} resourceId - Resource ID to trace
     * @returns {Promise<Object>} Transaction trace
     */
    async traceTransaction(userId, resourceId) {
        try {
            const deltas = await db
                .select()
                .from(stateDeltas)
                .where(and(eq(stateDeltas.userId, userId), eq(stateDeltas.resourceId, resourceId)))
                .orderBy(stateDeltas.createdAt);

            if (deltas.length === 0) {
                return { found: false, message: 'No audit trail found for this transaction' };
            }

            const trace = {
                resourceId,
                resourceType: deltas[0].resourceType,
                lifecycle: deltas.map(delta => ({
                    operation: delta.operation,
                    timestamp: delta.createdAt,
                    beforeState: delta.beforeState,
                    afterState: delta.afterState,
                    changedFields: delta.changedFields,
                    triggeredBy: delta.triggeredBy,
                    ipAddress: delta.ipAddress,
                })),
                created: deltas.find(d => d.operation === 'CREATE')?.createdAt,
                lastModified: deltas[deltas.length - 1]?.createdAt,
                totalChanges: deltas.length,
            };

            return trace;
        } catch (error) {
            console.error('Transaction trace error:', error);
            throw new Error('Failed to trace transaction');
        }
    }

    /**
     * Calculate balance at a specific point in time
     * @param {string} userId - User ID
     * @param {Date} targetDate - Target date
     * @returns {Promise<number>} Balance at that date
     */
    async calculateBalanceAtDate(userId, targetDate) {
        const state = await this.replayToDate(userId, targetDate);
        const balance = state.state.expenses
            ?.filter(e => e.status === 'completed' && new Date(e.date) <= targetDate)
            .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0) || 0;

        return balance;
    }
}

export default new ReplayEngine();
