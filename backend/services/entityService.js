
import db from '../config/db.js';
import { corporateEntities, businessLedgers } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

class EntityService {
    /**
     * Create a new corporate entity
     */
    async createEntity(userId, entityData) {
        const [newEntity] = await db.insert(corporateEntities).values({
            userId,
            ...entityData
        }).returning();

        // Initial equity record in ledger
        await db.insert(businessLedgers).values({
            entityId: newEntity.id,
            description: `Initial capitalization - ${newEntity.name}`,
            amount: '0',
            type: 'equity',
            category: 'capitalization'
        });

        return newEntity;
    }

    /**
     * Get user's entire corporate structure
     */
    async getCorporateStructure(userId) {
        const entities = await db.select().from(corporateEntities).where(eq(corporateEntities.userId, userId));

        // Build hierarchy tree
        const entityMap = {};
        entities.forEach(e => entityMap[e.id] = { ...e, subsidiaries: [] });

        const roots = [];
        entities.forEach(e => {
            if (e.parentEntityId && entityMap[e.parentEntityId]) {
                entityMap[e.parentEntityId].subsidiaries.push(entityMap[e.id]);
            } else {
                roots.push(entityMap[e.id]);
            }
        });

        return roots;
    }

    /**
     * Get consolidated ledger for an entity and its subsidiaries
     */
    async getConsolidatedLedger(entityId) {
        // Recursive CTE for subsidiaries
        const subsidiariesQuery = sql`
            WITH RECURSIVE sub_entities AS (
                SELECT id FROM corporate_entities WHERE id = ${entityId}
                UNION ALL
                SELECT ce.id FROM corporate_entities ce
                INNER JOIN sub_entities se ON ce.parent_entity_id = se.id
            )
            SELECT l.* FROM business_ledgers l
            WHERE l.entity_id IN (SELECT id FROM sub_entities)
            ORDER BY l.transaction_date DESC
        `;

        const result = await db.execute(subsidiariesQuery);
        return result.rows;
    }

    /**
     * Update entity status
     */
    async updateStatus(entityId, status) {
        return await db.update(corporateEntities)
            .set({ status, updatedAt: new Date() })
            .where(eq(corporateEntities.id, entityId))
            .returning();
    }
}

export default new EntityService();
