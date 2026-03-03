// EmergencyFundSufficiencyForecasterService.js
// Backend service for emergency fund sufficiency forecasting and recommendations

const moment = require('moment');

class EmergencyFundSufficiencyForecasterService {
    constructor(userData, options = {}) {
        this.userData = userData; // { incomeHistory: [], expenseHistory: [], emergencyFund: 0, riskFactors: [] }
        this.options = Object.assign({ scenarios: ['job_loss', 'medical_emergency'], months: 12 }, options);
        this.forecastResults = [];
        this.recommendations = [];
        this.summary = null;
        this._init();
    }

    _init() {
        this._simulateScenarios();
        this._generateRecommendations();
        this._generateSummary();
    }

    _simulateScenarios() {
        // Simulate each adverse scenario
        this.forecastResults = this.options.scenarios.map(scenario => {
            return this._simulateScenario(scenario);
        });
    }

    _simulateScenario(scenario) {
        let income = [...this.userData.incomeHistory];
        let expenses = [...this.userData.expenseHistory];
        let emergencyFund = this.userData.emergencyFund;
        let months = this.options.months;
        let timeline = [];
        let shockFactor = this._getShockFactor(scenario);
        for (let m = 0; m < months; m++) {
            let monthIncome = (income[m] ? income[m].amount : income[income.length - 1].amount) * shockFactor.income;
            let monthExpense = (expenses[m] ? expenses[m].amount : expenses[expenses.length - 1].amount) * shockFactor.expense;
            let netCashFlow = monthIncome - monthExpense;
            emergencyFund = Math.max(0, emergencyFund + netCashFlow);
            timeline.push({ month: m + 1, monthIncome, monthExpense, netCashFlow, emergencyFund });
        }
        let depletionMonth = timeline.findIndex(t => t.emergencyFund <= 0);
        return {
            scenario,
            timeline,
            depletionMonth: depletionMonth >= 0 ? depletionMonth + 1 : null,
            finalEmergencyFund: timeline[timeline.length - 1].emergencyFund
        };
    }

    _getShockFactor(scenario) {
        // Define shock factors for each scenario
        switch (scenario) {
            case 'job_loss':
                return { income: 0.2, expense: 1.1 };
            case 'medical_emergency':
                return { income: 0.8, expense: 1.5 };
            default:
                return { income: 1, expense: 1 };
        }
    }

    _generateRecommendations() {
        // Recommend optimal fund targets and reallocation strategies
        this.recommendations = this.forecastResults.map(result => {
            let recs = [];
            if (result.depletionMonth && result.depletionMonth < 6) {
                recs.push('Increase emergency fund savings immediately.');
                recs.push('Reduce discretionary expenses.');
                recs.push('Consider insurance or income diversification.');
            } else if (result.depletionMonth && result.depletionMonth < 12) {
                recs.push('Boost emergency fund and monitor expenses.');
                recs.push('Plan for alternative income sources.');
            } else if (result.finalEmergencyFund < 1000) {
                recs.push('Maintain emergency fund above $1000.');
                recs.push('Plan periodic top-ups.');
            } else {
                recs.push('Emergency fund is sufficient for simulated scenarios.');
            }
            return {
                scenario: result.scenario,
                recommendations: recs
            };
        });
    }

    _generateSummary() {
        // Generate overall summary
        this.summary = {
            scenarios: this.options.scenarios,
            depletionMonths: this.forecastResults.map(r => ({ scenario: r.scenario, depletionMonth: r.depletionMonth })),
            recommendations: this.recommendations
        };
    }

    forecast() {
        // Main entry point
        return {
            summary: this.summary,
            forecastResults: this.forecastResults,
            recommendations: this.recommendations
        };
    }

    static examplePayload() {
        return {
            userData: {
                incomeHistory: [
                    { month: '2025-12', amount: 3200 },
                    { month: '2026-01', amount: 3400 },
                    { month: '2026-02', amount: 3100 },
                    { month: '2026-03', amount: 3500 }
                ],
                expenseHistory: [
                    { month: '2025-12', amount: 2100 },
                    { month: '2026-01', amount: 2200 },
                    { month: '2026-02', amount: 2300 },
                    { month: '2026-03', amount: 2400 }
                ],
                emergencyFund: 5000,
                riskFactors: ['single_income', 'high_medical_risk']
            },
            options: {
                scenarios: ['job_loss', 'medical_emergency'],
                months: 12
            }
        };
    }
}

module.exports = EmergencyFundSufficiencyForecasterService;

// --- End of Service ---
// This file contains robust, modular logic for emergency fund sufficiency forecasting and recommendations.
// For full integration, add API endpoint in backend/routes/emergency.js and connect to DB for real user data.
