// subscriptionOptimizerHelpers.js
// Helper functions for Subscription Expense Optimizer

const moment = require('moment');

function detectRecurringPayments(transactions, minAmount = 5) {
    // Detect recurring payments by merchant
    const recurring = {};
    transactions.forEach(tx => {
        if (tx.type === 'subscription' && tx.amount >= minAmount) {
            if (!recurring[tx.merchant]) recurring[tx.merchant] = [];
            recurring[tx.merchant].push(tx);
        }
    });
    return Object.entries(recurring).map(([merchant, txs]) => ({
        merchant,
        amount: txs.reduce((a, b) => a + b.amount, 0) / txs.length,
        frequency: txs.length,
        lastPayment: txs[txs.length - 1].date
    }));
}

function analyzeUsage(subscription, usageData) {
    // Analyze usage data for a subscription
    // Placeholder: In real implementation, fetch actual usage analytics
    return usageData[subscription.merchant] || Math.random();
}

function projectAnnualSavings(subscriptions, usageThreshold = 0.3) {
    // Project annual savings from cancellations/downgrades
    let cancelSavings = subscriptions.filter(s => s.usage < usageThreshold).reduce((sum, s) => sum + s.amount * 12, 0);
    let downgradeSavings = subscriptions.filter(s => s.usage >= usageThreshold && s.usage < 0.6).reduce((sum, s) => sum + s.amount * 6, 0);
    return {
        cancelSavings,
        downgradeSavings,
        totalSavings: cancelSavings + downgradeSavings
    };
}

function upcomingRenewalAlerts(subscriptions) {
    // Generate alerts for upcoming renewals
    return subscriptions.map(sub => {
        let nextRenewal = moment(sub.lastPayment).add(1, 'months').format('YYYY-MM-DD');
        return {
            merchant: sub.merchant,
            nextRenewal,
            message: `Upcoming renewal for ${sub.merchant} on ${nextRenewal}.`
        };
    });
}

function recommendSubscriptionAction(subscription, usageThreshold = 0.3) {
    // Recommend action based on usage
    if (subscription.usage < usageThreshold) return 'cancel';
    if (subscription.usage < 0.6) return 'downgrade';
    return 'keep';
}

module.exports = {
    detectRecurringPayments,
    analyzeUsage,
    projectAnnualSavings,
    upcomingRenewalAlerts,
    recommendSubscriptionAction
};

// --- End of helpers ---
// Use these helpers in SubscriptionExpenseOptimizerService for advanced detection, usage analysis, savings projection, and alerts.
