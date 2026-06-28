import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import replayEngine from '../services/replayEngine.js';
import stateReconstructor from '../services/stateReconstructor.js';

const router = express.Router();

/**
 * @route   POST /api/replay/scenarios
 * @desc    Create a new replay scenario
 * @access  Private
 */
router.post(
    '/scenarios',
    protect,
    [
        body('name').trim().notEmpty().withMessage('Scenario name is required'),
        body('startDate').isISO8601().withMessage('Valid start date is required'),
        body('endDate').isISO8601().withMessage('Valid end date is required'),
        body('whatIfChanges').isArray().withMessage('What-if changes must be an array'),
        body('whatIfChanges.*.type').isIn(['investment', 'expense_reduction', 'debt_payoff', 'income_increase'])
            .withMessage('Invalid change type'),
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { name, description, startDate, endDate, whatIfChanges } = req.body;

        const scenario = await replayEngine.createScenario({
            userId: req.user.id,
            name,
            description,
            startDate,
            endDate,
            whatIfChanges
        });

        res.status(201).json({
            success: true,
            data: scenario,
            message: 'Scenario created successfully'
        });
    })
);

/**
 * @route   POST /api/replay/scenarios/:id/execute
 * @desc    Execute a replay scenario
 * @access  Private
 */
router.post(
    '/scenarios/:id/execute',
    protect,
    [param('id').isUUID().withMessage('Invalid scenario ID')],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const results = await replayEngine.executeScenario(req.params.id);

        res.json({
            success: true,
            data: results,
            message: 'Scenario executed successfully'
        });
    })
);

/**
 * @route   GET /api/replay/scenarios
 * @desc    List all scenarios for the user
 * @access  Private
 */
router.get(
    '/scenarios',
    protect,
    asyncHandler(async (req, res) => {
        const scenarios = await replayEngine.listScenarios(req.user.id);

        res.json({
            success: true,
            data: scenarios,
            count: scenarios.length
        });
    })
);

/**
 * @route   GET /api/replay/scenarios/:id
 * @desc    Get scenario with results
 * @access  Private
 */
router.get(
    '/scenarios/:id',
    protect,
    [param('id').isUUID().withMessage('Invalid scenario ID')],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const data = await replayEngine.getScenarioResults(req.params.id);

        res.json({
            success: true,
            data
        });
    })
);

/**
 * @route   DELETE /api/replay/scenarios/:id
 * @desc    Delete a scenario
 * @access  Private
 */
router.delete(
    '/scenarios/:id',
    protect,
    [param('id').isUUID().withMessage('Invalid scenario ID')],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        await replayEngine.deleteScenario(req.params.id, req.user.id);

        res.json({
            success: true,
            message: 'Scenario deleted successfully'
        });
    })
);

/**
 * @route   POST /api/replay/time-travel
 * @desc    Travel to a specific date and view account state
 * @access  Private
 */
router.post(
    '/time-travel',
    protect,
    [
        body('targetDate').isISO8601().withMessage('Valid target date is required')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { targetDate } = req.body;

        const state = await replayEngine.travelToDate(req.user.id, new Date(targetDate));

        res.json({
            success: true,
            data: state
        });
    })
);

/**
 * @route   POST /api/replay/quick-what-if
 * @desc    Run a quick what-if analysis without saving
 * @access  Private
 */
router.post(
    '/quick-what-if',
    protect,
    [
        body('startDate').isISO8601().withMessage('Valid start date is required'),
        body('endDate').isISO8601().withMessage('Valid end date is required'),
        body('whatIfChanges').isArray().withMessage('What-if changes must be an array'),
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { startDate, endDate, whatIfChanges } = req.body;

        const results = await replayEngine.quickWhatIf({
            userId: req.user.id,
            startDate,
            endDate,
            whatIfChanges
        });

        res.json({
            success: true,
            data: results,
            message: 'Quick analysis completed'
        });
    })
);

/**
 * @route   POST /api/replay/compare
 * @desc    Compare multiple scenarios
 * @access  Private
 */
router.post(
    '/compare',
    protect,
    [
        body('scenarioIds').isArray({ min: 2 }).withMessage('At least 2 scenario IDs required'),
        body('scenarioIds.*').isUUID().withMessage('Invalid scenario ID')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { scenarioIds } = req.body;

        const comparison = await replayEngine.compareScenarios(scenarioIds);

        res.json({
            success: true,
            data: comparison
        });
    })
);

/**
 * @route   POST /api/replay/snapshot
 * @desc    Create a snapshot of current state
 * @access  Private
 */
router.post(
    '/snapshot',
    protect,
    asyncHandler(async (req, res) => {
        const snapshot = await stateReconstructor.createSnapshot(req.user.id);

        res.status(201).json({
            success: true,
            data: snapshot,
            message: 'Snapshot created successfully'
        });
    })
);

export default router;
