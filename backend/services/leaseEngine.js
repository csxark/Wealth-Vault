import db from '../config/db.js';
import { tenantLeases, properties } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

class LeaseEngine {
    /**
     * Create a new tenant lease and update property status
     */
    async createLease(userId, data) {
        const [newLease] = await db.insert(tenantLeases).values({
            userId,
            propertyId: data.propertyId,
            tenantName: data.tenantName,
            tenantContact: data.tenantContact,
            leaseStart: new Date(data.leaseStart),
            leaseEnd: new Date(data.leaseEnd),
            monthlyRent: data.monthlyRent,
            securityDeposit: data.securityDeposit,
            renewalWindowDays: data.renewalWindowDays || 30,
            autoRenew: data.autoRenew || false,
            notes: data.notes
        }).returning();

        // Update property status to occupied
        await db.update(properties)
            .set({ occupancyStatus: 'occupied', updatedAt: new Date() })
            .where(eq(properties.id, data.propertyId));

        return newLease;
    }

    /**
     * Calculate prorated rent for a partial month
     */
    calculateProratedRent(monthlyRent, startDate, totalDaysInMonth) {
        const startObj = new Date(startDate);
        const dayOfMonth = startObj.getDate();
        const remainingDays = totalDaysInMonth - dayOfMonth + 1;
        const dailyRate = parseFloat(monthlyRent) / totalDaysInMonth;
        return parseFloat((dailyRate * remainingDays).toFixed(2));
    }

    /**
     * Get expiring leases based on a threshold (default 30 days)
     */
    async getExpiringLeases(thresholdDays = 30) {
        const now = new Date();
        const thresholdDate = new Date();
        thresholdDate.setDate(now.getDate() + thresholdDays);

        return await db.query.tenantLeases.findMany({
            where: and(
                eq(tenantLeases.status, 'active'),
                sql`${tenantLeases.leaseEnd} <= ${thresholdDate.toISOString()} AND ${tenantLeases.leaseEnd} >= ${now.toISOString()}`
            ),
            with: {
                property: true,
                user: true
            }
        });
    }

    /**
     * Terminate a lease and free up the property
     */
    async terminateLease(userId, leaseId) {
        const [lease] = await db.update(tenantLeases)
            .set({ status: 'terminated', updatedAt: new Date() })
            .where(and(eq(tenantLeases.id, leaseId), eq(tenantLeases.userId, userId)))
            .returning();

        if (lease) {
            await db.update(properties)
                .set({ occupancyStatus: 'vacant', updatedAt: new Date() })
                .where(eq(properties.id, lease.propertyId));
        }

        return lease;
    }
}

// Helper for SQL in Drizzle (if needed directly in service)
import { sql } from 'drizzle-orm';

export default new LeaseEngine();
