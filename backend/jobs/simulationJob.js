import cron from 'node-cron';
import db from '../config/db.js';
import { users, retirementParameters } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import monteCarloService from '../services/monteCarloService.js';
import auditService from '../services/auditService.js';

/**
 * Simulation Job (L3)
 * Nightly daemon to recalculate stochastic retirement success probabilities.
 */
class SimulationJob {
    start() {
        // Run nightly at 1 AM
        cron.schedule('0 1 * * *', async () => {
            console.log('[Simulation Job] Starting nightly stochastic recalculations...');
            await this.recalculateAllSimulations();
        });

        console.log('[Simulation Job] Scheduled for 1:00 AM daily');
    }

    async recalculateAllSimulations() {
        try {
            // Only process users who have configured retirement parameters
            const usersWithParams = await db.select({ id: users.id })
                .from(users)
                .innerJoin(retirementParameters, eq(retirementParameters.userId, users.id));

            for (const user of usersWithParams) {
                console.log(`[Simulation Job] Refreshing paths for user: ${user.id}`);

                const result = await monteCarloService.runSimulation(user.id, {
                    name: 'Nightly Refresh',
                    numPaths: 5000 // Lower path count for batch jobs
                });

                // Audit the success probability change
                await auditService.logAuditEvent({
                    userId: user.id,
                    action: 'MONTE_CARLO_SIMULATION',
                    resourceType: 'user',
                    resourceId: user.id,
                    metadata: {
                        probability: result.successProbability,
                        medianNetWorth: result.medianNetWorthAtHorizon,
                        trigger: 'nightly_job'
                    }
                });
            }

            console.log(`[Simulation Job] Successfully updated ${usersWithParams.length} simulations`);
        } catch (error) {
            console.error('[Simulation Job] Critical crash during cycle:', error);
        }
    }
}

export default new SimulationJob();
