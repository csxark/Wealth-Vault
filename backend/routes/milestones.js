import express from "express";
import milestoneService from "../services/milestoneService.js";
import milestoneReconciliation from "../jobs/milestoneReconciliation.js";
import logger from "../utils/logger.js";

const router = express.Router();

/**
 * Milestone Routes
 * Issue #573: Goal Milestone Race Conditions
 * 
 * Endpoints for managing goal milestones, detecting missed triggers,
 * and backfilling missed milestones due to race conditions.
 */

/**
 * GET /api/milestones/:goalId
 * Get all milestones for a goal with their status
 */
router.get("/:goalId", async (req, res, next) => {
  try {
    const { goalId } = req.params;
    const tenantId = req.user.tenantId;

    const milestones = await milestoneService.getMilestoneStatus({
      tenantId,
      goalId: parseInt(goalId),
    });

    res.json({
      success: true,
      data: milestones,
      count: milestones.length,
    });
  } catch (error) {
    logger.error("Error getting milestone status", {
      error: error.message,
      goalId: req.params.goalId,
    });
    next(error);
  }
});

/**
 * POST /api/milestones/:goalId
 * Create a new milestone for a goal
 */
router.post("/:goalId", async (req, res, next) => {
  try {
    const { goalId } = req.params;
    const tenantId = req.user.tenantId;
    const {
      milestoneName,
      thresholdPercent,
      targetAmountDollars,
      rewardMessage,
      icon,
    } = req.body;

    if (!milestoneName || !thresholdPercent || !targetAmountDollars) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: milestoneName, thresholdPercent, targetAmountDollars",
      });
    }

    if (thresholdPercent < 0 || thresholdPercent > 100) {
      return res.status(400).json({
        success: false,
        error: "thresholdPercent must be between 0 and 100",
      });
    }

    const milestone = await milestoneService.createMilestone({
      tenantId,
      goalId: parseInt(goalId),
      milestoneName,
      thresholdPercent,
      targetAmountDollars,
      rewardMessage,
      icon,
    });

    res.status(201).json({
      success: true,
      data: milestone,
    });
  } catch (error) {
    logger.error("Error creating milestone", {
      error: error.message,
      goalId: req.params.goalId,
    });
    next(error);
  }
});

/**
 * GET /api/milestones/:goalId/triggered
 * Get all triggered milestones for a goal
 */
router.get("/:goalId/triggered", async (req, res, next) => {
  try {
    const { goalId } = req.params;
    const tenantId = req.user.tenantId;

    const triggered = await milestoneService.getTriggeredMilestones({
      tenantId,
      goalId: parseInt(goalId),
    });

    res.json({
      success: true,
      data: triggered,
      count: triggered.length,
    });
  } catch (error) {
    logger.error("Error getting triggered milestones", {
      error: error.message,
      goalId: req.params.goalId,
    });
    next(error);
  }
});

/**
 * POST /api/milestones/:goalId/detect-missed
 * Detect missed milestones for a goal
 */
router.post("/:goalId/detect-missed", async (req, res, next) => {
  try {
    const { goalId } = req.params;
    const tenantId = req.user.tenantId;
    const { currentProgressDollars } = req.body;

    if (!currentProgressDollars) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: currentProgressDollars",
      });
    }

    const result = await milestoneService.detectMissedMilestones({
      tenantId,
      goalId: parseInt(goalId),
      currentProgressDollars,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Error detecting missed milestones", {
      error: error.message,
      goalId: req.params.goalId,
    });
    next(error);
  }
});

/**
 * POST /api/milestones/:goalId/backfill
 * Manually backfill a missed milestone
 */
router.post("/:goalId/backfill", async (req, res, next) => {
  try {
    const { goalId } = req.params;
    const tenantId = req.user.tenantId;
    const { milestoneId, currentProgressCents, targetCents } = req.body;

    if (!milestoneId || !currentProgressCents || !targetCents) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: milestoneId, currentProgressCents, targetCents",
      });
    }

    const result = await milestoneService.backfillMissedMilestone({
      tenantId,
      goalId: parseInt(goalId),
      milestoneId,
      currentProgressCents,
      targetCents,
    });

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(409).json({
        success: false,
        error: result.reason,
      });
    }
  } catch (error) {
    logger.error("Error backfilling milestone", {
      error: error.message,
      goalId: req.params.goalId,
    });
    next(error);
  }
});

/**
 * POST /api/milestones/:goalId/evaluate
 * Evaluate milestone crossing (called after contribution)
 */
router.post("/:goalId/evaluate", async (req, res, next) => {
  try {
    const { goalId } = req.params;
    const tenantId = req.user.tenantId;
    const {
      progressBeforeDollars,
      progressAfterDollars,
      targetAmountDollars,
      contributionId,
    } = req.body;

    if (
      progressBeforeDollars === undefined ||
      progressAfterDollars === undefined ||
      !targetAmountDollars ||
      !contributionId
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Missing required fields: progressBeforeDollars, progressAfterDollars, targetAmountDollars, contributionId",
      });
    }

    const result = await milestoneService.evaluateMilestoneCrossing({
      tenantId,
      goalId: parseInt(goalId),
      progressBeforeDollars,
      progressAfterDollars,
      targetAmountDollars,
      contributionId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Error evaluating milestone crossing", {
      error: error.message,
      goalId: req.params.goalId,
    });
    next(error);
  }
});

/**
 * GET /api/milestones/missed
 * Get all missed milestones for tenant
 */
router.get("/tenant/missed", async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { pending } = req.query;

    const result = await milestoneService.getMissedMilestones({
      tenantId,
      pendingOnly: pending === "true",
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Error getting missed milestones", {
      error: error.message,
    });
    next(error);
  }
});

/**
 * GET /api/milestones/metrics
 * Get milestone metrics for tenant
 */
router.get("/tenant/metrics", async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { days } = req.query;

    const metrics = await milestoneService.getMetrics({
      tenantId,
      days: days ? parseInt(days) : 7,
    });

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    logger.error("Error getting milestone metrics", {
      error: error.message,
    });
    next(error);
  }
});

/**
 * POST /api/milestones/reconcile
 * Manually trigger reconciliation job
 * Requires admin role
 */
router.post("/admin/reconcile", async (req, res, next) => {
  try {
    // Check admin permission
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        error: "Admin permission required",
      });
    }

    const result = await milestoneReconciliation.run();

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Error running reconciliation", {
      error: error.message,
    });
    next(error);
  }
});

/**
 * GET /api/milestones/reconcile/stats
 * Get reconciliation job statistics
 * Requires admin role
 */
router.get("/admin/reconcile/stats", async (req, res, next) => {
  try {
    // Check admin permission
    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({
        success: false,
        error: "Admin permission required",
      });
    }

    const stats = milestoneReconciliation.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Error getting reconciliation stats", {
      error: error.message,
    });
    next(error);
  }
});

export default router;
