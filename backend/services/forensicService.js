import db from '../config/db.js';
import { interCompanyLedger, entities } from '../db/schema.js';
import { eq, and, sql, inArray, gte } from 'drizzle-orm';

/**
 * Forensic Service (L3)
 * Detects complex financial patterns like "Circular Funding".
 */
class ForensicService {
    /**
     * Trace fund flow to detect circular hops
     * Example: A -> B -> C -> A
     */
    async detectCircularFunding(startEntityId, maxHops = 5) {
        const visited = new Set();
        const queue = [{ id: startEntityId, path: [startEntityId] }];

        while (queue.length > 0) {
            const { id, path } = queue.shift();

            if (path.length > maxHops) continue;

            // Find all unique outbound transfers from this entity
            const outbound = await db.select({
                targetId: interCompanyLedger.toEntityId
            }).from(interCompanyLedger)
                .where(eq(interCompanyLedger.fromEntityId, id));

            for (const entry of outbound) {
                if (entry.targetId === startEntityId) {
                    return {
                        circularDetected: true,
                        path: [...path, startEntityId],
                        reason: `Circular flow detected over ${path.length} hops`
                    };
                }

                if (!visited.has(entry.targetId)) {
                    visited.add(entry.targetId);
                    queue.push({ id: entry.targetId, path: [...path, entry.targetId] });
                }
            }
        }

        return { circularDetected: false };
    }

    /**
     * Get Velocity Alpha
     * Measures the speed of money moving between entities
     */
    async getEntityVelocity(entityId, windowHours = 24) {
        const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);

        const result = await db.select({
            count: sql`count(*)`,
            totalAmount: sql`sum(${interCompanyLedger.amount})`
        }).from(interCompanyLedger)
            .where(and(
                eq(interCompanyLedger.fromEntityId, entityId),
                gte(interCompanyLedger.createdAt, cutoff)
            ));

        return {
            transactionCount: parseInt(result[0]?.count || 0),
            totalVolume: parseFloat(result[0]?.totalAmount || 0)
        };
    }
}

export default new ForensicService();
