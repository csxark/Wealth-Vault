import db from '../config/db.js';
import { charitableTrusts, crtProjections, crtPayouts } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

/**
 * CRT Impact Tracker (#535)
 * Analyzes real-time performance of Charitable Trusts.
 * Compares growth assumptions vs. actual payouts.
 */
class CRTImpactTracker {
    /**
     * Generates a 20-year projection for a CRT.
     */
    async generateProjections(trustId, growthRate = 0.07) {
        const trust = await db.query.charitableTrusts.findFirst({
            where: eq(charitableTrusts.id, trustId)
        });

        if (!trust) throw new Error('Trust not found');

        logInfo(`[Impact Tracker] Generating projections for CRT ${trustId} at ${growthRate * 100}% growth`);

        const projections = [];
        let runningBalance = parseFloat(trust.initialContribution);
        const payoutRate = parseFloat(trust.payoutRate);

        return await db.transaction(async (tx) => {
            // Clear existing projections
            await tx.delete(crtProjections).where(eq(crtProjections.trustId, trustId));

            for (let year = 1; year <= trust.termYears; year++) {
                const growth = runningBalance * growthRate;
                const payout = trust.trustType === 'CRAT'
                    ? parseFloat(trust.initialContribution) * payoutRate
                    : runningBalance * payoutRate;

                runningBalance = runningBalance + growth - payout;

                const projection = {
                    trustId,
                    projectionYear: year,
                    estimatedRemainder: Math.max(0, runningBalance).toFixed(2),
                    estimatedIncomeToGrantor: payout.toFixed(2),
                    growthRateAssumption: growthRate.toString()
                };

                projections.push(projection);
            }

            await tx.insert(crtProjections).values(projections);
            return projections;
        });
    }

    /**
     * Analyzes cumulative impact.
     */
    async getImpactSummary(trustId) {
        const trust = await db.query.charitableTrusts.findFirst({
            where: eq(charitableTrusts.id, trustId),
            with: { payouts: true, projections: true }
        });

        const totalPaidOut = trust.payouts.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        const currentFMV = parseFloat(trust.currentValue);

        return {
            trustName: trust.name,
            initialGift: trust.initialContribution,
            currentBalance: currentFMV,
            cumulativePayouts: totalPaidOut,
            netImpactToCharity: currentFMV, // The eventual gift
            alphaGenerated: (currentFMV + totalPaidOut) - parseFloat(trust.initialContribution)
        };
    }
}

export default new CRTImpactTracker();
