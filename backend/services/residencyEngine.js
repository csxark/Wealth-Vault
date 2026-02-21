import db from '../config/db.js';
import { taxResidencyHistory, jurisdictionTaxRules } from '../db/schema.js';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Residency Engine (L3)
 * Logic to calculate the "183-day rule" and other jurisdictional thresholds for global tax residency.
 * Integrates with presenceTracker (assumed to be available via audit logs or user sessions).
 */
class ResidencyEngine {
    /**
     * Update residency days based on physical presence logs
     */
    async recalculateResidency(userId, year = new Date().getFullYear()) {
        try {
            // Mock: Fetch total days in current jurisdiction based on location logs
            // In real L3, this queries a location_log table populated by presenceTracker
            const currentJurisdiction = 'US';
            const daysCount = 210; // Mocked presence count for example

            logInfo(`[Residency Engine] Recalculating residency for ${userId} in ${year}. Days found: ${daysCount}`);

            // 1. Fetch Jurisdictional Rule for thresholds
            const rule = await db.query.jurisdictionTaxRules.findFirst({
                where: eq(jurisdictionTaxRules.jurisdictionCode, currentJurisdiction)
            });

            const threshold = rule?.residencyDayThreshold || 183;
            const isResident = daysCount >= threshold;

            // 2. Update History
            const existing = await db.query.taxResidencyHistory.findFirst({
                where: and(
                    eq(taxResidencyHistory.userId, userId),
                    eq(taxResidencyHistory.jurisdictionCode, currentJurisdiction),
                    lte(taxResidencyHistory.startDate, new Date(year, 11, 31)),
                    gte(taxResidencyHistory.startDate, new Date(year, 0, 1))
                )
            });

            if (existing) {
                await db.update(taxResidencyHistory)
                    .set({
                        daysPresentInYear: daysCount,
                        residencyType: isResident ? 'tax_resident' : 'non_resident',
                        status: 'active'
                    })
                    .where(eq(taxResidencyHistory.id, existing.id));
            } else {
                await db.insert(taxResidencyHistory).values({
                    userId,
                    jurisdictionCode: currentJurisdiction,
                    residencyType: isResident ? 'tax_resident' : 'non_resident',
                    startDate: new Date(year, 0, 1),
                    daysPresentInYear: daysCount,
                    isPrimary: isResident,
                    status: 'active'
                });
            }

            return { userId, jurisdiction: currentJurisdiction, daysCount, isResident };
        } catch (error) {
            logError('[Residency Engine] Recalculation failed:', error);
            throw error;
        }
    }

    /**
     * Get primary tax jurisdiction for a user
     */
    async getPrimaryJurisdiction(userId) {
        const primary = await db.query.taxResidencyHistory.findFirst({
            where: and(eq(taxResidencyHistory.userId, userId), eq(taxResidencyHistory.isPrimary, true)),
            orderBy: (t, { desc }) => [desc(t.startDate)]
        });

        return primary?.jurisdictionCode || 'US'; // Default fallback
    }
}

export default new ResidencyEngine();
