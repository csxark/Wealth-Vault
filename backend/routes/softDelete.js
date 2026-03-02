import express from "express";
import { body, validationResult } from "express-validator";
import db from "../config/db.js";
import { protect, checkOwnership } from "../middleware/auth.js";
import softDeleteService from "../services/softDeleteService.js";
import integrityService from "../services/integrityService.js";
import logger from "../utils/logger.js";

const router = express.Router();

/**
 * @route   POST /api/transactions/:id/soft-delete
 * @desc    Soft-delete a transaction
 * @access  Private
 */
router.post(
  "/:id/soft-delete",
  protect,
  [
    body("reason")
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 }),
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

      const { id } = req.params;
      const { reason = "User requested deletion" } = req.body;

      const result = await softDeleteService.softDeleteTransaction({
        tenantId: req.user.tenantId,
        transactionId: parseInt(id),
        deletedBy: req.user.id,
        reason,
      });

      res.json({
        success: true,
        message: "Transaction soft-deleted successfully",
        data: result,
      });
    } catch (error) {
      console.error("Soft-delete transaction error:", error);
      res.status(error.message?.includes("not found") ? 404 : 500).json({
        success: false,
        message: error.message || "Error soft-deleting transaction",
      });
    }
  }
);

/**
 * @route   POST /api/transactions/:id/record-reversal
 * @desc    Record a reversal for a transaction
 * @access  Private
 */
router.post(
  "/:id/record-reversal",
  protect,
  [
    body("reversalType")
      .optional()
      .isIn(["full_reversal", "partial_reversal", "correction"]),
    body("reversalAmount")
      .isFloat({ min: 0.01 })
      .withMessage("Reversal amount must be positive"),
    body("description")
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 }),
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

      const { id } = req.params;
      const {
        reversalType = "full_reversal",
        reversalAmount,
        description,
      } = req.body;

      const result = await softDeleteService.recordReversal({
        tenantId: req.user.tenantId,
        originalTransactionId: parseInt(id),
        reversalType,
        reversalAmount: parseFloat(reversalAmount),
        description,
        initiatedBy: req.user.id,
      });

      res.json({
        success: true,
        message: "Reversal recorded successfully",
        data: result,
      });
    } catch (error) {
      console.error("Record reversal error:", error);
      res.status(error.message?.includes("not found") ? 404 : 400).json({
        success: false,
        message: error.message || "Error recording reversal",
      });
    }
  }
);

/**
 * @route   GET /api/transactions/soft-deleted
 * @desc    Get soft-deleted transactions
 * @access  Private
 */
router.get("/soft-deleted", protect, async (req, res) => {
  try {
    const { categoryId, limit = 50, offset = 0 } = req.query;

    const deleted = await softDeleteService.getSoftDeletedItems({
      tenantId: req.user.tenantId,
      categoryId,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({
      success: true,
      data: {
        softDeletedItems: deleted,
        count: deleted.length,
      },
    });
  } catch (error) {
    console.error("Get soft-deleted error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching soft-deleted items",
    });
  }
});

/**
 * @route   GET /api/transactions/reversals/pending
 * @desc    Get pending reversals (not yet recorded)
 * @access  Private
 */
router.get("/reversals/pending", protect, async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    const pending = await softDeleteService.getPendingReversals({
      tenantId: req.user.tenantId,
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      data: {
        pendingReversals: pending,
        count: pending.length,
      },
    });
  } catch (error) {
    console.error("Get pending reversals error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching pending reversals",
    });
  }
});

/**
 * @route   POST /api/transactions/reversals/record-batch
 * @desc    Mark multiple reversals as recorded in ledger
 * @access  Private
 */
router.post(
  "/reversals/record-batch",
  protect,
  [body("reversalIds").isArray({ min: 1 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const { reversalIds } = req.body;

      const updated = await softDeleteService.markReversalsRecorded({
        reversalIds: reversalIds.map(Number),
      });

      res.json({
        success: true,
        message: `${updated.length} reversals marked as recorded`,
        data: {
          recorded: updated.length,
          reversals: updated,
        },
      });
    } catch (error) {
      console.error("Record batch reversals error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error recording reversals",
      });
    }
  }
);

/**
 * @route   GET /api/integrity/issues
 * @desc    Get integrity audit issues
 * @access  Private
 */
router.get("/issues", protect, async (req, res) => {
  try {
    const { severity, status = "detected", limit = 50 } = req.query;

    const issues = await softDeleteService.getIntegrityIssues({
      tenantId: req.user.tenantId,
      severity,
      status,
      limit: parseInt(limit),
    });

    const summary = {
      totalCount: issues.length,
      bySeverity: issues.reduce((acc, i) => {
        acc[i.severity] = (acc[i.severity] || 0) + 1;
        return acc;
      }, {}),
      byType: issues.reduce((acc, i) => {
        acc[i.auditType] = (acc[i.auditType] || 0) + 1;
        return acc;
      }, {}),
    };

    res.json({
      success: true,
      data: { issues, summary },
    });
  } catch (error) {
    console.error("Get integrity issues error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching integrity issues",
    });
  }
});

/**
 * @route   POST /api/integrity/issues/:issueId/resolve
 * @desc    Mark integrity issue as resolved
 * @access  Private
 */
router.post(
  "/issues/:issueId/resolve",
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

      const { issueId } = req.params;
      const { rootCause } = req.body;

      const resolved = await softDeleteService.resolveIntegrityIssue({
        tenantId: req.user.tenantId,
        issueId: parseInt(issueId),
        rootCause,
      });

      if (!resolved) {
        return res.status(404).json({
          success: false,
          message: "Issue not found",
        });
      }

      res.json({
        success: true,
        message: "Integrity issue resolved",
        data: { issue: resolved },
      });
    } catch (error) {
      console.error("Resolve integrity issue error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Error resolving integrity issue",
      });
    }
  }
);

/**
 * @route   GET /api/integrity/check/:categoryId
 * @desc    Check integrity for a category
 * @access  Private
 */
router.get("/check/:categoryId", protect, async (req, res) => {
  try {
    const { categoryId } = req.params;

    const integrity = await integrityService.checkCategoryIntegrity({
      tenantId: req.user.tenantId,
      categoryId,
    });

    res.json({
      success: true,
      data: { categoryIntegrity: integrity },
    });
  } catch (error) {
    console.error("Check category integrity error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error checking integrity",
    });
  }
});

/**
 * @route   POST /api/integrity/reconcile
 * @desc    Run full integrity reconciliation
 * @access  Private/Admin
 */
router.post("/reconcile", protect, async (req, res) => {
  try {
    const result = await integrityService.runFullReconciliation({
      tenantId: req.user.tenantId,
    });

    res.json({
      success: true,
      message: result.summary.isHealthy
        ? "Integrity check passed"
        : "Issues detected",
      data: result,
    });
  } catch (error) {
    console.error("Full reconciliation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error running reconciliation",
    });
  }
});

/**
 * @route   GET /api/integrity/report
 * @desc    Get comprehensive integrity report
 * @access  Private/Admin
 */
router.get("/report", protect, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const report = await integrityService.generateIntegrityReport({
      tenantId: req.user.tenantId,
      days: parseInt(days),
    });

    res.json({
      success: true,
      data: { integrityReport: report },
    });
  } catch (error) {
    console.error("Generate report error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error generating report",
    });
  }
});

/**
 * @route   GET /api/transactions/metrics
 * @desc    Get soft-delete and integrity metrics
 * @access  Private
 */
router.get("/metrics", protect, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const metrics = await softDeleteService.getMetrics({
      tenantId: req.user.tenantId,
      days: parseInt(days),
    });

    res.json({
      success: true,
      data: { metrics },
    });
  } catch (error) {
    console.error("Get metrics error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching metrics",
    });
  }
});

export default router;
