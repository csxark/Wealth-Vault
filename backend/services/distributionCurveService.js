/**
 * DistributionCurveService (#480)
 * Processes raw Monte Carlo outputs (10,000 arrays) and compresses them into statistical percentiles.
 */
class DistributionCurveService {
    /**
     * Converts a massive 2D array of simulated paths into 10th, 50th, and 90th percentile trajectories.
     * @param {number[][]} trajectories The 10,000 simulation paths 
     * @returns {Object} { percentile10: [], percentile50: [], percentile90: [] }
     */
    extractPercentiles(trajectories) {
        if (!trajectories || trajectories.length === 0) return null;

        const totalRuns = trajectories.length;
        const years = trajectories[0].length;

        const percentile10 = [];
        const percentile50 = [];
        const percentile90 = [];

        // For each year, sort all 10,000 outcomes and pick the n-th percentile
        for (let year = 0; year < years; year++) {
            // Extract the wealth value across all runs for the target year
            const yearArray = new Float64Array(totalRuns);
            for (let i = 0; i < totalRuns; i++) {
                yearArray[i] = trajectories[i][year];
            }

            // Sort ascending
            yearArray.sort();

            // Find indexes
            const idx10 = Math.floor(totalRuns * 0.1);
            const idx50 = Math.floor(totalRuns * 0.5);
            const idx90 = Math.floor(totalRuns * 0.9);

            percentile10.push(yearArray[idx10]);
            percentile50.push(yearArray[idx50]);
            percentile90.push(yearArray[idx90]);
        }

        return {
            percentile10,
            percentile50,
            percentile90
        };
    }
}

export default new DistributionCurveService();
