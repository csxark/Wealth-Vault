import db from '../config/db.js';
import { expenses, investments, retirementParameters } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';

/**
 * Tax Estimator Service (L3)
 * Logic to project future tax liabilities based on income brackets and Sequence-of-Returns.
 */
class TaxEstimator {
    /**
     * Estimate effective tax rate for a future retirement year
     * @param {number} projectedIncome 
     * @param {Object} taxParameters 
     */
    async estimateFutureTaxRate(projectedIncome, taxParameters = {}) {
        // Mocked US Progressive Brackets (L3 requirement: multi-bracket logic)
        const brackets = [
            { threshold: 11000, rate: 0.10 },
            { threshold: 44725, rate: 0.12 },
            { threshold: 95375, rate: 0.22 },
            { threshold: 182100, rate: 0.24 },
            { threshold: 231250, rate: 0.32 },
            { threshold: 578125, rate: 0.35 },
            { threshold: Infinity, rate: 0.37 },
        ];

        let tax = 0;
        let remainingIncome = projectedIncome;
        let previousThreshold = 0;

        for (const bracket of brackets) {
            const taxableInThisBracket = Math.min(
                Math.max(remainingIncome, 0),
                bracket.threshold - previousThreshold
            );

            tax += taxableInThisBracket * bracket.rate;
            remainingIncome -= taxableInThisBracket;
            previousThreshold = bracket.threshold;

            if (remainingIncome <= 0) break;
        }

        const effectiveRate = projectedIncome > 0 ? tax / projectedIncome : 0;
        return { totalTax: tax.toFixed(2), effectiveRate: effectiveRate.toFixed(4) };
    }

    /**
     * Calculate Tax Leakage for Investment Growth
     */
    calculateTaxLeakage(growthAmount, assetType) {
        const capsRate = assetType === 'equity' ? 0.15 : 0.25; // Simple Long Term vs Ordinary
        return growthAmount * capsRate;
    }

    /**
     * Get Current Tax Summary for user
     */
    async getCurrentTaxSummary(userId) {
        const investmentsData = await db.select().from(investments).where(eq(investments.userId, userId));
        const unrealizedGains = investmentsData.reduce((sum, inv) => {
            const gain = parseFloat(inv.currentBalance || 0) - parseFloat(inv.avgCost || 0);
            return sum + (gain > 0 ? gain : 0);
        }, 0);

        return {
            unrealizedGains: unrealizedGains.toFixed(2),
            estimatedLiability: (unrealizedGains * 0.15).toFixed(2) // Assumed 15% LTCG
        };
    }
}

export default new TaxEstimator();
