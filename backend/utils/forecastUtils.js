// Forecasting Utility Functions
const stats = require('simple-statistics');

function calculateVolatility(transactions, income) {
    // Calculate volatility based on standard deviation of monthly spending and income
    const monthlySpending = groupMonthlyAmounts(transactions, 'amount');
    const monthlyIncome = groupMonthlyAmounts(income, 'amount');
    const spendingVolatility = stats.standardDeviation(monthlySpending);
    const incomeVolatility = stats.standardDeviation(monthlyIncome);
    return (spendingVolatility + incomeVolatility) / 2;
}

function groupMonthlyAmounts(items, field) {
    const monthly = {};
    items.forEach(item => {
        const month = item.date.getFullYear() + '-' + (item.date.getMonth() + 1);
        if (!monthly[month]) monthly[month] = 0;
        monthly[month] += item[field];
    });
    return Object.values(monthly);
}

function calculateEmergencyFundTarget(transactions, income, lifeEvents, volatility) {
    // Base target: 6 months of average spending
    const monthlySpending = groupMonthlyAmounts(transactions, 'amount');
    const avgSpending = stats.mean(monthlySpending);
    let baseTarget = avgSpending * 6;
    // Adjust for volatility
    baseTarget *= (1 + volatility);
    // Adjust for life events (e.g., new child, job loss)
    lifeEvents.forEach(event => {
        if (event.type === 'child_birth') baseTarget *= 1.2;
        if (event.type === 'job_loss') baseTarget *= 1.5;
        if (event.type === 'medical') baseTarget *= 1.3;
    });
    return Math.round(baseTarget);
}

module.exports = {
    calculateVolatility,
    calculateEmergencyFundTarget
};
