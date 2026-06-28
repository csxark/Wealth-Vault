import express from 'express';
import { protect } from '../middleware/auth.js';
import propertyManager from '../services/propertyManager.js';
import roiCalculator from '../services/roiCalculator.js';
import { validateProperty, validateMaintenance } from '../middleware/propertyValidator.js';
import { validationResult } from 'express-validator';

const router = express.Router();

/**
 * @route   GET /api/properties
 * @desc    Get all properties for the authenticated user
 */
router.get('/', protect, async (req, res) => {
    try {
        const props = await propertyManager.getProperties(req.user.id);
        res.json({ success: true, data: props });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   POST /api/properties
 * @desc    Register a new property (and link to asset)
 */
router.post('/', protect, validateProperty, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const property = await propertyManager.createProperty(req.user.id, req.body);
        res.status(201).json({ success: true, data: property });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   POST /api/properties/:id/maintenance
 * @desc    Log a maintenance task
 */
router.post('/:id/maintenance', protect, validateMaintenance, async (req, res) => {
    try {
        const log = await propertyManager.addMaintenanceLog(req.user.id, req.params.id, req.body);
        res.json({ success: true, data: log });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * @route   GET /api/properties/:id/roi
 * @desc    Calculate and get ROI metrics
 */
router.get('/:id/roi', protect, async (req, res) => {
    try {
        const snapshot = await roiCalculator.calculateAndSnapshotROI(req.user.id, req.params.id);
        const trends = await roiCalculator.getROITrends(req.params.id);
        res.json({ success: true, data: { current: snapshot, trends } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

export default router;
