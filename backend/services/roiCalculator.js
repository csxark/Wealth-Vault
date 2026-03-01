import db from '../config/db.js';
import { properties, tenantLeases, propertyMaintenance, propertyROISnapshots, fixedAssets } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

class ROICalculator {
    /**
     * Calculate full ROI metrics for a property and save a snapshot
     */
    async calculateAndSnapshotROI(userId, propertyId) {
        const property = await db.query.properties.findFirst({
            where: and(eq(properties.id, propertyId), eq(properties.userId, userId)),
            with: {
                asset: true,
                leases: {
                    where: eq(tenantLeases.status, 'active')
                }
            }
        });

        if (!property) throw new Error("Property not found");

        // 1. Gross Income (Current active leases)
        const annualGrossIncome = property.leases.reduce((sum, lease) => {
            return sum + (parseFloat(lease.monthlyRent) * 12);
        }, 0);

        // 2. Operating Expenses (Maintenance from last year)
        const lastYear = new Date();
        lastYear.setFullYear(lastYear.getFullYear() - 1);

        const maintenanceLogs = await db.query.propertyMaintenance.findMany({
            where: and(
                eq(propertyMaintenance.propertyId, propertyId),
                sql`${propertyMaintenance.completedAt} >= ${lastYear.toISOString()}`
            )
        });

        const annualOperatingExpenses = maintenanceLogs.reduce((sum, log) => {
            return sum + parseFloat(log.cost);
        }, 0);

        // 3. Net Operating Income (NOI)
        const noi = annualGrossIncome - annualOperatingExpenses;

        // 4. Cap Rate = (NOI / Market Value) * 100
        const marketValue = parseFloat(property.asset?.currentValue || property.asset?.purchasePrice || 1);
        const capRate = (noi / marketValue) * 100;

        // 5. Cash on Cash Return = (Annual Pre-Tax Cash Flow / Total Cash Invested) * 100
        // Simplified: Cash Invested = Purchase Price
        const cashInvested = parseFloat(property.asset?.purchasePrice || 1);
        const cashOnCash = (noi / cashInvested) * 100;

        // 6. Occupancy Rate
        const occupancyRate = property.occupancyStatus === 'occupied' ? 100 : 0; // Simplified for single units

        // Save snapshot
        const [snapshot] = await db.insert(propertyROISnapshots).values({
            propertyId,
            userId,
            grossIncome: annualGrossIncome.toString(),
            operatingExpenses: annualOperatingExpenses.toString(),
            noi: noi.toString(),
            capRate: capRate.toFixed(2),
            cashOnCashReturn: cashOnCash.toFixed(2),
            occupancyRate: occupancyRate.toString()
        }).returning();

        // Update property with latest NOI and Cap Rate
        await db.update(properties)
            .set({
                noi: noi.toString(),
                capRate: capRate.toFixed(2),
                updatedAt: new Date()
            })
            .where(eq(properties.id, propertyId));

        return snapshot;
    }

    /**
     * Get ROI trends for a property
     */
    async getROITrends(propertyId) {
        return await db.query.propertyROISnapshots.findMany({
            where: eq(propertyROISnapshots.propertyId, propertyId),
            orderBy: (snapshots, { desc }) => [desc(snapshots.snapshotDate)],
            limit: 12
        });
    }
}

export default new ROICalculator();
