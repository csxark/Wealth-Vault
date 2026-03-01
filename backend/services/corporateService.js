import db from '../config/db.js';
import { corporateEntities, taxNexusMappings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import residencyEngine from './residencyEngine.js';
import { logInfo } from '../utils/logger.js';

/**
 * Corporate Service (L3)
 * Handles entity-level financial consolidation and tax-drag calculations.
 */
class CorporateService {
    /**
     * Consolidate tax liabilities across all entities for a user
     */
    async calculateConsolidatedTaxLiability(userId) {
        const entities = await db.select().from(corporateEntities).where(eq(corporateEntities.userId, userId));

        let totalConsolidatedRevenue = 0;
        let totalEstimatedTax = 0;

        for (const entity of entities) {
            // In a real scenario, we'd pull actual ledger data here
            const entityRevenue = entity.metadata?.annualRevenue ? parseFloat(entity.metadata.annualRevenue) : 0;
            const effectiveRate = await residencyEngine.calculateEffectiveEntityTaxRate(entity.id);

            const estimatedTax = (entityRevenue * effectiveRate) / 100;

            totalConsolidatedRevenue += entityRevenue;
            totalEstimatedTax += estimatedTax;

            logInfo(`[Corporate Service] Entity ${entity.name} (${entity.id}) estimated tax: ${estimatedTax.toFixed(2)} at ${effectiveRate.toFixed(2)}%`);
        }

        return {
            totalConsolidatedRevenue,
            totalEstimatedTax,
            blendedEffectiveRate: totalConsolidatedRevenue > 0 ? (totalEstimatedTax / totalConsolidatedRevenue) * 100 : 0
        };
    }

    /**
     * Calculate "Tax-Drag" - the impact of corporate taxes on personal net wealth growth
     */
    async calculateCorporateTaxDrag(userId) {
        const { totalEstimatedTax } = await this.calculateConsolidatedTaxLiability(userId);
        // Tax drag is essentially the leakage of capital that could have been reinvested
        return totalEstimatedTax;
    }
}

export default new CorporateService();
