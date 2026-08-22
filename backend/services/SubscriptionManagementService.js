// SubscriptionManagementService.js
// Dynamic Subscription Management Dashboard Backend
// Detects recurring charges, categorizes subscriptions, and provides actionable insights

const db = require('../db'); // Example DB import
const moment = require('moment');

class SubscriptionManagementService {
    constructor(userId) {
        this.userId = userId;
    }

    // Fetch user transactions from DB
    async getUserTransactions() {
        // Replace with actual DB query
        return db.getTransactionsForUser(this.userId);
    }

    // Detect recurring charges
    async detectRecurringCharges() {
        const transactions = await this.getUserTransactions();
        const recurring = {};
        // Group by merchant and amount
        transactions.forEach(tx => {
            const key = `${tx.merchant}_${tx.amount}`;
            if (!recurring[key]) recurring[key] = [];
            recurring[key].push(tx);
        });
        // Filter for monthly/weekly patterns
        const subscriptions = [];
        Object.values(recurring).forEach(group => {
            if (group.length < 3) return; // Require at least 3 occurrences
            const dates = group.map(tx => moment(tx.date));
            const intervals = dates.slice(1).map((d, i) => d.diff(dates[i], 'days'));
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            if (avgInterval > 20 && avgInterval < 35) {
                subscriptions.push({
                    merchant: group[0].merchant,
                    amount: group[0].amount,
                    frequency: 'monthly',
                    lastDate: group[group.length - 1].date,
                });
            }
        });
        return subscriptions;
    }

    // Categorize subscriptions
    async categorizeSubscriptions(subscriptions) {
        // Simple categorization by merchant keywords
        const categories = {
            streaming: ['netflix', 'prime', 'spotify', 'hulu'],
            utilities: ['electric', 'water', 'gas'],
            saas: ['zoom', 'office', 'adobe'],
        };
        return subscriptions.map(sub => {
            let category = 'other';
            Object.entries(categories).forEach(([cat, keywords]) => {
                if (keywords.some(k => sub.merchant.toLowerCase().includes(k))) {
                    category = cat;
                }
            });
            return { ...sub, category };
        });
    }

    // Actionable insights
    async generateInsights(subscriptions) {
        return subscriptions.map(sub => {
            let action = 'review';
            if (sub.category === 'streaming' && sub.amount > 20) action = 'negotiate';
            if (sub.category === 'other') action = 'cancel';
            return { ...sub, action };
        });
    }

    // Main dashboard data
    async getDashboardData() {
        const recurring = await this.detectRecurringCharges();
        const categorized = await this.categorizeSubscriptions(recurring);
        const insights = await this.generateInsights(categorized);
        return insights;
    }
}

module.exports = SubscriptionManagementService;
