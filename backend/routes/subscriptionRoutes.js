// subscriptionRoutes.js
// API endpoints for Dynamic Subscription Management Dashboard

const express = require('express');
const router = express.Router();
const SubscriptionManagementService = require('./SubscriptionManagementService');

// Middleware to get userId (replace with real auth)
router.use((req, res, next) => {
    req.userId = req.headers['x-user-id'] || 'demoUser';
    next();
});

// GET /subscriptions/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const service = new SubscriptionManagementService(req.userId);
        const dashboardData = await service.getDashboardData();
        res.json({ subscriptions: dashboardData });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /subscriptions/cancel
router.post('/cancel', async (req, res) => {
    // Example endpoint to cancel a subscription
    const { merchant, amount } = req.body;
    // Implement cancellation logic here
    res.json({ status: 'cancelled', merchant, amount });
});

// POST /subscriptions/negotiate
router.post('/negotiate', async (req, res) => {
    // Example endpoint to negotiate a subscription
    const { merchant, amount } = req.body;
    // Implement negotiation logic here
    res.json({ status: 'negotiation_started', merchant, amount });
});

module.exports = router;
