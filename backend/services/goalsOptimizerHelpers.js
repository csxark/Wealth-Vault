// goalsOptimizerHelpers.js
// Helper functions for DynamicSavingsGoalOptimizerService

const moment = require('moment');

function forecastIncome(incomeHistory, months = 12) {
    // Simple linear regression for income forecasting
    if (incomeHistory.length < 2) return Array(months).fill(incomeHistory[incomeHistory.length - 1] || 0);
    const x = incomeHistory.map((_, i) => i);
    const y = incomeHistory.map(i => i.amount);
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.map((xi, i) => xi * y[i]).reduce((a, b) => a + b, 0);
    const sumX2 = x.map(xi => xi * xi).reduce((a, b) => a + b, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return Array(months).fill(0).map((_, i) => Math.max(0, slope * (n + i) + intercept));
}

function forecastExpenses(expenseHistory, months = 12) {
    // Simple moving average for expense forecasting
    const avg = expenseHistory.map(e => e.amount).reduce((a, b) => a + b, 0) / (expenseHistory.length || 1);
    return Array(months).fill(avg);
}

function optimizeGoalAllocation(goals, surplus, riskTolerance) {
    // Allocate surplus to goals based on priority and risk
    const totalPriority = goals.reduce((sum, g) => sum + (g.priority === 'high' ? 3 : g.priority === 'medium' ? 2 : 1), 0);
    return goals.map(goal => {
        const weight = goal.priority === 'high' ? 3 : goal.priority === 'medium' ? 2 : 1;
        let allocation = (surplus * weight) / totalPriority;
        if (riskTolerance === 'aggressive') allocation *= 1.1;
        if (riskTolerance === 'conservative') allocation *= 0.9;
        return {
            goalId: goal.goalId,
            name: goal.name,
            allocation: Math.max(0, allocation)
        };
    });
}

function milestoneProjection(goal, saved, monthlySave) {
    // Project milestone dates for a goal
    const milestones = [25, 50, 75, 100];
    return milestones.map(percent => {
        const target = goal.amount * (percent / 100);
        const months = monthlySave > 0 ? Math.ceil((target - saved) / monthlySave) : null;
        return {
            percent,
            date: months !== null ? moment().add(months, 'months').format('YYYY-MM-DD') : 'N/A'
        };
    });
}

function detectWindfall(incomeHistory) {
    // Detect windfall events (income > 1.5x average)
    const avg = incomeHistory.map(i => i.amount).reduce((a, b) => a + b, 0) / (incomeHistory.length || 1);
    return incomeHistory.filter(i => i.amount > 1.5 * avg);
}

function spendingTrends(expenseHistory) {
    // Analyze spending trends by category
    const byCategory = {};
    expenseHistory.forEach(e => {
        if (!byCategory[e.category]) byCategory[e.category] = [];
        byCategory[e.category].push(e.amount);
    });
    return Object.entries(byCategory).map(([category, amounts]) => {
        const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        return { category, avg, trend: amounts[amounts.length - 1] > avg ? 'up' : 'down' };
    });
}

module.exports = {
    forecastIncome,
    forecastExpenses,
    optimizeGoalAllocation,
    milestoneProjection,
    detectWindfall,
    spendingTrends
};

// --- End of helpers ---
// Use these helpers in DynamicSavingsGoalOptimizerService for advanced analytics, forecasting, and recommendations.
