import db from '../config/db.js';
import { estateBrackets } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * EstateTaxCalculator (#480)
 * Evaluates simulated end-states of terminal wealth to calculate
 * whether the estate breaches statutory tax exemptions upon expected death.
 */
class EstateTaxCalculator {
    /**
     * Determine when the estate triggers massive inheritance taxation across the Monte Carlo spread.
     */
    async calculateBreachProbability(userId, percentiles, expectedDeathYearOffset) {
        const brackets = await db.select().from(estateBrackets).where(eq(estateBrackets.userId, userId));

        let exemptionThreshold = Infinity;
        let taxRate = 0.40; // Default 40% federal bracket

        if (brackets.length > 0) {
            // Pick highest federal or state threshold assigned to the user profile
            exemptionThreshold = parseFloat(brackets[0].exemptionThreshold);
            taxRate = parseFloat(brackets[0].taxRatePercentage) / 100;
        } else {
            // Default 2026 TCJA sunset assumption for high-net-worth
            exemptionThreshold = 7000000;
        }

        const medianExpectedDeathWealth = percentiles.percentile50[expectedDeathYearOffset] || 0;

        let breachYear = null;
        let totalEstateTax = 0;

        // Walk the median curve to see when/if they breach the threshold before death
        for (let year = 0; year < percentiles.percentile50.length; year++) {
            if (percentiles.percentile50[year] > exemptionThreshold) {
                if (breachYear === null) breachYear = year; // Track first year breached
            }
        }

        if (medianExpectedDeathWealth > exemptionThreshold) {
            const taxableExcess = medianExpectedDeathWealth - exemptionThreshold;
            totalEstateTax = taxableExcess * taxRate;
        }

        return {
            jurisdictionThreshold: exemptionThreshold,
            breachYear: breachYear, // If "3", user breaches exemption in 3 years at median
            expectedTaxBurdenAtDeath: totalEstateTax,
            survivingWealth: medianExpectedDeathWealth - totalEstateTax
        };
    }
}

export default new EstateTaxCalculator();
