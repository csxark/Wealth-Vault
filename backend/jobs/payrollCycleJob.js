import cron from 'node-cron';
import db from '../config/db.js';
import { payrollBuckets, users } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import treasuryService from '../services/treasuryService.js';
import payrollEngine from '../services/payrollEngine.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Payroll Cycle Job (L3)
 * Background worker to process recurring disbursements and tax filings.
 * Coordinates funding sweeps before pay dates.
 */
class PayrollCycleJob {
    start() {
        // Run daily at 2 AM to check for due payrolls
        cron.schedule('0 2 * * *', async () => {
            logInfo('[Payroll Cycle Job] Starting daily payroll window check...');
            await this.processPayrollWindows();
        });
    }

    async processPayrollWindows() {
        try {
            const today = new Date();
            const dueBuckets = await db.query.payrollBuckets.findMany({
                where: and(
                    eq(payrollBuckets.isActive, true),
                    sql`${payrollBuckets.nextPayrollDate} <= ${today}`
                )
            });

            logInfo(`[Payroll Cycle Job] Found ${dueBuckets.length} buckets requiring processing/funding.`);

            for (const bucket of dueBuckets) {
                try {
                    // 1. Ensure liquidity is swept to bucket
                    await treasuryService.executePayrollSweep(bucket.userId, bucket.id);

                    // 2. Mock: Logic to disburse payments to employees
                    // (In a real app, this integration would hit a bank API)

                    // 3. Update next cycle date based on frequency
                    const nextDate = this.calculateNextDate(bucket.nextPayrollDate, bucket.frequency);

                    await db.update(payrollBuckets)
                        .set({ nextPayrollDate: nextDate })
                        .where(eq(payrollBuckets.id, bucket.id));

                    logInfo(`[Payroll Cycle Job] Successfully processed bucket ${bucket.id}. Next run: ${nextDate}`);
                } catch (bucketError) {
                    logError(`[Payroll Cycle Job] Failed to process bucket ${bucket.id}:`, bucketError);
                }
            }

            logInfo('[Payroll Cycle Job] Daily update completed.');
        } catch (error) {
            logError('[Payroll Cycle Job] Job failed:', error);
        }
    }

    calculateNextDate(currentDate, frequency) {
        const d = new Date(currentDate);
        if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
        else if (frequency === 'weekly') d.setDate(d.getDate() + 7);
        else d.setDate(d.getDate() + 14); // bi-weekly
        return d;
    }
}

export default new PayrollCycleJob();
