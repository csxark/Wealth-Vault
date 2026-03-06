// Unit Tests for Adaptive Emergency Fund Forecaster
const { User, Transaction, Income, LifeEvent } = require('../models/userData');
const { calculateVolatility, calculateEmergencyFundTarget } = require('../utils/forecastUtils');
const AdaptiveEmergencyFundForecaster = require('../services/adaptiveEmergencyFundForecasterService');
const assert = require('assert');

describe('Forecast Utils', () => {
    it('should calculate volatility', () => {
        const transactions = [
            new Transaction(1, 1, 1000, 'rent', new Date('2023-01-01')),
            new Transaction(2, 1, 1200, 'rent', new Date('2023-02-01')),
            new Transaction(3, 1, 1100, 'rent', new Date('2023-03-01'))
        ];
        const income = [
            new Income(1, 1, 3000, 'salary', new Date('2023-01-01')),
            new Income(2, 1, 3200, 'salary', new Date('2023-02-01')),
            new Income(3, 1, 3100, 'salary', new Date('2023-03-01'))
        ];
        const volatility = calculateVolatility(transactions, income);
        assert(volatility >= 0);
    });

    it('should calculate emergency fund target', () => {
        const transactions = [
            new Transaction(1, 1, 1000, 'rent', new Date('2023-01-01')),
            new Transaction(2, 1, 1200, 'rent', new Date('2023-02-01')),
            new Transaction(3, 1, 1100, 'rent', new Date('2023-03-01'))
        ];
        const income = [
            new Income(1, 1, 3000, 'salary', new Date('2023-01-01')),
            new Income(2, 1, 3200, 'salary', new Date('2023-02-01')),
            new Income(3, 1, 3100, 'salary', new Date('2023-03-01'))
        ];
        const lifeEvents = [
            new LifeEvent(1, 1, 'child_birth', 'New child', new Date('2023-04-01'))
        ];
        const volatility = calculateVolatility(transactions, income);
        const target = calculateEmergencyFundTarget(transactions, income, lifeEvents, volatility);
        assert(target > 0);
    });
});

describe('AdaptiveEmergencyFundForecaster', () => {
    it('should generate forecast', async () => {
        // Mock data loading
        const forecaster = new AdaptiveEmergencyFundForecaster(1);
        forecaster.transactions = [
            new Transaction(1, 1, 1000, 'rent', new Date('2023-01-01')),
            new Transaction(2, 1, 1200, 'rent', new Date('2023-02-01')),
            new Transaction(3, 1, 1100, 'rent', new Date('2023-03-01'))
        ];
        forecaster.income = [
            new Income(1, 1, 3000, 'salary', new Date('2023-01-01')),
            new Income(2, 1, 3200, 'salary', new Date('2023-02-01')),
            new Income(3, 1, 3100, 'salary', new Date('2023-03-01'))
        ];
        forecaster.lifeEvents = [
            new LifeEvent(1, 1, 'child_birth', 'New child', new Date('2023-04-01'))
        ];
        const forecast = await forecaster.generateForecast();
        assert(forecast.target > 0);
        assert(forecast.volatility >= 0);
    });
});
