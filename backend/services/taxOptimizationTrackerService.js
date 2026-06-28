// Tax Optimization Tracker Service
// Monitors transactions and investments, identifies tax-saving opportunities, and provides personalized recommendations.

const { getUserTransactions, getUserInvestments } = require('../models/taxUserData');
const { detectTaxOpportunities, generateTaxRecommendations } = require('../utils/taxUtils');
const { sendTaxReminder } = require('./taxNotificationService');

class TaxOptimizationTracker {
    constructor(userId) {
        this.userId = userId;
        this.transactions = [];
        this.investments = [];
        this.opportunities = [];
        this.recommendations = [];
    }

    async loadUserData() {
        this.transactions = await getUserTransactions(this.userId);
        this.investments = await getUserInvestments(this.userId);
    }

    async analyzeTaxOpportunities() {
        await this.loadUserData();
        this.opportunities = detectTaxOpportunities(this.transactions, this.investments);
        this.recommendations = generateTaxRecommendations(this.opportunities);
        this.sendReminders();
        return {
            userId: this.userId,
            opportunities: this.opportunities,
            recommendations: this.recommendations,
            lastUpdated: new Date(),
        };
    }

    sendReminders() {
        this.recommendations.forEach(rec => {
            sendTaxReminder(this.userId, rec.message);
        });
    }
}

module.exports = TaxOptimizationTracker;
