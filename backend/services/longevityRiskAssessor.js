/**
 * LongevityRiskAssessor (#480)
 * Evaluates simulated wealth paths against actuarial mortality tables.
 * Returns the probability that a user outlives their money before dying.
 */
class LongevityRiskAssessor {
    /**
     * @param {number[][]} trajectories The 10,000 array paths representing wealth per year
     * @param {number} currentAge e.g., 65
     * @param {number} healthMultiplier e.g., 1.2 for longer than average life
     */
    evaluateRisk(trajectories, currentAge, healthMultiplier = 1.0) {
        let failures = 0; // Number of trajectories that hit $0 before death year
        const totalRuns = trajectories.length;

        // Simplified mortality modeling: Assuming probabilistic death curve extending to 100
        // We'll calculate a flat Expected Death Age (e.g. 85 * healthMultiplier)
        // A full implementation would use the Gompertz-Makeham law of mortality.
        const baseLifeExpectancy = 85;
        let expectedDeathAge = Math.floor(baseLifeExpectancy * healthMultiplier);

        // Prevent going backward if extremely old
        if (expectedDeathAge <= currentAge) expectedDeathAge = currentAge + 2;

        const yearsToLive = Math.min(100 - currentAge, expectedDeathAge - currentAge);

        const trajectoriesLength = trajectories[0].length; // The number of years simulated (e.g., 40)

        for (let t = 0; t < totalRuns; t++) {
            const path = trajectories[t];

            // Look into the path up to `yearsToLive` length
            for (let year = 1; year <= yearsToLive; year++) {
                if (year >= trajectoriesLength) break;

                if (path[year] <= 0) {
                    failures++;
                    break;
                }
            }
        }

        const successRate = ((totalRuns - failures) / totalRuns) * 100;
        const longevityRiskScore = 100 - successRate; // Risk of running dry

        return {
            successRate,
            longevityRiskScore,
            expectedDeathAge,
            simulatedYearsReviewed: yearsToLive
        };
    }
}

export default new LongevityRiskAssessor();
