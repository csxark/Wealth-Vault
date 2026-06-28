// debtRepaymentHelpers.js
// Helper functions for DebtRepaymentStrategySimulatorService

const moment = require('moment');

function calculateInterest(balance, rate, months) {
    // Calculate total interest over a period
    let total = 0;
    let current = balance;
    for (let i = 0; i < months; i++) {
        let interest = current * (rate / 12 / 100);
        total += interest;
        current += interest;
    }
    return total;
}

function payoffTimeline(debt, monthlyPayment, extraPayment = 0) {
    // Simulate payoff timeline for a single debt
    let timeline = [];
    let month = 0;
    let balance = debt.balance;
    let rate = debt.interestRate;
    while (balance > 0 && month < 120) {
        let interest = balance * (rate / 12 / 100);
        let payment = Math.min(balance + interest, monthlyPayment + extraPayment);
        balance = Math.max(0, balance + interest - payment);
        timeline.push({ month, payment, interest, balance });
        month++;
    }
    return timeline;
}

function aggregatePayoffResults(timelines) {
    // Aggregate results from multiple debts
    let totalMonths = Math.max(...timelines.map(tl => tl.length));
    let totalInterest = timelines.reduce((sum, tl) => sum + tl.reduce((s, m) => s + m.interest, 0), 0);
    return { totalMonths, totalInterest };
}

function recommendExtraPayment(debts, budget) {
    // Recommend extra payment allocation
    let highRate = debts.sort((a, b) => b.interestRate - a.interestRate)[0];
    let allocation = Math.min(budget * 0.5, highRate.balance);
    return {
        debtId: highRate.debtId,
        recommendedExtra: allocation
    };
}

function simulateCreditScoreImpact(debts, payoffMonths) {
    // Simulate credit score impact based on payoff speed and utilization
    let utilization = debts.reduce((sum, d) => sum + d.balance, 0) / debts.reduce((sum, d) => sum + d.balance + d.minPayment * 12, 0);
    let impact = payoffMonths < 24 ? '+40' : payoffMonths < 48 ? '+20' : '+5';
    if (utilization < 0.3) impact = '+60';
    return impact;
}

module.exports = {
    calculateInterest,
    payoffTimeline,
    aggregatePayoffResults,
    recommendExtraPayment,
    simulateCreditScoreImpact
};

// --- End of helpers ---
// Use these helpers in DebtRepaymentStrategySimulatorService for advanced payoff simulation, recommendations, and analytics.
