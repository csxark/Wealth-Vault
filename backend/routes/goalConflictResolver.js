import express from 'express';
import { body, param } from 'express-validator';
import multiGoalConflictResolver from '../services/multiGoalConflictResolver.js';
import { protect } from '../middleware/authMiddleware.js';
import ApiResponse from '../utils/ApiResponse.js';
import { validationResult } from 'express-validator';

const router = express.Router();

/**
 * @swagger
 * /api/goal-conflicts/resolve:
 *   get:
 *     summary: Resolve all goal conflicts for current user
 *     tags: [Goal Conflicts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conflict analysis and resolution recommendations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: integer
 *                 hasConflicts:
 *                   type: boolean
 *                 conflicts:
 *                   type: object
 *                   properties:
 *                     detected:
 *                       type: boolean
 *                     conflictCount:
 *                       type: integer
 *                     details:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             enum: [capacity_shortage, deadline_conflict, category_conflict]
 *                           severity:
 *                             type: string
 *                             enum: [low, medium, high, critical]
 *                           description:
 *                             type: string
 *                           details:
 *                             type: object
 *                 prioritizedGoals:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rank:
 *                         type: integer
 *                       tier:
 *                         type: string
 *                         enum: [high, medium, low]
 *                       goalId:
 *                         type: integer
 *                       goalName:
 *                         type: string
 *                       scores:
 *                         type: object
 *                         properties:
 *                           composite:
 *                             type: number
 *                           urgency:
 *                             type: number
 *                           financialImpact:
 *                             type: number
 *                           userPriority:
 *                             type: number
 *                           progress:
 *                             type: number
 *                           dependency:
 *                             type: number
 *                 recommendedAllocation:
 *                   type: object
 *                   properties:
 *                     totalAvailableCapacity:
 *                       type: number
 *                     totalAllocated:
 *                       type: number
 *                     utilizationRate:
 *                       type: number
 *                     allocations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           goalId:
 *                             type: integer
 *                           allocatedMonthly:
 *                             type: number
 *                           allocationStrategy:
 *                             type: string
 *                           rationale:
 *                             type: array
 *                             items:
 *                               type: string
 *                           impact:
 *                             type: object
 *                 impactSimulation:
 *                   type: object
 *                 whatIfScenarios:
 *                   type: array
 */
router.get('/resolve', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const resolution = await multiGoalConflictResolver.resolveGoalConflicts(userId);

    return ApiResponse.success(
      res,
      resolution,
      'Goal conflicts analyzed and resolved successfully'
    );
  } catch (error) {
    console.error('Error resolving goal conflicts:', error);
    return ApiResponse.error(
      res,
      'Failed to resolve goal conflicts',
      500
    );
  }
});

/**
 * @swagger
 * /api/goal-conflicts/conflicts-only:
 *   get:
 *     summary: Get only detected conflicts without full resolution
 *     tags: [Goal Conflicts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of detected conflicts
 */
router.get('/conflicts-only', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const goals = await multiGoalConflictResolver.getAllActiveGoals(userId);
    
    if (goals.length === 0) {
      return ApiResponse.success(
        res,
        { hasConflicts: false, conflicts: [] },
        'No active goals found'
      );
    }

    // Get financial capacity
    const savingsVelocityOptimizer = (await import('../services/savingsVelocityOptimizer.js')).default;
    const [incomeAnalysis, debtObligations, expenseAnalysis] = await Promise.all([
      savingsVelocityOptimizer.analyzeIncomeTrajectory(userId),
      savingsVelocityOptimizer.calculateDebtObligations(userId),
      savingsVelocityOptimizer.calculateMonthlyExpenses(userId)
    ]);

    const financialCapacity = savingsVelocityOptimizer.calculateFinancialCapacity({
      income: incomeAnalysis,
      debt: debtObligations,
      expenses: expenseAnalysis
    });

    // Score goals
    const scoredGoals = await Promise.all(
      goals.map(goal => multiGoalConflictResolver.scoreGoal(goal, userId, financialCapacity))
    );

    // Detect conflicts only
    const conflicts = multiGoalConflictResolver.detectConflicts(scoredGoals, financialCapacity);

    return ApiResponse.success(
      res,
      {
        hasConflicts: conflicts.detected,
        conflictCount: conflicts.conflictCount,
        conflicts: conflicts.details,
        totalGoals: goals.length,
        financialCapacity: {
          available: financialCapacity.safeCapacity,
          totalRequired: scoredGoals.reduce((sum, g) => sum + g.requiredMonthly, 0)
        }
      },
      conflicts.detected ? 'Conflicts detected' : 'No conflicts detected'
    );
  } catch (error) {
    console.error('Error detecting conflicts:', error);
    return ApiResponse.error(
      res,
      'Failed to detect conflicts',
      500
    );
  }
});

/**
 * @swagger
 * /api/goal-conflicts/priority-ranking:
 *   get:
 *     summary: Get prioritized ranking of all goals
 *     tags: [Goal Conflicts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ranked list of goals with scores
 */
router.get('/priority-ranking', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const goals = await multiGoalConflictResolver.getAllActiveGoals(userId);
    
    if (goals.length === 0) {
      return ApiResponse.success(
        res,
        { goals: [] },
        'No active goals found'
      );
    }

    // Get financial capacity
    const savingsVelocityOptimizer = (await import('../services/savingsVelocityOptimizer.js')).default;
    const [incomeAnalysis, debtObligations, expenseAnalysis] = await Promise.all([
      savingsVelocityOptimizer.analyzeIncomeTrajectory(userId),
      savingsVelocityOptimizer.calculateDebtObligations(userId),
      savingsVelocityOptimizer.calculateMonthlyExpenses(userId)
    ]);

    const financialCapacity = savingsVelocityOptimizer.calculateFinancialCapacity({
      income: incomeAnalysis,
      debt: debtObligations,
      expenses: expenseAnalysis
    });

    // Score and rank goals
    const scoredGoals = await Promise.all(
      goals.map(goal => multiGoalConflictResolver.scoreGoal(goal, userId, financialCapacity))
    );

    const rankedGoals = multiGoalConflictResolver.rankGoals(scoredGoals);

    return ApiResponse.success(
      res,
      {
        totalGoals: rankedGoals.length,
        highPriority: rankedGoals.filter(g => g.tier === 'high').length,
        mediumPriority: rankedGoals.filter(g => g.tier === 'medium').length,
        lowPriority: rankedGoals.filter(g => g.tier === 'low').length,
        goals: rankedGoals
      },
      'Goals ranked successfully'
    );
  } catch (error) {
    console.error('Error ranking goals:', error);
    return ApiResponse.error(
      res,
      'Failed to rank goals',
      500
    );
  }
});

/**
 * @swagger
 * /api/goal-conflicts/what-if:
 *   post:
 *     summary: Run what-if scenario analysis
 *     tags: [Goal Conflicts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scenarioType:
 *                 type: string
 *                 enum: [income_change, defer_goal, focus_subset, custom_capacity]
 *               parameters:
 *                 type: object
 *                 properties:
 *                   incomeChangePercent:
 *                     type: number
 *                   deferGoalId:
 *                     type: integer
 *                   focusGoalIds:
 *                     type: array
 *                     items:
 *                       type: integer
 *                   customCapacity:
 *                     type: number
 *     responses:
 *       200:
 *         description: What-if scenario results
 */
router.post('/what-if',
  protect,
  [
    body('scenarioType')
      .isIn(['income_change', 'defer_goal', 'focus_subset', 'custom_capacity'])
      .withMessage('Invalid scenario type'),
    body('parameters').isObject().withMessage('Parameters must be an object')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.error(res, 'Validation failed', 400, errors.array());
    }

    try {
      const userId = req.user.id;
      const { scenarioType, parameters } = req.body;

      const goals = await multiGoalConflictResolver.getAllActiveGoals(userId);
      
      // Get financial capacity
      const savingsVelocityOptimizer = (await import('../services/savingsVelocityOptimizer.js')).default;
      const [incomeAnalysis, debtObligations, expenseAnalysis] = await Promise.all([
        savingsVelocityOptimizer.analyzeIncomeTrajectory(userId),
        savingsVelocityOptimizer.calculateDebtObligations(userId),
        savingsVelocityOptimizer.calculateMonthlyExpenses(userId)
      ]);

      const financialCapacity = savingsVelocityOptimizer.calculateFinancialCapacity({
        income: incomeAnalysis,
        debt: debtObligations,
        expenses: expenseAnalysis
      });

      // Score goals
      const scoredGoals = await Promise.all(
        goals.map(goal => multiGoalConflictResolver.scoreGoal(goal, userId, financialCapacity))
      );

      const rankedGoals = multiGoalConflictResolver.rankGoals(scoredGoals);

      let scenarioResult;

      switch (scenarioType) {
        case 'income_change':
          const changePercent = parameters.incomeChangePercent || 0;
          const newCapacity = financialCapacity.safeCapacity * (1 + changePercent / 100);
          scenarioResult = multiGoalConflictResolver.simulateScenario(rankedGoals, newCapacity);
          break;

        case 'defer_goal':
          const deferGoalId = parameters.deferGoalId;
          const filteredGoals = rankedGoals.filter(g => g.goalId !== deferGoalId);
          scenarioResult = multiGoalConflictResolver.simulateScenario(filteredGoals, financialCapacity.safeCapacity);
          break;

        case 'focus_subset':
          const focusGoalIds = parameters.focusGoalIds || [];
          const focusedGoals = rankedGoals.filter(g => focusGoalIds.includes(g.goalId));
          scenarioResult = multiGoalConflictResolver.simulateScenario(focusedGoals, financialCapacity.safeCapacity);
          break;

        case 'custom_capacity':
          const customCapacity = parameters.customCapacity || financialCapacity.safeCapacity;
          scenarioResult = multiGoalConflictResolver.simulateScenario(rankedGoals, customCapacity);
          break;

        default:
          return ApiResponse.error(res, 'Unknown scenario type', 400);
      }

      return ApiResponse.success(
        res,
        {
          scenarioType,
          parameters,
          currentCapacity: financialCapacity.safeCapacity,
          result: scenarioResult
        },
        'What-if scenario completed'
      );
    } catch (error) {
      console.error('Error running what-if scenario:', error);
      return ApiResponse.error(
        res,
        'Failed to run what-if scenario',
        500
      );
    }
  }
);

/**
 * @swagger
 * /api/goal-conflicts/allocation-preview:
 *   get:
 *     summary: Preview allocation recommendations without full analysis
 *     tags: [Goal Conflicts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Quick allocation preview
 */
router.get('/allocation-preview', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const goals = await multiGoalConflictResolver.getAllActiveGoals(userId);
    
    if (goals.length === 0) {
      return ApiResponse.success(
        res,
        { allocations: [] },
        'No active goals found'
      );
    }

    // Get financial capacity
    const savingsVelocityOptimizer = (await import('../services/savingsVelocityOptimizer.js')).default;
    const [incomeAnalysis, debtObligations, expenseAnalysis] = await Promise.all([
      savingsVelocityOptimizer.analyzeIncomeTrajectory(userId),
      savingsVelocityOptimizer.calculateDebtObligations(userId),
      savingsVelocityOptimizer.calculateMonthlyExpenses(userId)
    ]);

    const financialCapacity = savingsVelocityOptimizer.calculateFinancialCapacity({
      income: incomeAnalysis,
      debt: debtObligations,
      expenses: expenseAnalysis
    });

    // Score and rank goals
    const scoredGoals = await Promise.all(
      goals.map(goal => multiGoalConflictResolver.scoreGoal(goal, userId, financialCapacity))
    );

    const rankedGoals = multiGoalConflictResolver.rankGoals(scoredGoals);

    // Detect conflicts
    const conflicts = multiGoalConflictResolver.detectConflicts(scoredGoals, financialCapacity);

    // Generate allocation
    const allocation = multiGoalConflictResolver.generateAllocation(
      rankedGoals,
      financialCapacity,
      conflicts
    );

    return ApiResponse.success(
      res,
      {
        totalAvailable: allocation.totalAvailableCapacity,
        totalAllocated: allocation.totalAllocated,
        utilizationRate: allocation.utilizationRate,
        allocations: allocation.allocations.map(a => ({
          goalId: a.goalId,
          goalName: a.goalName,
          rank: a.rank,
          requiredMonthly: a.requiredMonthly,
          allocatedMonthly: a.allocatedMonthly,
          allocationPercentage: a.allocationPercentage,
          strategy: a.allocationStrategy
        }))
      },
      'Allocation preview generated'
    );
  } catch (error) {
    console.error('Error generating allocation preview:', error);
    return ApiResponse.error(
      res,
      'Failed to generate allocation preview',
      500
    );
  }
});

export default router;
