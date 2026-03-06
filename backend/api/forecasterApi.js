// Express API for Adaptive Emergency Fund Forecaster
const express = require('express');
const router = express.Router();
const AdaptiveEmergencyFundForecaster = require('../services/adaptiveEmergencyFundForecasterService');
const {
    addUser,
    getUserById,
    addTransaction,
    addIncome,
    addLifeEvent,
    saveForecast,
    getForecastByUserId
} = require('../models/mockDb');
const { User, Transaction, Income, LifeEvent } = require('../models/userData');

// Create user
router.post('/user', (req, res) => {
    const { id, name, email } = req.body;
    const user = new User(id, name, email);
    addUser(user);
    res.status(201).json(user);
});

// Add transaction
router.post('/transaction', (req, res) => {
    const { id, userId, amount, category, date } = req.body;
    const transaction = new Transaction(id, userId, amount, category, new Date(date));
    addTransaction(transaction);
    res.status(201).json(transaction);
});

// Add income
router.post('/income', (req, res) => {
    const { id, userId, amount, source, date } = req.body;
    const income = new Income(id, userId, amount, source, new Date(date));
    addIncome(income);
    res.status(201).json(income);
});

// Add life event
router.post('/life-event', (req, res) => {
    const { id, userId, type, description, date } = req.body;
    const event = new LifeEvent(id, userId, type, description, new Date(date));
    addLifeEvent(event);
    res.status(201).json(event);
});

// Generate forecast
router.post('/forecast/:userId', async (req, res) => {
    const userId = req.params.userId;
    const forecaster = new AdaptiveEmergencyFundForecaster(userId);
    try {
        const forecast = await forecaster.generateForecast();
        saveForecast(forecast);
        res.status(200).json(forecast);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get forecast
router.get('/forecast/:userId', (req, res) => {
    const userId = req.params.userId;
    const forecast = getForecastByUserId(userId);
    if (!forecast) {
        return res.status(404).json({ error: 'Forecast not found' });
    }
    res.status(200).json(forecast);
});

module.exports = router;
