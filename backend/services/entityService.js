import db from '../config/db.js';
import { entities, interCompanyLedger } from '../db/schema.js';
import { eq, and, sql, or } from 'drizzle-orm';
import { logAuditEvent } from './auditService.js';

/**
 * Entity Service (L3)
 * Manages legal entities (LLCs, Trusts, etc.) for high-net-worth individuals.
 */
class EntityService {
    /**
     * Create a new legal entity
     */
    async createEntity(userId, entityData) {
        const [newEntity] = await db.insert(entities).values({
            userId,
            ...entityData
        }).returning();

        await logAuditEvent({
            userId,
            action: 'ENTITY_CREATE',
            resourceType: 'entity',
            resourceId: newEntity.id,
            metadata: { name: newEntity.name, type: newEntity.type }
        });

        return newEntity;
    }

    /**
     * Get all entities for a user
     */
    async getUserEntities(userId) {
        return await db.query.entities.findMany({
            where: eq(entities.userId, userId)
        });
    }

    /**
     * Get entity by ID with its balance sheet summary
     */
    async getEntityDetails(entityId, userId) {
        const entity = await db.query.entities.findFirst({
            where: and(eq(entities.id, entityId), eq(entities.userId, userId))
        });

        if (!entity) throw new Error('Entity not found');

        // Calculate "Due To" and "Due From" balances
        const balances = await db.select({
            type: interCompanyLedger.transactionType,
            total: sql`sum(${interCompanyLedger.amount})`
        }).from(interCompanyLedger)
            .where(or(eq(interCompanyLedger.fromEntityId, entityId), eq(interCompanyLedger.toEntityId, entityId)))
            .groupBy(interCompanyLedger.transactionType);

        return { ...entity, balances };
    }
}

export default new EntityService();
