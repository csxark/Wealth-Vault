import cron from 'node-cron';
import leaseEngine from '../services/leaseEngine.js';
import notificationService from '../services/notificationService.js';
import db from '../config/db.js';
import { tenantLeases } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

class LeaseMonitor {
    start() {
        // Run daily at 1 AM
        cron.schedule('0 1 * * *', () => {
            this.monitorLeases();
        });
    }

    async monitorLeases() {
        console.log('[LeaseMonitor] Checking for expiring leases and rent status...');

        // 1. Find leases expiring in 30 days
        try {
            const expiringSoon = await leaseEngine.getExpiringLeases(30);

            for (const lease of expiringSoon) {
                await notificationService.sendEmailByUserId(lease.userId, {
                    subject: `🏠 Lease Expiry Reminder: ${lease.property.address}`,
                    text: `Hi ${lease.user.firstName}, the lease for tenant "${lease.tenantName}" at ${lease.property.address} is set to expire on ${lease.leaseEnd.toDateString()}.`
                });
            }

            // 2. Mark overdue rent (Leases where today > rent due date - assuming 1st of month logic for mock)
            const now = new Date();
            if (now.getDate() > 5) { // Common grace period
                const activeLeases = await db.query.tenantLeases.findMany({
                    where: eq(tenantLeases.status, 'active')
                });

                for (const lease of activeLeases) {
                    // If we had a 'lastPaymentDate' we would check it here
                    // For now, toggle status for demo if random condition met or based on metadata
                    if (lease.paymentStatus === 'paid' && Math.random() > 0.95) {
                        await db.update(tenantLeases)
                            .set({ paymentStatus: 'overdue', updatedAt: new Date() })
                            .where(eq(tenantLeases.id, lease.id));
                    }
                }
            }

            console.log(`[LeaseMonitor] Completed scan. Found ${expiringSoon.length} expiring leases.`);
        } catch (error) {
            console.error('[LeaseMonitor] Error during lease audit:', error);
        }
    }
}

export default new LeaseMonitor();
