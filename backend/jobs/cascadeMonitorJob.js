import cron from 'node-cron';
import db from '../config/db.js';
import { vaults } from '../db/schema.js';
import cascadeStressTester from '../services/cascadeStressTester.js';
import { logInfo, logWarning, logError } from '../utils/logger.js';
import notificationService from '../services/notificationService.js';

/**
 * CascadeMonitorJob (#465)
 * Periodically assesses the full interlocking structure for cascade risk.
 */
class CascadeMonitorJob {
    start() {
        // Runs every day at 3 AM
        cron.schedule('0 3 * * *', async () => {
            await this.scanAllNetworks();
        });
        logInfo('CascadeMonitorJob scheduled (daily at 3 AM)');
    }

    async scanAllNetworks() {
        logInfo('🌩️ Starting global Cascade Stress Test across all networks...');

        try {
            // Get all unique users who own vaults
            const distinctUsers = await db.selectDistinct({ userId: vaults.ownerId }).from(vaults);

            for (const { userId } of distinctUsers) {
                // 1. Snapshot the daily topology
                const topology = await cascadeStressTester.generateTopology(userId);

                // 2. Identify extremely fragile vaults (High PageRank centrality)
                if (parseFloat(topology.maxFragilityIndex) > 0.4) {
                    logWarning(`User ${userId} network exhibits high structural fragility: ${topology.maxFragilityIndex}`);

                    // Alert the user via governance alerting channel
                    await notificationService.createNotification(userId, {
                        type: 'CASCADE_RISK_WARNING',
                        title: 'High Network Interdependency Detected',
                        message: `Your interlocking network contains extremely fragile linchpins. A failure in one vault could propagate deep into your overall net worth.`,
                        actionUrl: '/dashboard/interlock'
                    });
                }

                // 3. Run a severe random stress-test simulation (40% shock on the most central node)
                // For simplicity, we just shock the first vault found for the user in this job
                // In a true engine, we'd pick the node with highest centrality
                const userVaults = await db.select().from(vaults).where({ ownerId: userId }).limit(1);

                if (userVaults.length > 0) {
                    const simulation = await cascadeStressTester.simulateShock(userId, userVaults[0].id, 40.0, true);

                    if (simulation.insolventVaultsCount > 2) {
                        logError(`CRITICAL: A 40% shock to vault ${userVaults[0].id} triggers ${simulation.insolventVaultsCount} insolvencies for User ${userId}.`);
                    }
                }
            }

            logInfo('✅ Global Cascade Stress Test completed.');
        } catch (err) {
            logError('Daily cascade scan failed:', err);
        }
    }
}

export default new CascadeMonitorJob();
