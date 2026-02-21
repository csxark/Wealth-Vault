import db from '../config/db.js';
import { taxNexusMappings, entityTaxBrackets, corporateEntities } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Residency Engine (L3)
 * Tracks tax residency and economic nexus across jurisdictions.
 */
class ResidencyEngine {
    /**
     * Update current tax exposure for an entity based on recent revenue/activity
     */
    async updateNexusExposure(userId, entityId, jurisdiction, amount) {
        try {
            const [mapping] = await db.select().from(taxNexusMappings).where(and(
                eq(taxNexusMappings.userId, userId),
                eq(taxNexusMappings.entityId, entityId),
                eq(taxNexusMappings.jurisdiction, jurisdiction)
            ));

            if (!mapping) {
                // If no mapping exists, create a default one for physical presence if it's the entity's home
                const [entity] = await db.select().from(corporateEntities).where(eq(corporateEntities.id, entityId));
                await db.insert(taxNexusMappings).values({
                    userId,
                    entityId,
                    jurisdiction,
                    nexusType: entity?.jurisdiction === jurisdiction ? 'residency' : 'economic',
                    currentExposure: amount.toString(),
                    thresholdValue: '100000.00' // Default $100k economic nexus threshold
                });
                return;
            }

            const newExposure = (parseFloat(mapping.currentExposure) + amount).toFixed(2);
            const isTriggered = parseFloat(newExposure) >= parseFloat(mapping.thresholdValue);

            await db.update(taxNexusMappings).set({
                currentExposure: newExposure,
                isTriggered,
                updatedAt: new Date()
            }).where(eq(taxNexusMappings.id, mapping.id));

            if (isTriggered && !mapping.isTriggered) {
                logInfo(`[Residency Engine] Nexus triggered for user ${userId} in ${jurisdiction} for entity ${entityId}`);
                // Proactive logic: Alert user or flag for review
            }
        } catch (error) {
            logError(`[Residency Engine] Failed to update exposure: ${error.message}`);
        }
    }

    /**
     * Calculate effective tax rate for an entity based on weighted nexus exposure
     */
    async calculateEffectiveEntityTaxRate(entityId) {
        const mappings = await db.select().from(taxNexusMappings).where(eq(taxNexusMappings.entityId, entityId));
        if (mappings.length === 0) return 21.0; // Default US Corporate rate

        let totalExposure = 0;
        let weightedRate = 0;

        for (const m of mappings) {
            const exposure = parseFloat(m.currentExposure);
            const rate = m.taxRateOverride ? parseFloat(m.taxRateOverride) : await this.getJurisdictionRate(m.jurisdiction);

            totalExposure += exposure;
            weightedRate += (exposure * rate);
        }

        return totalExposure > 0 ? (weightedRate / totalExposure) : 21.0;
    }

    /**
     * Fetch standard corporate tax rate for a jurisdiction
     */
    async getJurisdictionRate(jurisdiction) {
        const [bracket] = await db.select().from(entityTaxBrackets).where(and(
            eq(entityTaxBrackets.jurisdiction, jurisdiction),
            eq(entityTaxBrackets.effectiveYear, new Date().getFullYear())
        )).limit(1);

        return bracket ? parseFloat(bracket.taxRate) : 21.0;
    }
}

export default new ResidencyEngine();
