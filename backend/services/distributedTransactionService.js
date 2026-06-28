import { createHash } from 'crypto';
import { and, eq, inArray, lte, ne } from 'drizzle-orm';
import db from '../config/db.js';
import { idempotencyKeys, distributedTransactionLogs } from '../db/schema.js';
import logger from '../utils/logger.js';

const DEFAULT_IDEMPOTENCY_TTL_HOURS = 24;

class DistributedTransactionService {
    buildOperationKey({ tenantId, userId, operation, idempotencyKey }) {
        return `${tenantId || 'global'}:${userId || 'system'}:${operation}:${idempotencyKey}`;
    }

    buildRequestHash(payload = {}) {
        return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    }

    async acquireIdempotencyLock({
        tenantId = null,
        userId = null,
        operation,
        operationKey,
        requestPayload,
        resourceType = 'financial_operation',
        ttlHours = DEFAULT_IDEMPOTENCY_TTL_HOURS
    }) {
        const requestHash = this.buildRequestHash(requestPayload);

        const [existing] = await db
            .select()
            .from(idempotencyKeys)
            .where(eq(idempotencyKeys.idempotencyKey, operationKey));

        if (existing) {
            if (existing.requestHash && existing.requestHash !== requestHash) {
                return {
                    acquired: false,
                    reason: 'payload_mismatch',
                    record: existing
                };
            }

            if (existing.status === 'completed') {
                return {
                    acquired: false,
                    reason: 'replay',
                    record: existing
                };
            }

            return {
                acquired: false,
                reason: 'in_progress',
                record: existing
            };
        }

        const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

        const [created] = await db
            .insert(idempotencyKeys)
            .values({
                tenantId,
                userId,
                operation,
                idempotencyKey: operationKey,
                requestHash,
                status: 'processing',
                resourceType,
                expiresAt
            })
            .returning();

        return {
            acquired: true,
            reason: 'created',
            record: created
        };
    }

    async completeIdempotency({ operationKey, statusCode, responseBody, resourceId = null, resourceType = null }) {
        await db
            .update(idempotencyKeys)
            .set({
                status: 'completed',
                responseCode: statusCode,
                responseBody,
                resourceId,
                ...(resourceType ? { resourceType } : {}),
                updatedAt: new Date()
            })
            .where(eq(idempotencyKeys.idempotencyKey, operationKey));
    }

    async failIdempotency({ operationKey, statusCode = 500, responseBody = {}, reason = 'operation_failed' }) {
        await db
            .update(idempotencyKeys)
            .set({
                status: 'failed',
                responseCode: statusCode,
                responseBody: {
                    ...responseBody,
                    reason
                },
                updatedAt: new Date()
            })
            .where(eq(idempotencyKeys.idempotencyKey, operationKey));
    }

    async getIdempotencyRecord(operationKey) {
        const [record] = await db
            .select()
            .from(idempotencyKeys)
            .where(eq(idempotencyKeys.idempotencyKey, operationKey));

        return record || null;
    }

    async startDistributedTransaction({
        tenantId = null,
        userId = null,
        transactionType,
        operationKey,
        payload,
        timeoutMs = 30000
    }) {
        const timeoutAt = new Date(Date.now() + timeoutMs);

        const [txLog] = await db
            .insert(distributedTransactionLogs)
            .values({
                tenantId,
                userId,
                transactionType,
                operationKey,
                status: 'started',
                phase: 'init',
                timeoutAt,
                payload: payload || {},
                recoveryRequired: false
            })
            .returning();

        return txLog;
    }

    async markPrepared({ txLogId, sagaInstanceId = null }) {
        await db
            .update(distributedTransactionLogs)
            .set({
                status: 'prepared',
                phase: 'prepare',
                ...(sagaInstanceId ? { sagaInstanceId } : {}),
                updatedAt: new Date()
            })
            .where(eq(distributedTransactionLogs.id, txLogId));
    }

    async commitDistributedTransaction({ txLogId, result = {} }) {
        await db
            .update(distributedTransactionLogs)
            .set({
                status: 'committed',
                phase: 'commit',
                result,
                completedAt: new Date(),
                recoveryRequired: false,
                updatedAt: new Date()
            })
            .where(eq(distributedTransactionLogs.id, txLogId));
    }

    async abortDistributedTransaction({ txLogId, errorMessage, result = {} }) {
        await db
            .update(distributedTransactionLogs)
            .set({
                status: 'aborted',
                phase: 'abort',
                lastError: errorMessage,
                result,
                completedAt: new Date(),
                recoveryRequired: true,
                updatedAt: new Date()
            })
            .where(eq(distributedTransactionLogs.id, txLogId));
    }

    async markFailedTransaction({ txLogId, errorMessage, result = {} }) {
        await db
            .update(distributedTransactionLogs)
            .set({
                status: 'failed',
                phase: 'abort',
                lastError: errorMessage,
                result,
                completedAt: new Date(),
                recoveryRequired: true,
                updatedAt: new Date()
            })
            .where(eq(distributedTransactionLogs.id, txLogId));
    }

    async markTimedOutTransactions() {
        const now = new Date();

        const staleCandidates = await db
            .select({ id: distributedTransactionLogs.id })
            .from(distributedTransactionLogs)
            .where(
                and(
                    inArray(distributedTransactionLogs.status, ['started', 'prepared']),
                    lte(distributedTransactionLogs.timeoutAt, now)
                )
            );

        if (staleCandidates.length === 0) {
            return 0;
        }

        const ids = staleCandidates.map((row) => row.id);

        await db
            .update(distributedTransactionLogs)
            .set({
                status: 'timed_out',
                phase: 'abort',
                lastError: 'Distributed transaction timed out',
                recoveryRequired: true,
                completedAt: new Date(),
                updatedAt: new Date()
            })
            .where(inArray(distributedTransactionLogs.id, ids));

        logger.warn('Marked distributed transactions as timed out', {
            count: ids.length
        });

        return ids.length;
    }

    async getRecoverableInconsistencies(limit = 100) {
        return db
            .select()
            .from(distributedTransactionLogs)
            .where(
                and(
                    eq(distributedTransactionLogs.recoveryRequired, true),
                    ne(distributedTransactionLogs.status, 'committed')
                )
            )
            .limit(limit)
            .orderBy(distributedTransactionLogs.updatedAt);
    }

    async markRecovered(txLogId, recoveryResult = {}) {
        await db
            .update(distributedTransactionLogs)
            .set({
                recoveryRequired: false,
                result: recoveryResult,
                updatedAt: new Date()
            })
            .where(eq(distributedTransactionLogs.id, txLogId));
    }
}

export default new DistributedTransactionService();
