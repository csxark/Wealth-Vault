import db from '../config/db.js';
import { interCompanyLedger, entities } from '../db/schema.js';
import { eq, and, sql, or } from 'drizzle-orm';
import currencyService from './currencyService.js';
import { logAuditEvent } from './auditService.js';

/**
 * Inter-Company Ledger Service (L3)
 * Handles double-entry validation and inter-entity fund movement.
 */
class LedgerService {
    /**
     * Record an inter-company transfer with validation
     */
    async recordTransfer(userId, transferData) {
        const { fromEntityId, toEntityId, amount, currency, type, description } = transferData;

        if (fromEntityId === toEntityId) {
            throw new Error('Self-transfer is not an inter-company movement');
        }

        // 1. Verify both entities exist and belong to the user
        const [fromEntity, toEntity] = await Promise.all([
            db.query.entities.findFirst({ where: and(eq(entities.id, fromEntityId), eq(entities.userId, userId)) }),
            db.query.entities.findFirst({ where: and(eq(entities.id, toEntityId), eq(entities.userId, userId)) })
        ]);

        if (!fromEntity || !toEntity) {
            throw new Error('One or both entities not found or unauthorized');
        }

        // 2. Perform Double-Entry Validation
        // For inter-company, a transfer from Entity A to Entity B creates a "Due From" on A and a "Due To" on B.
        const [entry] = await db.insert(interCompanyLedger).values({
            userId,
            fromEntityId,
            toEntityId,
            amount,
            currency,
            transactionType: type || 'loan',
            description,
            status: 'pending'
        }).returning();

        await logAuditEvent({
            userId,
            action: 'INTER_COMPANY_TRANSFER',
            resourceType: 'entity',
            resourceId: entry.id,
            metadata: {
                from: fromEntity.name,
                to: toEntity.name,
                amount,
                currency
            }
        });

        console.log(`[Ledger] Recorded ${amount} ${currency} transfer from ${fromEntity.name} to ${toEntity.name}`);
        return entry;
    }

    /**
     * Consolidate Due-To/Due-From balances between two entities
     */
    async getConsolidatedBalance(entityAId, entityBId, userId) {
        const transfers = await db.select({
            from: interCompanyLedger.fromEntityId,
            amount: interCompanyLedger.amount,
            currency: interCompanyLedger.currency
        }).from(interCompanyLedger)
            .where(and(
                eq(interCompanyLedger.userId, userId),
                or(
                    and(eq(interCompanyLedger.fromEntityId, entityAId), eq(interCompanyLedger.toEntityId, entityBId)),
                    and(eq(interCompanyLedger.fromEntityId, entityBId), eq(interCompanyLedger.toEntityId, entityAId))
                )
            ));

        // Use base currency for consolidation logic
        let netBalance = 0;
        for (const t of transfers) {
            const amountInUSD = await currencyService.convertToBase(t.amount, t.currency);
            if (t.from === entityAId) {
                netBalance += amountInUSD; // Entity A is owed money
            } else {
                netBalance -= amountInUSD; // Entity A owes money
            }
        }

        return {
            netBalanceUSD: netBalance,
            status: netBalance > 0 ? 'A_RECEIVABLE' : 'A_PAYABLE',
            absBalanceUSD: Math.abs(netBalance)
        };
    }
}

export default new LedgerService();
