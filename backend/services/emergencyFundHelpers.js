// emergencyFundHelpers.js
// Helper functions for EmergencyFundSufficiencyForecasterService

const moment = require('moment');

function simulateIncomeDrop(incomeHistory, dropPercent, months) {
    // Simulate income drop for a given period
    return Array(months).fill(0).map((_, i) => {
        let base = incomeHistory[i] ? incomeHistory[i].amount : incomeHistory[incomeHistory.length - 1].amount;
        return Math.max(0, base * (1 - dropPercent));
    });
}

function simulateExpenseIncrease(expenseHistory, increasePercent, months) {
    // Simulate expense increase for a given period
    return Array(months).fill(0).map((_, i) => {
        let base = expenseHistory[i] ? expenseHistory[i].amount : expenseHistory[expenseHistory.length - 1].amount;
        return base * (1 + increasePercent);
    });
}

function forecastFundDepletion(emergencyFund, netCashFlows) {
    // Forecast when emergency fund will be depleted
    let current = emergencyFund;
    for (let i = 0; i < netCashFlows.length; i++) {
        current += netCashFlows[i];
        if (current <= 0) return i + 1;
    }
    return null;
}

function recommendFundTarget(expenseHistory, months = 6) {
    // Recommend emergency fund target (e.g., 6 months of expenses)
    const avgExpense = expenseHistory.map(e => e.amount).reduce((a, b) => a + b, 0) / (expenseHistory.length || 1);
    return avgExpense * months;
}

function aggregateScenarioForecasts(forecasts) {
    // Aggregate scenario forecasts for summary
    return forecasts.map(f => ({
        scenario: f.scenario,
        depletionMonth: f.depletionMonth,
        finalEmergencyFund: f.finalEmergencyFund
    }));
}

module.exports = {
    simulateIncomeDrop,
    simulateExpenseIncrease,
    forecastFundDepletion,
    recommendFundTarget,
    aggregateScenarioForecasts
};

// --- End of helpers ---
// Use these helpers in EmergencyFundSufficiencyForecasterService for advanced scenario simulation, forecasting, and recommendations.
