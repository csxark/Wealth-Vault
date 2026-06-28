// incomeDiversificationVisualization.js
// Visualization helpers for Income Stream Diversification Advisor

const moment = require('moment');

function generateConcentrationPieChart(incomeStreams) {
    // Generate pie chart data for income stream concentration
    return incomeStreams.map(s => ({
        label: s.name,
        value: Math.round(s.percent * 100)
    }));
}

function generateGrowthBarChart(growthProjections) {
    // Generate bar chart data for growth potential
    return growthProjections.map(gp => ({
        label: gp.name,
        value: gp.projectedGrowth
    }));
}

function generateStabilityScoreGauge(stabilityScore) {
    // Generate gauge chart data for stability score
    return {
        label: 'Stability Score',
        value: Math.round(stabilityScore * 100)
    };
}

function generateDiversificationTimeline(incomeStreams, newStreams, months = 12) {
    // Generate timeline data for diversification impact
    let timeline = [];
    for (let m = 1; m <= months; m++) {
        let total = incomeStreams.reduce((sum, s) => sum + s.amount, 0) + newStreams.reduce((sum, ns) => sum + ns.amount, 0);
        timeline.push({
            month: m,
            totalIncome: total + m * newStreams.reduce((sum, ns) => sum + ns.amount, 0)
        });
    }
    return timeline;
}

module.exports = {
    generateConcentrationPieChart,
    generateGrowthBarChart,
    generateStabilityScoreGauge,
    generateDiversificationTimeline
};

// --- End of visualization helpers ---
// Use these helpers in IncomeStreamDiversificationAdvisorService for pie charts, bar charts, gauges, and timelines.
