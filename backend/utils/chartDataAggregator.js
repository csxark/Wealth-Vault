/**
 * ChartDataAggregator (#480)
 * Translates Monte Carlo percentiles into chart.js/D3 specific visual payloads.
 */
class ChartDataAggregator {
    /**
     * Converts a year-based array structure into structured JSON for frontend charts.
     */
    formatMonteCarloForUI(percentiles, baseYear, currentAge, expectedDeathAge) {
        if (!percentiles) return [];

        const uiData = [];
        const length = percentiles.percentile50.length;

        for (let i = 0; i < length; i++) {
            const simulatedYear = baseYear + i;
            const simulatedAge = currentAge + i;

            uiData.push({
                year: simulatedYear,
                age: simulatedAge,
                isExpectedDeathYear: simulatedAge === expectedDeathAge,
                poorMarket_10th: percentiles.percentile10[i],
                medianMarket_50th: percentiles.percentile50[i],
                bullMarket_90th: percentiles.percentile90[i]
            });
        }

        return uiData;
    }
}

export default new ChartDataAggregator();
