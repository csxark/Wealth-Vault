import cron from 'node-cron';
import db from '../config/db.js';
import { expenses, categorizationPatterns, users } from '../db/schema.js';
import { eq, sql, desc, and, gte } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Categorization Trainer Job
 * Periodically analyzes transactions to discover new categorization patterns.
 */
class CategorizationTrainer {
    start() {
        // Runs weekly on Sunday at 2 AM
        cron.schedule('0 2 * * 0', async () => {
            await this.trainAllUsers();
        });

        logInfo('Categorization Trainer Job scheduled (weekly)');

        // Immediate run for testing (delayed)
        setTimeout(() => this.trainAllUsers(), 50000);
    }

    async trainAllUsers() {
        try {
            logInfo('🧠 Starting categorization training for all users...');
            const allUsers = await db.select().from(users);

            for (const user of allUsers) {
                await this.trainForUser(user.id);
            }
            logInfo('✅ Categorization training complete.');
        } catch (error) {
            logError('Categorization training job failed:', error);
        }
    }

    async trainForUser(userId) {
        try {
            // Find frequent description fragments for each category
            const fragments = await db.query.expenses.findMany({
                where: eq(expenses.userId, userId),
                columns: {
                    description: true,
                    categoryId: true
                },
                limit: 5000
            });

            if (fragments.length === 0) return;

            // Map: normalized_description -> { categoryId, count }
            const counts = {};
            for (const tx of fragments) {
                if (!tx.categoryId) continue;
                const norm = tx.description.toLowerCase().trim();
                const key = `${norm}|${tx.categoryId}`;
                counts[key] = (counts[key] || 0) + 1;
            }

            // Save patterns that occur frequently (> 3 times)
            for (const [key, count] of Object.entries(counts)) {
                if (count < 3) continue;

                const [pattern, categoryId] = key.split('|');

                const existing = await db.select()
                    .from(categorizationPatterns)
                    .where(and(
                        eq(categorizationPatterns.userId, userId),
                        eq(categorizationPatterns.pattern, pattern)
                    ))
                    .limit(1);

                if (existing.length === 0) {
                    await db.insert(categorizationPatterns).values({
                        userId,
                        pattern,
                        categoryId,
                        occurrenceCount: count,
                        confidence: 0.8 // Initial confidence for strong patterns
                    });
                } else {
                    await db.update(categorizationPatterns)
                        .set({
                            occurrenceCount: count,
                            updatedAt: new Date()
                        })
                        .where(eq(categorizationPatterns.id, existing[0].id));
                }
            }
        } catch (err) {
            logError(`Training failed for user ${userId}:`, err);
        }
    }
}

export default new CategorizationTrainer();
