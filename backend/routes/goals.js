import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import db from "../config/db.js";
import { goals, users, categories } from "../db/schema.js";
import { protect, checkOwnership } from "../middleware/auth.js";
import { apiIdempotency } from "../middleware/apiIdempotency.js";
import { RecurringPaymentService } from "../services/recurringPaymentService.js";

const router = express.Router();
const recurringPaymentService = new RecurringPaymentService();

// Helper to calculate goal progress
const calculateProgress = (goal) => {
  // Logic usually handled in frontend or virtuals
  // For API response, we can compute it on the fly if needed
  // Drizzle returns plain objects
  return goal;
};

/**
 * @swagger
 * /goals:
 *   get:
 *     summary: Get all goals for authenticated user
 *     tags: [Goals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, completed, paused]
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high]
 *     responses:
 *       200:
 *         description: List of goals
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     goals:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Goal'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/", protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      priority,
      sortBy = "deadline",
      sortOrder = "asc",
    } = req.query;

    const conditions = [eq(goals.userId, req.user.id)];
    if (status) conditions.push(eq(goals.status, status));
    if (type) conditions.push(eq(goals.type, type));
    if (priority) conditions.push(eq(goals.priority, priority));

    const sortFn = sortOrder === "desc" ? desc : asc;
    let orderByColumn = goals.deadline; // Default
    if (sortBy === "status") orderByColumn = goals.status;
    if (sortBy === "targetAmount") orderByColumn = goals.targetAmount;
    if (sortBy === "createdAt") orderByColumn = goals.createdAt;

    const queryLimit = parseInt(limit);
    const queryOffset = (parseInt(page) - 1) * queryLimit;

    const [goalsList, countResult] = await Promise.all([
      db.query.goals.findMany({
        where: and(...conditions),
        orderBy: [sortFn(orderByColumn)],
        limit: queryLimit,
        offset: queryOffset,
        with: {
          category: {
            columns: { name: true, color: true, icon: true },
          },
        },
      }),
      db
        .select({ count: sql`count(*)` })
        .from(goals)
        .where(and(...conditions)),
    ]);

    const total = Number(countResult[0]?.count || 0);

    res.json({
      success: true,
      data: {
        goals: goalsList,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / queryLimit),
          totalItems: total,
          itemsPerPage: queryLimit,
        },
      },
    });
  } catch (error) {
    console.error("Get goals error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while fetching goals" });
  }
});

// @route   GET /api/goals/:id
// @desc    Get goal by ID
// @access  Private
router.get("/:id", protect, checkOwnership("Goal"), async (req, res) => {
  try {
    const goal = await db.query.goals.findFirst({
      where: eq(goals.id, req.params.id),
      with: { category: { columns: { name: true, color: true, icon: true } } },
    });
    res.json({
      success: true,
      data: { goal },
    });
  } catch (error) {
    console.error("Get goal error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while fetching goal" });
  }
});

// @route   POST /api/goals
// @desc    Create new goal
// @access  Private
router.post(
  "/",
  protect,
  [
    body("title").trim().isLength({ min: 1, max: 100 }),
    body("targetAmount").isFloat({ min: 0.01 }),
    body("deadline").isISO8601(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ success: false, errors: errors.array() });

      const {
        title,
        description,
        targetAmount,
        currency,
        type,
        priority,
        deadline,
        category,
        tags,
        notes,
        milestones,
        recurringContribution,
      } = req.body;

      if (category) {
        const [cat] = await db
          .select()
          .from(categories)
          .where(
            and(eq(categories.id, category), eq(categories.userId, req.user.id))
          );
        if (!cat)
          return res
            .status(400)
            .json({ success: false, message: "Invalid category" });
      }

      // Helper calculate next contribution
      let nextContributionDate = null;
      if (
        recurringContribution?.amount > 0 &&
        recurringContribution?.frequency
      ) {
        const now = new Date();
        const next = new Date(now);
        const freq = recurringContribution.frequency;
        if (freq === "monthly") next.setMonth(now.getMonth() + 1);
        else if (freq === "weekly") next.setDate(now.getDate() + 7);
        // ... simple logic here
        nextContributionDate = next;
      }

      const [newGoal] = await db
        .insert(goals)
        .values({
          userId: req.user.id,
          title,
          description,
          targetAmount: targetAmount.toString(),
          currency: currency || "USD",
          type: type || "savings",
          priority: priority || "medium",
          deadline: new Date(deadline),
          categoryId: category,
          tags: tags || [],
          notes,
          milestones: milestones || [],
          recurringContribution: {
            ...recurringContribution,
            nextContributionDate,
          },
        })
        .returning();

      // Fetch with category
      const result = await db.query.goals.findFirst({
        where: eq(goals.id, newGoal.id),
        with: {
          category: { columns: { name: true, color: true, icon: true } },
        },
      });

      res.status(201).json({
        success: true,
        message: "Goal created successfully",
        data: { goal: result },
      });
    } catch (error) {
      console.error("Create goal error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error while creating goal" });
    }
  }
);

// @route   PUT /api/goals/:id
// @desc    Update goal
// @access  Private
router.put("/:id", protect, checkOwnership("Goal"), async (req, res) => {
  try {
    const {
      title,
      description,
      targetAmount,
      currency,
      type,
      priority,
      deadline,
      status,
      notes,
      tags,
    } = req.body;

    const updateData = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (targetAmount) updateData.targetAmount = targetAmount.toString();
    if (currency) updateData.currency = currency;
    if (type) updateData.type = type;
    if (priority) updateData.priority = priority;
    if (deadline) updateData.deadline = new Date(deadline);
    if (status) updateData.status = status;
    if (notes) updateData.notes = notes;
    if (tags) updateData.tags = tags;
    updateData.updatedAt = new Date();

    const [updatedGoal] = await db
      .update(goals)
      .set(updateData)
      .where(eq(goals.id, req.params.id))
      .returning();

    const result = await db.query.goals.findFirst({
      where: eq(goals.id, updatedGoal.id),
      with: { category: { columns: { name: true, color: true, icon: true } } },
    });

    res.json({
      success: true,
      message: "Goal updated successfully",
      data: { goal: result },
    });
  } catch (error) {
    console.error("Update goal error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while updating goal" });
  }
});

// @route   DELETE /api/goals/:id
// @desc    Delete goal
// @access  Private
router.delete("/:id", protect, checkOwnership("Goal"), async (req, res) => {
  try {
    await db.delete(goals).where(eq(goals.id, req.params.id));
    res.json({ success: true, message: "Goal deleted successfully" });
  } catch (error) {
    console.error("Delete goal error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while deleting goal" });
  }
});

// @route   POST /api/goals/:id/contribute
// @desc    Add contribution to goal
// @access  Private
router.post(
  "/:id/contribute",
  protect,
  checkOwnership("Goal"),
  [body("amount").isFloat({ min: 0.01 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ success: false, errors: errors.array() });

      const { amount, description } = req.body;
      const goal = req.resource;

      if (goal.status !== "active") {
        return res
          .status(400)
          .json({
            success: false,
            message: "Cannot contribute to inactive goals",
          });
      }

      // Logic to add contribution
      const currentAmount =
        parseFloat(goal.currentAmount || 0) + parseFloat(amount);
      const targetAmount = parseFloat(goal.targetAmount);

      const metadata = goal.metadata || {
        totalContributions: 0,
        averageContribution: 0,
      };
      metadata.lastContribution = new Date().toISOString();
      metadata.totalContributions = (metadata.totalContributions || 0) + 1;
      // Avg update logic omitted for brevity, can be added

      let status = goal.status;
      let completedDate = goal.completedDate;

      if (currentAmount >= targetAmount && status === "active") {
        status = "completed";
        completedDate = new Date();
      }

      // Check milestones
      let milestones = goal.milestones || [];
      if (milestones.length > 0) {
        milestones = milestones.map((m) => {
          if (!m.achieved && currentAmount >= m.amount) {
            return { ...m, achieved: true, achievedDate: new Date() };
          }
          return m;
        });
      }

      const [updatedGoal] = await db
        .update(goals)
        .set({
          currentAmount: currentAmount.toString(),
          status,
          completedDate,
          metadata,
          milestones,
        })
        .where(eq(goals.id, req.params.id))
        .returning();

      const result = await db.query.goals.findFirst({
        where: eq(goals.id, updatedGoal.id),
        with: {
          category: { columns: { name: true, color: true, icon: true } },
        },
      });

      res.json({
        success: true,
        message: "Contribution added successfully",
        data: { goal: result },
      });
    } catch (error) {
      console.error("Add contribution error:", error);
      res
        .status(500)
        .json({
          success: false,
          message: "Server error while adding contribution",
        });
    }
  }
);

// @route   GET /api/goals/stats/summary
// @desc    Get goals summary statistics
// @access  Private
router.get("/stats/summary", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    // Aggregation
    const stats = await db
      .select({
        status: goals.status,
        count: sql`count(*)`,
        totalTarget: sql`sum(${goals.targetAmount})`,
        totalCurrent: sql`sum(${goals.currentAmount})`,
      })
      .from(goals)
      .where(eq(goals.userId, userId))
      .groupBy(goals.status);

    // Compute summary object matching old API
    const summary = {
      total: 0,
      active: 0,
      completed: 0,
      paused: 0,
      cancelled: 0,
      totalTarget: 0,
      totalCurrent: 0,
      overallProgress: 0,
    };

    stats.forEach((row) => {
      const count = Number(row.count);
      const target = Number(row.totalTarget);
      const current = Number(row.totalCurrent);

      summary[row.status] += count;
      summary.total += count;
      summary.totalTarget += target;
      summary.totalCurrent += current;
    });

    if (summary.totalTarget > 0) {
      summary.overallProgress =
        (summary.totalCurrent / summary.totalTarget) * 100;
    }

    res.json({ success: true, data: { summary } });
  } catch (error) {
    console.error("Get goals summary error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Server error while fetching goals summary",
      });
  }
});

// ============================================================
// RECURRING PAYMENT ENDPOINTS (Issue #568)
// ============================================================

/**
 * @route   GET /api/goals/:id/recurring-payments/executions
 * @desc    Get recurring payment execution history for a goal
 * @access  Private
 */
router.get("/:id/recurring-payments/executions", protect, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const result = await recurringPaymentService.getExecutionHistory({
      goalId: req.params.id,
      userId: req.user.id,
      limit: Math.min(parseInt(limit), 100),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Get execution history error:", error);
    res.status(error.message?.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message || "Server error while fetching execution history"
    });
  }
});

/**
 * @route   POST /api/goals/:id/recurring-payments/trigger
 * @desc    Manually trigger recurring payment for a goal
 * @access  Private
 * @requires Idempotency-Key header
 */
router.post("/:id/recurring-payments/trigger", protect, apiIdempotency(), async (req, res) => {
  try {
    const result = await recurringPaymentService.triggerRecurringPayment({
      goalId: req.params.id,
      tenantId: req.user.tenantId,
      userId: req.user.id,
      sourceEventType: 'api_trigger'
    });

    if (!result.triggered) {
      return res.status(409).json({
        success: false,
        message: result.reason || 'Payment trigger failed',
        result
      });
    }

    res.json({
      success: true,
      message: "Recurring payment triggered successfully",
      data: result
    });
  } catch (error) {
    console.error("Trigger recurring payment error:", error);
    res.status(error.message?.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message || "Server error while triggering recurring payment"
    });
  }
});

/**
 * @route   GET /api/recurring-payments/dead-letters
 * @desc    Get dead-letter queue for authenticated tenant
 * @access  Private
 */
router.get("/dead-letters", protect, async (req, res) => {
  try {
    const { status = 'pending_review', limit = 50 } = req.query;

    const result = await recurringPaymentService.getTenantDLQ({
      tenantId: req.user.tenantId,
      status,
      limit: Math.min(parseInt(limit), 100)
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error("Get dead-letter queue error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching dead-letter queue"
    });
  }
});

/**
 * @route   GET /api/recurring-payments/dead-letters/:id
 * @desc    Get dead-letter entry details
 * @access  Private
 */
router.get("/dead-letters/:id", protect, async (req, res) => {
  try {
    const { DeadLetterService } = await import("../services/deadLetterService.js");
    const dlqService = new DeadLetterService();
    
    const dlqDetails = await dlqService.getDLQDetails(req.params.id);

    if (!dlqDetails || dlqDetails.tenantId !== req.user.tenantId) {
      return res.status(404).json({
        success: false,
        message: "Dead-letter entry not found"
      });
    }

    res.json({
      success: true,
      data: dlqDetails
    });
  } catch (error) {
    console.error("Get dead-letter details error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching dead-letter details"
    });
  }
});

/**
 * @route   POST /api/recurring-payments/dead-letters/:id/replay
 * @desc    Replay a failed payment from dead-letter queue
 * @access  Private
 * @requires Idempotency-Key header
 */
router.post("/dead-letters/:id/replay", protect, apiIdempotency(), async (req, res) => {
  try {
    const { reason } = req.body;

    const result = await recurringPaymentService.replayDeadLetter({
      deadLetterId: req.params.id,
      tenantId: req.user.tenantId,
      userId: req.user.id,
      reason
    });

    res.json({
      success: true,
      message: "Payment replayed successfully",
      data: result
    });
  } catch (error) {
    console.error("Replay dead-letter error:", error);
    res.status(error.message?.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message || "Server error while replaying payment"
    });
  }
});

/**
 * @route   POST /api/recurring-payments/dead-letters/:id/resolve
 * @desc    Mark dead-letter as resolved or ignored
 * @access  Private
 */
router.post("/dead-letters/:id/resolve", protect, async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!['resolved', 'ignored'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Must be 'resolved' or 'ignored'"
      });
    }

    const result = await recurringPaymentService.resolveDeadLetter({
      deadLetterId: req.params.id,
      tenantId: req.user.tenantId,
      status,
      notes
    });

    res.json({
      success: true,
      message: `Dead-letter marked as ${status}`,
      data: result
    });
  } catch (error) {
    console.error("Resolve dead-letter error:", error);
    res.status(error.message?.includes("not found") ? 404 : 500).json({
      success: false,
      message: error.message || "Server error while resolving dead-letter"
    });
  }
});

/**
 * @route   GET /api/recurring-payments/metrics
 * @desc    Get recurring payment metrics for tenant
 * @access  Private
 */
router.get("/metrics", protect, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const metrics = await recurringPaymentService.getDLQMetrics({
      tenantId: req.user.tenantId,
      days: parseInt(days)
    });

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error("Get metrics error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching metrics"
    });
  }
});

export default router;
