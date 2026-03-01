import cron from 'node-cron';
import db from '../config/db.js';
import { taxProfiles } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import taxEngine from '../services/taxEngine.js';
import deductionScout from '../services/deductionScout.js';

class TaxEstimator {
    constructor() {
        this.task = null;
    }

    /**
     * Start the weekly tax estimation job
     */
    start() {
        // Run every Sunday at 8 PM
        this.task = cron.schedule('0 20 * * 0', async () => {
            console.log('[Tax Estimator] Running weekly tax projection...');
            await this.updateAllProjections();
        });

        console.log('[Tax Estimator] Job scheduled for Sundays at 8:00 PM');
    }

    /**
     * Update tax projections for all users
     */
    async updateAllProjections() {
        try {
            const currentYear = new Date().getFullYear();
            const profiles = await db.select().from(taxProfiles).where(eq(taxProfiles.taxYear, currentYear));

            let updateCount = 0;

            for (const profile of profiles) {
                try {
                    // Scan for new deductions
                    await deductionScout.scanExpenses(profile.userId, currentYear);

                    // Recalculate liability
                    const calculation = await taxEngine.calculateTaxLiability(profile.userId, currentYear);

                    // Update profile with latest calculation
                    await db.update(taxProfiles)
                        .set({
                            lastCalculated: new Date(),
                            taxBracketData: {
                                lastCalculation: calculation,
                                updatedAt: new Date()
                            }
                        })
                        .where(eq(taxProfiles.id, profile.id));

                    updateCount++;

                    // Log significant changes
                    const previousOwed = profile.taxBracketData?.lastCalculation?.totalTaxOwed || 0;
                    const newOwed = calculation.totalTaxOwed;
                    const difference = Math.abs(newOwed - previousOwed);

                    if (difference > 100) {
                        console.log(`[Tax Estimator] User ${profile.userId}: Tax liability changed by $${difference.toFixed(2)}`);
                        // TODO: Send notification if significant change
                    }

                } catch (error) {
                    console.error(`[Tax Estimator] Failed for user ${profile.userId}:`, error.message);
                }
            }

            console.log(`[Tax Estimator] Updated projections for ${updateCount} users`);

        } catch (error) {
            console.error('[Tax Estimator] Job failed:', error);
        }
    }

    /**
     * Run manual estimation for testing
     */
    async runManual() {
        console.log('[Tax Estimator] Manual update triggered');
        await this.updateAllProjections();
    }

    stop() {
        if (this.task) {
            this.task.stop();
            console.log('[Tax Estimator] Job stopped');
        }
    }
}

export default new TaxEstimator();
