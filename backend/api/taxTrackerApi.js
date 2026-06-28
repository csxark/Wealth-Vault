// Express API for Tax Optimization Tracker
const express = require('express');
const router = express.Router();
const TaxOptimizationTracker = require('../services/taxOptimizationTrackerService');
const {
    addTaxUser,
    getTaxUserById,
    addTaxTransaction,
    addInvestment,
    addTaxOpportunity,
    getTaxOpportunitiesByUserId
} = require('../models/taxMockDb');
const { TaxUser, TaxTransaction, Investment } = require('../models/taxUserData');

// Create tax user
router.post('/tax-user', (req, res) => {
    const { id, name, email } = req.body;
    const user = new TaxUser(id, name, email);
    addTaxUser(user);
    res.status(201).json(user);
});

// Add tax transaction
router.post('/tax-transaction', (req, res) => {
    const { id, userId, amount, category, date } = req.body;
    const transaction = new TaxTransaction(id, userId, amount, category, new Date(date));
    addTaxTransaction(transaction);
    res.status(201).json(transaction);
});

// Add investment
router.post('/investment', (req, res) => {
    const { id, userId, type, amount, date } = req.body;
    const investment = new Investment(id, userId, type, amount, new Date(date));
    addInvestment(investment);
    res.status(201).json(investment);
});

// Analyze tax opportunities
router.post('/tax-opportunities/:userId', async (req, res) => {
    const userId = req.params.userId;
    const tracker = new TaxOptimizationTracker(userId);
    try {
        const result = await tracker.analyzeTaxOpportunities();
        // Save opportunities
        result.opportunities.forEach(op => {
            addTaxOpportunity({ ...op, userId });
        });
        res.status(200).json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get tax opportunities
router.get('/tax-opportunities/:userId', (req, res) => {
    const userId = req.params.userId;
    const opportunities = getTaxOpportunitiesByUserId(userId);
    res.status(200).json(opportunities);
});

module.exports = router;
