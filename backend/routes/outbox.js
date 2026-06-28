import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and } from "drizzle-orm";
import db from "../config/db.js";
import { outboxSequenceNumbers } from "../db/schema-outbox.js";
import { protect, checkTenantAccess } from "../middleware/auth.js";
import outboxSequenceService from "../services/outboxSequenceService.js";
import projectionService from "../services/projectionService.js";
import logger from "../utils/logger.js";

const router = express.Router();

/**
 * @swagger
 * /outbox/sequence/{aggregateId}:
 *   get:
 *     summary: Get sequence status for aggregate
 *     tags: [Outbox Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: aggregateId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Sequence status
 */
router.get("/sequence/:aggregateId", protect, async (req, res) => {
  try {
    const { aggregateId } = req.params;
    const { aggregateType } = req.query;

    if (!aggregateType) {
      return res.status(400).json({
        success: false,
        message: "Missing required query parameter: aggregateType",
      });
    }

    const status = await db
      .select()
      .from(outboxSequenceNumbers)
      .where(
        and(
          eq(outboxSequenceNumbers.tenantId, req.user.tenantId),
          eq(outboxSequenceNumbers.aggregateId, aggregateId),
          eq(outboxSequenceNumbers.aggregateType, aggregateType)
        )
      )
      .limit(1);

    const sequence = status[0] || {
      aggregateId,
      aggregateType,
      currentSequence: 0,
      lastEventId: null,
      lastTimestamp: null,
    };

    res.json({
      success: true,
      data: { sequence },
    });
  } catch (error) {
    console.error("Get sequence status error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching sequence status",
    });
  }
});

/**
 * @route   GET /api/outbox/violations
 * @desc    Get unresolved sequence violations
 * @access  Private
 */
router.get("/violations", protect, async (req, res) => {
  try {
    const { severity } = req.query;

    const violations = await outboxSequenceService.getUnresolvedViolations({
      tenantId: req.user.tenantId,
      severity,
    });

    const summary = {
      totalCount: violations.length,
      bySeverity: violations.reduce((acc, v) => {
        acc[v.severity] = (acc[v.severity] || 0) + 1;
        return acc;
      }, {}),
      byType: violations.reduce((acc, v) => {
        acc[v.violationType] = (acc[v.violationType] || 0) + 1;
        return acc;
      }, {}),
    };

    res.json({
      success: true,
      data: { violations, summary },
    });
  } catch (error) {
    console.error("Get violations error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching violations",
    });
  }
});

/**
 * @route   GET /api/outbox/gaps
 * @desc    Detect sequence gaps
 * @access  Private
 */
router.get("/gaps", protect, async (req, res) => {
  try {
    const { lookbackDays = 1 } = req.query;

    const result = await outboxSequenceService.detectSequenceGaps({
      tenantId: req.user.tenantId,
      lookbackDays: parseInt(lookbackDays),
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Detect gaps error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while detecting gaps",
    });
  }
});

/**
 * @route   GET /api/outbox/consumer/:consumerName/status
 * @desc    Get consumer processing status
 * @access  Private
 */
router.get("/consumer/:consumerName/status", protect, async (req, res) => {
  try {
    const { consumerName } = req.params;

    const status = await outboxSequenceService.getConsumerStatus({
      tenantId: req.user.tenantId,
      consumerName,
    });

    if (!status) {
      return res.status(404).json({
        success: false,
        message: "No processing data found for this consumer",
      });
    }

    res.json({
      success: true,
      data: { consumerStatus: status },
    });
  } catch (error) {
    console.error("Get consumer status error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching consumer status",
    });
  }
});

/**
 * @route   POST /api/outbox/violations/:violationId/resolve
 * @desc    Mark violation as resolved
 * @access  Private/Admin
 */
router.post(
  "/violations/:violationId/resolve",
  protect,
  [body("rootCause").optional().isString().trim()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { violationId } = req.params;
      const { rootCause } = req.body;

      const resolved = await outboxSequenceService.resolveViolation({
        tenantId: req.user.tenantId,
        violationId: parseInt(violationId),
        rootCause,
      });

      if (!resolved) {
        return res.status(404).json({
          success: false,
          message: "Violation not found",
        });
      }

      res.json({
        success: true,
        message: "Violation marked as resolved",
        data: { violation: resolved },
      });
    } catch (error) {
      console.error("Resolve violation error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Server error while resolving violation",
      });
    }
  }
);

/**
 * @route   POST /api/outbox/projections/:projectionName/rebuild
 * @desc    Start full projection rebuild
 * @access  Private/Admin
 */
router.post(
  "/projections/:projectionName/rebuild",
  protect,
  [
    body("rebuildType")
      .optional()
      .isIn(["full", "partial", "backfill"]),
    body("aggregateId").optional().isUUID(),
    body("aggregateType").optional().isString(),
    body("startSequence").optional().isInt({ min: 1 }),
    body("endSequence").optional().isInt({ min: 1 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { projectionName } = req.params;
      const {
        rebuildType = "full",
        aggregateId,
        aggregateType,
        startSequence,
        endSequence,
      } = req.body;

      let result;

      if (rebuildType === "full") {
        result = await projectionService.startFullRebuild({
          tenantId: req.user.tenantId,
          projectionName,
          initiatedBy: "manual",
        });
      } else if (rebuildType === "partial") {
        if (!aggregateId || !aggregateType) {
          return res.status(400).json({
            success: false,
            message: "Missing aggregateId and aggregateType for partial rebuild",
          });
        }

        result = await projectionService.startPartialRebuild({
          tenantId: req.user.tenantId,
          projectionName,
          aggregateId,
          aggregateType,
          initiatedBy: "manual",
        });
      } else if (rebuildType === "backfill") {
        if (!startSequence || !endSequence) {
          return res.status(400).json({
            success: false,
            message: "Missing startSequence and endSequence for backfill",
          });
        }

        result = await projectionService.startBackfill({
          tenantId: req.user.tenantId,
          projectionName,
          startSequence,
          endSequence,
          initiatedBy: "manual",
        });
      }

      res.json({
        success: true,
        message: `${rebuildType} projection rebuild initiated`,
        data: result,
      });
    } catch (error) {
      console.error("Start rebuild error:", error);
      res.status(error.message?.includes("already in progress") ? 409 : 500).json({
        success: false,
        message: error.message || "Server error while starting rebuild",
      });
    }
  }
);

/**
 * @route   GET /api/outbox/projections/:projectionName/rebuilds
 * @desc    Get rebuild history for projection
 * @access  Private
 */
router.get("/projections/:projectionName/rebuilds", protect, async (req, res) => {
  try {
    const { projectionName } = req.params;
    const { limit = 20 } = req.query;

    const history = await projectionService.getRebuildHistory({
      tenantId: req.user.tenantId,
      projectionName,
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      data: { rebuildHistory: history },
    });
  } catch (error) {
    console.error("Get rebuild history error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching rebuild history",
    });
  }
});

/**
 * @route   GET /api/outbox/projections/active
 * @desc    Get all active projection rebuilds
 * @access  Private
 */
router.get("/projections/active", protect, async (req, res) => {
  try {
    const activeRebuilds = await projectionService.getActiveRebuilds({
      tenantId: req.user.tenantId,
    });

    res.json({
      success: true,
      data: { activeRebuilds },
    });
  } catch (error) {
    console.error("Get active rebuilds error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching active rebuilds",
    });
  }
});

/**
 * @route   GET /api/outbox/metrics
 * @desc    Get outbox processing metrics
 * @access  Private
 */
router.get("/metrics", protect, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const metrics = await outboxSequenceService.getMetrics({
      tenantId: req.user.tenantId,
      days: parseInt(days),
    });

    const rebuildMetrics = await projectionService.getMetrics({
      tenantId: req.user.tenantId,
      days: parseInt(days),
    });

    res.json({
      success: true,
      data: {
        sequenceMetrics: metrics,
        rebuildMetrics,
        activeRebuildCount: projectionService.getActiveRebuildCount(),
      },
    });
  } catch (error) {
    console.error("Get metrics error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching metrics",
    });
  }
});

export default router;
