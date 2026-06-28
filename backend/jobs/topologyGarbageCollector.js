import cron from 'node-cron';
import db from '../config/db.js';
import { topologySnapshots } from '../db/schema.js';
import { lt } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * TopologyGarbageCollector (#465)
 * Deletes interlocking graph snapshots older than 30 days to save database space.
 */
class TopologyGarbageCollector {
    start() {
        cron.schedule('0 5 * * *', async () => {
            await this.cleanOldSnapshots();
        });
        logInfo('TopologyGarbageCollector scheduled (daily at 5 AM)');
    }

    async cleanOldSnapshots() {
        logInfo('🧹 Running Topology Garbage Collection...');
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);

            // Removing D3 serialized graphs stored a month ago
            const result = await db.delete(topologySnapshots).where(lt(topologySnapshots.createdAt, cutoffDate));

            // Note: Postgres via drizzle does not expose .rowCount consistently in all drivers,
            // but we'll assume standard pg behavior or simply log completion.
            logInfo(`✅ Deleted old network topology snapshots prior to ${cutoffDate.toISOString()}`);
        } catch (err) {
            logError('Topology Garbage Collection failed:', err);
        }
    }
}

export default new TopologyGarbageCollector();
