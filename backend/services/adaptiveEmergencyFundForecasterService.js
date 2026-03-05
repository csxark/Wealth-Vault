// Adaptive Emergency Fund Forecaster Service
// This service dynamically models emergency fund requirements based on user spending, income volatility, and life changes.

const { getUserTransactions, getUserIncome, getUserLifeEvents } = require('../models/userData');
const { calculateVolatility, calculateEmergencyFundTarget } = require('../utils/forecastUtils');
const { sendRiskAlert } = require('./alertNotificationService');

class AdaptiveEmergencyFundForecaster {
    constructor(userId) {
        this.userId = userId;
        this.transactions = [];
        this.income = [];
        this.lifeEvents = [];
        this.forecast = null;
    }

    async loadUserData() {
        this.transactions = await getUserTransactions(this.userId);
        this.income = await getUserIncome(this.userId);
        this.lifeEvents = await getUserLifeEvents(this.userId);
    }

    async generateForecast() {
        await this.loadUserData();
        const volatility = calculateVolatility(this.transactions, this.income);
        const target = calculateEmergencyFundTarget(this.transactions, this.income, this.lifeEvents, volatility);
        this.forecast = {
            userId: this.userId,
            target,
            volatility,
            lastUpdated: new Date(),
        };
        this.checkRisk();
        return this.forecast;
    }

    checkRisk() {
        if (this.forecast.volatility > 0.5) {
            sendRiskAlert(this.userId, 'High income/spending volatility detected. Consider increasing your emergency fund target.');
        }
        // Additional risk checks can be added here
    }
}

module.exports = AdaptiveEmergencyFundForecaster;
