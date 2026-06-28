// stressTestHelpers.js
// Helper functions for FinancialStressTestEngineService

const moment = require('moment');

function simulateIncomeShock(incomeHistory, shockPercent, months) {
    // Simulate income drop for a given period
    return Array(months).fill(0).map((_, i) => {
        let base = incomeHistory[i] ? incomeHistory[i].amount : incomeHistory[incomeHistory.length - 1].amount;
        return Math.max(0, base * (1 - shockPercent));
    });
}

function simulateExpenseSpike(expenseHistory, spikePercent, months) {
    // Simulate expense increase for a given period
    return Array(months).fill(0).map((_, i) => {
        let base = expenseHistory[i] ? expenseHistory[i].amount : expenseHistory[expenseHistory.length - 1].amount;
        return base * (1 + spikePercent);
    });
}

function forecastEmergencyFund(emergencyFund, netCashFlows) {
    // Forecast emergency fund balance over time
    let balances = [];
    let current = emergencyFund;
    netCashFlows.forEach(ncf => {
        current = Math.max(0, current + ncf);
        balances.push(current);
    });
    return balances;
}

function aggregateScenarioResults(scenarios) {
    // Aggregate scenario results for summary
    return scenarios.map(s => ({
        scenario: s.scenario,
        insolvencyMonth: s.insolvencyMonth,
        finalEmergencyFund: s.finalEmergencyFund
    }));
}

function recommendMitigation(riskLevel, scenario) {
    // Recommend mitigation actions based on risk level
    if (riskLevel === 'critical') {
        return [
            'Increase emergency fund savings immediately.',
            'Reduce discretionary expenses.',
            'Consider income diversification (side gigs, insurance).',
            `Review debt repayment schedule for flexibility under ${scenario}.`
        ];
    }
    if (riskLevel === 'high') {
        return [
            'Boost emergency fund and monitor expenses.',
            'Plan for alternative income sources.',
            `Prepare for high-risk scenario: ${scenario}.`
        ];
    }
    if (riskLevel === 'medium') {
        return [
            'Maintain emergency fund above $1000.',
            'Monitor expenses and plan periodic top-ups.'
        ];
    }
    return ['Maintain current savings and expense discipline.'];
}

module.exports = {
    simulateIncomeShock,
    simulateExpenseSpike,
    forecastEmergencyFund,
    aggregateScenarioResults,
    recommendMitigation
};

// --- End of helpers ---
// Use these helpers in FinancialStressTestEngineService for advanced scenario simulation, forecasting, and recommendations.
