import cron from 'node-cron';
import { eq } from 'drizzle-orm';
import db from '../config/db.js';
import { users } from '../db/schema.js';
import reportService from '../services/reportService.js';

/**
 * Monthly Report Generator Job
 * Runs on the 1st of every month at 00:01
 */
export const scheduleMonthlyReports = () => {
    // 0 1 1 * * -> 00:01 on day 1 of month
    cron.schedule('0 1 1 * *', async () => {
        console.log('[Job] Starting monthly report generation...');

        const now = new Date();
        // Previous month
        let year = now.getFullYear();
        let month = now.getMonth(); // getMonth() is 0-indexed, so today (Jan) is 0. Previous (Dec) is 11.

        if (month === 0) {
            month = 12;
            year -= 1;
        }

        try {
            // Get all active users
            const allUsers = await db.select().from(users).where(eq(users.isActive, true));

            console.log(`[Job] Generating reports for ${allUsers.length} users for ${year}-${month}`);

            for (const user of allUsers) {
                try {
                    await reportService.generateMonthlyReport(user.id, year, month);
                    console.log(`[Job] Successfully generated report for user ${user.id}`);
                } catch (err) {
                    console.error(`[Job] Failed to generate report for user ${user.id}:`, err);
                }
            }

            console.log('[Job] Monthly report generation completed.');
        } catch (error) {
            console.error('[Job] Critical error in monthly report job:', error);
        }
    });
};

export default scheduleMonthlyReports;
