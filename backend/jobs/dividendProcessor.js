
import cron from 'node-cron';
import db from '../config/db.js';
import { corporateEntities, dividendPayouts, businessLedgers } from '../db/schema.js';
import businessAnalytics from '../services/businessAnalytics.js';
import { eq, and } from 'drizzle-orm';

class DividendProcessor {
    /**
     * Start the automated dividend distribution job
     * Runs every 1st of the quarter (Jan, Apr, Jul, Oct)
     */
    start() {
        cron.schedule('0 0 1 1,4,7,10 *', async () => {
            console.log('--- Starting Quarterly Dividend Distribution Job ---');
            await this.processAllEntities();
        });
    }

    async processAllEntities() {
        // Find entities with 'auto_dividend' enabled in metadata
        const entities = await db.select().from(corporateEntities).where(
            eq(corporateEntities.status, 'active')
        );

        for (const entity of entities) {
            if (entity.metadata?.autoDividendEnabled) {
                await this.distributeDivForEntity(entity);
            }
        }
    }

    async distributeDivForEntity(entity) {
        try {
            const capacity = await businessAnalytics.calculateDividendCapacity(entity.id);

            if (capacity > 100) { // Minimum distribution threshold
                await db.transaction(async (tx) => {
                    const [payout] = await tx.insert(dividendPayouts).values({
                        entityId: entity.id,
                        userId: entity.userId,
                        amount: capacity.toString(),
                        type: 'regular',
                        status: 'paid'
                    }).returning();

                    // Record as equity distribution in ledger
                    await tx.insert(businessLedgers).values({
                        entityId: entity.id,
                        description: `Quarterly Dividend Distribution - ID: ${payout.id.substring(0, 8)}`,
                        amount: capacity.toString(),
                        type: 'equity',
                        category: 'dividend',
                        refId: payout.id
                    });

                    console.log(`✅ Distributed ${capacity} for entity ${entity.name}`);
                });
            }
        } catch (error) {
            console.error(`❌ Dividend distribution failed for ${entity.name}:`, error);
        }
    }
}

export default new DividendProcessor();
