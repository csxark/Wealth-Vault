// retirementReadinessHelpers.js
// Helper functions for Retirement Readiness Analyzer

const moment = require('moment');

function projectRetirementFund(savingsHistory, investmentHistory, years, annualReturn = 0.06) {
    // Project retirement fund growth over years
    let total = savingsHistory.reduce((a, b) => a + b.amount, 0) + investmentHistory.reduce((a, b) => a + b.amount, 0);
    let projection = [];
    for (let y = 1; y <= years; y++) {
        total *= (1 + annualReturn);
        projection.push({ year: y, projectedFund: total });
    }
    return projection;
}

function simulateRetirementExpenses(currentExpenses, inflationRate, years) {
    // Simulate future retirement expenses with inflation
    let expenses = currentExpenses;
    let projection = [];
    for (let y = 1; y <= years; y++) {
        expenses *= (1 + inflationRate);
        projection.push({ year: y, projectedExpense: expenses });
    }
    return projection;
}

function assessRetirementSufficiency(fundProjection, expenseProjection) {
    // Assess if retirement fund is sufficient for projected expenses
    return fundProjection.map((fp, i) => {
        let expense = expenseProjection[i] ? expenseProjection[i].projectedExpense : 0;
        return {
            year: fp.year,
            fund: fp.projectedFund,
            expense,
            sufficiency: fp.projectedFund >= expense ? 'sufficient' : 'shortfall'
        };
    });
}

function recommendSavingsAdjustment(currentSavings, targetFund, years) {
    // Recommend monthly savings adjustment to reach target
    let needed = targetFund - currentSavings;
    let monthly = needed / (years * 12);
    return Math.max(0, monthly);
}

module.exports = {
    projectRetirementFund,
    simulateRetirementExpenses,
    assessRetirementSufficiency,
    recommendSavingsAdjustment
};

// --- End of helpers ---
// Use these helpers in Retirement Readiness Analyzer for advanced projection, sufficiency assessment, and recommendations.
