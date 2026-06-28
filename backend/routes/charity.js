/**
 * Charitable Giving Impact Tracker API Route
 * POST /api/charity/impact/analyze
 * Author: Ayaanshaikh12243
 * Date: 2026-03-04
 */

const express = require('express');
const router = express.Router();
const CharitableGivingImpactTrackerService = require('../services/charitableGivingImpactTrackerService');

/**
 * @route POST /api/charity/impact/analyze
 * @desc Analyze charitable giving impact, simulate tax benefits, visualize social impact, recommend strategies, and alert matching opportunities
 * @access Public
 */
router.post('/impact/analyze', async (req, res) => {
    try {
        const { donationData, userProfile, orgData, options } = req.body;
        if (!Array.isArray(donationData) || donationData.length === 0) {
            return res.status(400).json({ error: 'donationData is required and must be a non-empty array.' });
        }
        const tracker = new CharitableGivingImpactTrackerService(donationData, userProfile, orgData, options);
        const result = tracker.runAnalysis();
        res.json(result);
    } catch (err) {
        console.error('Charitable giving impact error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
