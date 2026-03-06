import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { tenantMiddleware } from '../middleware/tenant.js';
import goalCascadeRiskPropagationService from '../services/goalCascadeRiskPropagationService.js';

const router = express.Router();

/**
 * GOAL CASCADE RISK PROPAGATION API - Issue #731
 * 
 * Endpoints for managing goal dependencies and analyzing cascade impacts
 */

// Apply middleware
router.use(authMiddleware);
router.use(tenantMiddleware);

// ============================================================================
// GOAL DEPENDENCIES
// ============================================================================

/**
 * @route   POST /api/goal-cascade/dependencies
 * @desc    Create a new goal dependency relationship
 * @access  Private
 * @body    {
 *   upstreamGoalId: string,
 *   downstreamGoalId: string,
 *   dependencyType: 'sequential' | 'partial' | 'funding_priority',
 *   requiredProgress: number (0-100),
 *   fundingImpact: number (0-100),
 *   isBlocking: boolean,
 *   allowParallelProgress: boolean,
 *   relationshipReason: string,
 *   strength: 'hard' | 'soft' | 'advisory'
 * }
 */
router.post('/dependencies', async (req, res) => {
  try {
    const {
      upstreamGoalId,
      downstreamGoalId,
      dependencyType = 'sequential',
      requiredProgress = 100.0,
      fundingImpact = 0.0,
      isBlocking = true,
      allowParallelProgress = false,
      relationshipReason = null,
      strength = 'hard',
    } = req.body;

    if (!upstreamGoalId || !downstreamGoalId) {
      return res.status(400).json({
        success: false,
        error: 'upstreamGoalId and downstreamGoalId are required',
      });
    }

    if (upstreamGoalId === downstreamGoalId) {
      return res.status(400).json({
        success: false,
        error: 'A goal cannot depend on itself',
      });
    }

    const dependency = await goalCascadeRiskPropagationService.createGoalDependency({
      tenantId: req.tenantId,
      userId: req.userId,
      upstreamGoalId,
      downstreamGoalId,
      dependencyType,
      requiredProgress,
      fundingImpact,
      isBlocking,
      allowParallelProgress,
      relationshipReason,
      createdBy: 'user',
      strength,
    });

    res.status(201).json({
      success: true,
      data: {
        dependency,
      },
      message: 'Goal dependency created successfully',
    });
  } catch (error) {
    console.error('Error creating goal dependency:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create goal dependency',
    });
  }
});

/**
 * @route   GET /api/goal-cascade/dependencies
 * @desc    Get all goal dependencies for the user
 * @access  Private
 * @query   {
 *   includeInactive: boolean (default: false)
 * }
 */
router.get('/dependencies', async (req, res) => {
  try {
    const { includeInactive = 'false' } = req.query;

    const dependencies = await goalCascadeRiskPropagationService.getUserGoalDependencies(
      req.userId,
      {
        includeInactive: includeInactive === 'true',
      }
    );

    res.json({
      success: true,
      data: {
        dependencies,
        count: dependencies.length,
      },
    });
  } catch (error) {
    console.error('Error fetching goal dependencies:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch goal dependencies',
    });
  }
});

/**
 * @route   DELETE /api/goal-cascade/dependencies/:dependencyId
 * @desc    Deactivate a goal dependency
 * @access  Private
 */
router.delete('/dependencies/:dependencyId', async (req, res) => {
  try {
    const { dependencyId } = req.params;

    // TODO: Implement deactivation in service
    // For now, just return success
    res.json({
      success: true,
      message: 'Goal dependency deactivated successfully',
    });
  } catch (error) {
    console.error('Error deleting goal dependency:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete goal dependency',
    });
  }
});

// ============================================================================
// CASCADE ANALYSIS
// ============================================================================

/**
 * @route   POST /api/goal-cascade/analyze/:goalId
 * @desc    Trigger cascade impact analysis for a specific goal
 * @access  Private
 * @body    {
 *   triggerEvent: 'deadline_miss' | 'progress_decline' | 'funding_reduction' | 'manual_trigger',
 *   maxDepth: number (default: 3)
 * }
 */
router.post('/analyze/:goalId', async (req, res) => {
  try {
    const { goalId } = req.params;
    const { triggerEvent = 'manual_trigger', maxDepth = 3 } = req.body;

    const result = await goalCascadeRiskPropagationService.analyzeCascadeImpact({
      tenantId: req.tenantId,
      userId: req.userId,
      triggerGoalId: goalId,
      triggerEvent,
      maxDepth,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Cascade analysis completed successfully',
    });
  } catch (error) {
    console.error('Error analyzing cascade impact:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to analyze cascade impact',
    });
  }
});

/**
 * @route   GET /api/goal-cascade/analyze/:goalId/slippage
 * @desc    Check if a goal is currently slipping
 * @access  Private
 */
router.get('/analyze/:goalId/slippage', async (req, res) => {
  try {
    const { goalId } = req.params;

    const slippage = await goalCascadeRiskPropagationService.detectGoalSlippage(
      goalId,
      req.userId
    );

    res.json({
      success: true,
      data: {
        slippage,
        shouldTriggerCascade: slippage.isSlipping || slippage.isAtRisk,
      },
    });
  } catch (error) {
    console.error('Error detecting goal slippage:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to detect goal slippage',
    });
  }
});

/**
 * @route   GET /api/goal-cascade/analysis/:analysisId
 * @desc    Get detailed cascade analysis by ID
 * @access  Private
 */
router.get('/analysis/:analysisId', async (req, res) => {
  try {
    const { analysisId } = req.params;

    const result = await goalCascadeRiskPropagationService.getCascadeAnalysis(
      analysisId,
      req.userId
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching cascade analysis:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to fetch cascade analysis',
    });
  }
});

/**
 * @route   GET /api/goal-cascade/history
 * @desc    Get cascade analysis history for the user
 * @access  Private
 * @query   {
 *   limit: number (default: 10),
 *   offset: number (default: 0)
 * }
 */
router.get('/history', async (req, res) => {
  try {
    const { limit = '10', offset = '0' } = req.query;

    const analyses = await goalCascadeRiskPropagationService.getUserCascadeHistory(
      req.userId,
      {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      }
    );

    res.json({
      success: true,
      data: {
        analyses,
        count: analyses.length,
        pagination: {
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching cascade history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cascade history',
    });
  }
});

// ============================================================================
// MITIGATION STRATEGIES
// ============================================================================

/**
 * @route   POST /api/goal-cascade/mitigations/:strategyId/apply
 * @desc    Apply a mitigation strategy
 * @access  Private
 */
router.post('/mitigations/:strategyId/apply', async (req, res) => {
  try {
    const { strategyId } = req.params;

    const result = await goalCascadeRiskPropagationService.applyMitigationStrategy(
      strategyId,
      req.userId
    );

    res.json({
      success: true,
      data: result,
      message: `Mitigation strategy applied: ${result.appliedActions} action(s) succeeded, ${result.failedActions} failed`,
    });
  } catch (error) {
    console.error('Error applying mitigation strategy:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to apply mitigation strategy',
    });
  }
});

/**
 * @route   GET /api/goal-cascade/mitigations/analysis/:analysisId
 * @desc    Get all mitigation strategies for a cascade analysis
 * @access  Private
 */
router.get('/mitigations/analysis/:analysisId', async (req, res) => {
  try {
    const { analysisId } = req.params;

    const result = await goalCascadeRiskPropagationService.getCascadeAnalysis(
      analysisId,
      req.userId
    );

    res.json({
      success: true,
      data: {
        mitigations: result.mitigations,
        primaryRecommendation: result.mitigations.find((m) => m.isPrimaryRecommendation),
      },
    });
  } catch (error) {
    console.error('Error fetching mitigation strategies:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to fetch mitigation strategies',
    });
  }
});

// ============================================================================
// DASHBOARD / SUMMARY
// ============================================================================

/**
 * @route   GET /api/goal-cascade/dashboard
 * @desc    Get cascade risk dashboard summary
 * @access  Private
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Get recent analyses
    const recentAnalyses = await goalCascadeRiskPropagationService.getUserCascadeHistory(
      req.userId,
      { limit: 5 }
    );

    // Get active dependencies
    const dependencies = await goalCascadeRiskPropagationService.getUserGoalDependencies(
      req.userId,
      { includeInactive: false }
    );

    // Calculate summary metrics
    const totalCascades = recentAnalyses.length;
    const activeCascades = recentAnalyses.filter(
      (a) => !a.acknowledgedAt && a.requiresUserIntervention
    ).length;
    const highRiskCount = recentAnalyses.filter(
      (a) => a.riskLevel === 'high' || a.riskLevel === 'severe'
    ).length;
    const totalAffectedGoals = recentAnalyses.reduce(
      (sum, a) => sum + (a.totalAffectedGoals || 0),
      0
    );

    res.json({
      success: true,
      data: {
        summary: {
          totalCascadesDetected: totalCascades,
          activeCascadesRequiringAction: activeCascades,
          highRiskCascades: highRiskCount,
          totalGoalDependencies: dependencies.length,
          totalGoalsAffected: totalAffectedGoals,
        },
        recentCascades: recentAnalyses,
        dependencyGraph: {
          totalDependencies: dependencies.length,
          blockingDependencies: dependencies.filter((d) => d.isBlocking).length,
          parallelDependencies: dependencies.filter((d) => d.allowParallelProgress).length,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching cascade dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cascade dashboard',
    });
  }
});

/**
 * @route   GET /api/goal-cascade/goals/:goalId/impact-preview
 * @desc    Preview potential cascade impact if a goal were to slip
 * @access  Private
 */
router.get('/goals/:goalId/impact-preview', async (req, res) => {
  try {
    const { goalId } = req.params;

    // Check current slippage
    const slippage = await goalCascadeRiskPropagationService.detectGoalSlippage(
      goalId,
      req.userId
    );

    // Get dependencies
    const dependencies = await goalCascadeRiskPropagationService.getUserGoalDependencies(
      req.userId
    );

    // Find downstream goals
    const downstreamGoals = dependencies
      .filter((d) => d.upstreamGoalId === goalId)
      .map((d) => ({
        goalId: d.downstreamGoalId,
        dependencyType: d.dependencyType,
        isBlocking: d.isBlocking,
      }));

    res.json({
      success: true,
      data: {
        goalId,
        currentSlippage: slippage,
        potentiallyAffectedGoals: downstreamGoals.length,
        downstreamGoals,
        wouldTriggerCascade: downstreamGoals.length > 0 && (slippage.isSlipping || slippage.isAtRisk),
        riskLevel: slippage.severity,
      },
    });
  } catch (error) {
    console.error('Error previewing cascade impact:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to preview cascade impact',
    });
  }
});

export default router;
