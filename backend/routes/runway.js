import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import stressTester from '../services/stressTester.js';

const router = express.Router();

/**
 * @route   GET /api/runway/templates
 * @desc    Get stress test scenario templates
 * @access  Private
 */
router.get(
    '/templates',
    protect,
    asyncHandler(async (req, res) => {
        const templates = stressTester.getScenarioTemplates();

        res.json({
            success: true,
            data: templates
        });
    })
);

/**
 * @route   POST /api/runway/scenarios
 * @desc    Create a new stress test scenario
 * @access  Private
 */
router.post(
    '/scenarios',
    protect,
    [
        body('scenarioType')
            .isIn(['job_loss', 'market_crash', 'medical_emergency', 'recession', 'catastrophic'])
            .withMessage('Invalid scenario type'),
        body('customParameters').optional().isObject().withMessage('Custom parameters must be an object')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { scenarioType, customParameters } = req.body;

        const scenario = await stressTester.createScenario(
            req.user.id,
            scenarioType,
            customParameters || {}
        );

        res.status(201).json({
            success: true,
            data: scenario,
            message: 'Stress test scenario created successfully'
        });
    })
);

/**
 * @route   POST /api/runway/scenarios/:id/run
 * @desc    Run a stress test scenario
 * @access  Private
 */
router.post(
    '/scenarios/:id/run',
    protect,
    [param('id').isUUID().withMessage('Invalid scenario ID')],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const results = await stressTester.runStressTest(req.params.id);

        res.json({
            success: true,
            data: results,
            message: 'Stress test completed successfully'
        });
    })
);

/**
 * @route   POST /api/runway/quick-test
 * @desc    Run a quick stress test without saving
 * @access  Private
 */
router.post(
    '/quick-test',
    protect,
    [
        body('scenarioType')
            .isIn(['job_loss', 'market_crash', 'medical_emergency', 'recession', 'catastrophic'])
            .withMessage('Invalid scenario type'),
        body('customParameters').optional().isObject().withMessage('Custom parameters must be an object')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { scenarioType, customParameters } = req.body;

        // Create temporary scenario
        const scenario = await stressTester.createScenario(
            req.user.id,
            scenarioType,
            customParameters || {}
        );

        // Run immediately
        const results = await stressTester.runStressTest(scenario.id);

        res.json({
            success: true,
            data: results,
            message: 'Quick stress test completed'
        });
    })
);

export default router;
