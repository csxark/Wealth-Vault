// incomeDiversificationHelpers.js
// Helper functions for Income Stream Diversification Advisor

const moment = require('moment');

function calculateStreamConcentration(incomeStreams) {
    // Calculate concentration ratio for income streams
    const total = incomeStreams.reduce((sum, s) => sum + s.amount, 0);
    return incomeStreams.map(s => ({
        name: s.name,
        percent: total > 0 ? s.amount / total : 0
    }));
}

function simulateNewStreamImpact(incomeStreams, newStream) {
    // Simulate impact of adding a new income stream
    const total = incomeStreams.reduce((sum, s) => sum + s.amount, 0) + newStream.amount;
    return {
        name: newStream.name,
        newPercent: newStream.amount / total,
        newTotal: total
    };
}

function projectStabilityScore(incomeStreams, threshold = 0.5) {
    // Project stability score based on diversification
    const highRisk = incomeStreams.filter(s => s.percent > threshold).length;
    const score = 1 - highRisk / incomeStreams.length;
    return Math.max(0, Math.min(score, 1));
}

function recommendNewStreams(currentStreams, availableOptions) {
    // Recommend new income streams for diversification
    return availableOptions.filter(opt => !currentStreams.some(s => s.name === opt.name));
}

function forecastGrowthPotential(incomeStreams, newStreams, months = 12) {
    // Forecast growth potential from new streams
    let projections = [];
    newStreams.forEach(ns => {
        let growth = ns.amount * months;
        projections.push({ name: ns.name, projectedGrowth: growth });
    });
    return projections;
}

function generateDiversificationReport(incomeStreams, newStreams, stabilityScore, growthProjections) {
    // Generate a comprehensive diversification report
    return {
        currentStreams: incomeStreams.map(s => ({ name: s.name, percent: s.percent })),
        newStreams: newStreams.map(ns => ({ name: ns.name, newPercent: ns.newPercent })),
        stabilityScore,
        growthProjections
    };
}

module.exports = {
    calculateStreamConcentration,
    simulateNewStreamImpact,
    projectStabilityScore,
    recommendNewStreams,
    forecastGrowthPotential,
    generateDiversificationReport
};

// --- End of helpers ---
// Use these helpers in IncomeStreamDiversificationAdvisorService for advanced concentration analysis, impact simulation, stability scoring, and growth forecasting.
