import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import monteCarloService from '../services/monteCarloService.js';
import db from '../config/db.js';
import { stochasticSimulations, probabilityOutcomes, retirementParameters } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { aiLimiter } from '../middleware/aiLimiter.js';
import auditService from '../services/auditService.js';

const router = express.Router();

/**
 * @route   POST /api/simulations/run
 * @desc    Execute a new Monte Carlo retirement simulation
 */
router.post('/run', protect, aiLimiter, asyncHandler(async (req, res) => {
    const { name, numPaths, horizonYears } = req.body;

    const result = await monteCarloService.runSimulation(req.user.id, {
        name,
        numPaths: parseInt(numPaths) || 10000,
        horizonYears: parseInt(horizonYears) || 50
    });

    return new ApiResponse(201, result, 'Simulation completed successfully').send(res);
}));

/**
 * @route   GET /api/simulations/latest
 * @desc    Get the latest simulation results with percentile outcomes
 */
router.get('/latest', protect, asyncHandler(async (req, res) => {
    const simulation = await db.query.stochasticSimulations.findFirst({
        where: eq(stochasticSimulations.userId, req.user.id),
        orderBy: [desc(stochasticSimulations.createdAt)],
        with: {
            outcomes: true
        }
    });

    if (!simulation) {
        return new ApiResponse(404, null, 'No simulations found').send(res);
    }

    // Group outcomes by year for chart visualization (L3 requirement)
    const groupedOutcomes = simulation.outcomes.reduce((acc, curr) => {
        if (!acc[curr.year]) acc[curr.year] = {};
        acc[curr.year][`p${curr.percentile}`] = curr.projectedValue;
        return acc;
    }, {});

    return new ApiResponse(200, {
        ...simulation,
        outcomes: Object.entries(groupedOutcomes).map(([year, data]) => ({ year: parseInt(year), ...data }))
    }, 'Latest simulation retrieved').send(res);
}));

/**
 * @route   PATCH /api/simulations/parameters
 * @desc    Update retirement parameters
 */
router.patch('/parameters', protect, asyncHandler(async (req, res) => {
    const { targetRetirementAge, monthlyRetirementSpending, expectedInflationRate, dynamicWithdrawalEnabled } = req.body;

    const [updated] = await db.insert(retirementParameters).values({
        userId: req.user.id,
        targetRetirementAge,
        monthlyRetirementSpending,
        expectedInflationRate,
        dynamicWithdrawalEnabled
    }).onConflictDoUpdate({
        target: retirementParameters.userId,
        set: {
            targetRetirementAge,
            monthlyRetirementSpending,
            expectedInflationRate,
            dynamicWithdrawalEnabled,
            updatedAt: new Date()
        }
    }).returning();

    await auditService.logAuditEvent({
        userId: req.user.id,
        action: 'RETIREMENT_PARAM_UPDATE',
        resourceType: 'user',
        resourceId: req.user.id,
        metadata: req.body
    });

    return new ApiResponse(200, updated, 'Retirement parameters updated').send(res);
}));

export default router;
