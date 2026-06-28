import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, sql, desc, asc, gte } from "drizzle-orm";
import db from "../config/db.js";
import { goals, users, categories, goalMilestones, vaultMembers } from "../db/schema.js";
import { protect, checkOwnership } from "../middleware/auth.js";
import { apiIdempotency } from "../middleware/apiIdempotency.js";
import { RecurringPaymentService } from "../services/recurringPaymentService.js";
import { FXConversionService } from "../services/fxConversionService.js";
import smartSavingsAllocationService from "../services/smartSavingsAllocationService.js";
import goalsDashboardService from "../services/goalsDashboardService.js";
import goalProgressTrackingService from "../services/goalProgressTrackingService.js";
import goalDependencyService from "../services/goalDependencyService.js";

const router = express.Router();
const recurringPaymentService = new RecurringPaymentService();
const fxService = new FXConversionService();

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
router.get("/", protect, asyncHandler(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    status,
    type,
    priority,
    sortBy = "deadline",
    sortOrder = "asc",
    vaultId,
  } = req.query;

  let conditions = [];

  if (vaultId) {
    // Check vault access
    const [membership] = await db
      .select()
      .from(vaultMembers)
      .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, req.user.id)));

    if (!membership) {
      return next(new AppError(403, "Access denied to vault"));
    }

    // Get vault goals
    conditions = [eq(goals.vaultId, vaultId)];
  } else {
    // Get personal goals
    conditions = [eq(goals.userId, req.user.id), sql`${goals.vaultId} IS NULL`];
  }

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

  return new ApiResponse(200, {
    goals: goalsList,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / queryLimit),
      totalItems: total,
      itemsPerPage: queryLimit,
    },
  }, "Goals retrieved successfully").send(res);
}));

// @route   GET /api/goals/:id
// @desc    Get goal by ID
// @access  Private
router.get("/:id", protect, checkOwnership("Goal"), asyncHandler(async (req, res, next) => {
  const goal = await db.query.goals.findFirst({
    where: eq(goals.id, req.params.id),
    with: { category: { columns: { name: true, color: true, icon: true } } },
  });
  return new ApiResponse(200, { goal }, "Goal retrieved successfully").send(res);
}));

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
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const {
      title,
      description,
      targetAmount,
      currency,
      type,
      priority,
      deadline,
      category,
      vaultId,
      tags,
      notes,
      milestones,
      recurringContribution,
    } = req.body;

    // Check vault access if vaultId provided
    if (vaultId) {
      const [membership] = await db
        .select()
        .from(vaultMembers)
        .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, req.user.id)));

      if (!membership) {
        return next(new AppError(403, "Access denied to vault"));
      }
    }

    if (category) {
      const [cat] = await db
        .select()
        .from(categories)
        .where(
          and(eq(categories.id, category), eq(categories.userId, req.user.id))
        );
      if (!cat) {
        return next(new AppError(400, "Invalid category"));
      }
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
        vaultId: vaultId || null,
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

    return new ApiResponse(201, { goal: result }, "Goal created successfully").send(res);
    // Autopilot signal: new goal represents a fund target
    signalAutopilot(req, 'AUTOPILOT_FUND_GOAL', { goalId: newGoal.id, amount: 0, fromVaultId: null });
  })
);

// @route   PUT /api/goals/:id
// @desc    Update goal
// @access  Private
router.put("/:id", protect, checkOwnership("Goal"), asyncHandler(async (req, res, next) => {
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

  return new ApiResponse(200, { goal: result }, "Goal updated successfully").send(res);
}));

// @route   DELETE /api/goals/:id
// @desc    Delete goal
// @access  Private
router.delete("/:id", protect, checkOwnership("Goal"), asyncHandler(async (req, res, next) => {
  await db.delete(goals).where(eq(goals.id, req.params.id));
  return new ApiResponse(200, null, "Goal deleted successfully").send(res);
}));

// @route   POST /api/goals/:id/contribute
// @desc    Add contribution to goal
// @access  Private
router.post(
  "/:id/contribute",
  protect,
  checkOwnership("Goal"),
  [body("amount").isFloat({ min: 0.01 })],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const { amount, description } = req.body;
    const goal = req.resource;

    if (goal.status !== "active") {
      return next(new AppError(400, "Cannot contribute to inactive goals"));
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

    // Autopilot signal: contribution may push a FUND_GOAL workflow
    signalAutopilot(req, 'AUTOPILOT_FUND_GOAL', { goalId: req.params.id, amount: parseFloat(amount) });

    return new ApiResponse(200, { goal: result }, "Contribution added successfully").send(res);
  })
);

// @route   GET /api/goals/stats/summary
// @desc    Get goals summary statistics
// @access  Private
router.get("/stats/summary", protect, asyncHandler(async (req, res, next) => {
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

  return new ApiResponse(200, { summary }, "Goals summary retrieved successfully").send(res);
}));

// Milestone CRUD Routes

// @route   GET /api/goals/:goalId/milestones
// @desc    Get all milestones for a goal
// @access  Private
router.get("/:goalId/milestones", protect, checkOwnership("Goal"), asyncHandler(async (req, res, next) => {
  const milestones = await db.query.goalMilestones.findMany({
    where: eq(goalMilestones.goalId, req.params.goalId),
    orderBy: [asc(goalMilestones.order), asc(goalMilestones.createdAt)],
  });

  return new ApiResponse(200, { milestones }, "Milestones retrieved successfully").send(res);
}));

// @route   POST /api/goals/:goalId/milestones
// @desc    Create new milestone for a goal
// @access  Private
router.post(
  "/:goalId/milestones",
  protect,
  checkOwnership("Goal"),
  [
    body("title").trim().isLength({ min: 1, max: 100 }),
    body("targetAmount").isFloat({ min: 0.01 }),
  ],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const { title, description, targetAmount, deadline } = req.body;

    const [newMilestone] = await db
      .insert(goalMilestones)
      .values({
        goalId: req.params.goalId,
        title,
        description,
        targetAmount: targetAmount.toString(),
        deadline: deadline ? new Date(deadline) : null,
      })
      .returning();

    return new ApiResponse(201, { milestone: newMilestone }, "Milestone created successfully").send(res);
  })
);

// @route   PUT /api/goals/:goalId/milestones/:milestoneId
// @desc    Update milestone
// @access  Private
router.put("/:goalId/milestones/:milestoneId", protect, asyncHandler(async (req, res, next) => {
  // Check if milestone belongs to user's goal
  const [milestone] = await db
    .select()
    .from(goalMilestones)
    .innerJoin(goals, eq(goalMilestones.goalId, goals.id))
    .where(
      and(
        eq(goalMilestones.id, req.params.milestoneId),
        eq(goals.userId, req.user.id)
      )
    );

  if (!milestone) {
    return next(new AppError(404, "Milestone not found"));
  }

  const { title, description, targetAmount, deadline, isCompleted } = req.body;

  const updateData = {};
  if (title) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (targetAmount) updateData.targetAmount = targetAmount.toString();
  if (deadline !== undefined) updateData.deadline = deadline ? new Date(deadline) : null;
  if (isCompleted !== undefined) {
    updateData.isCompleted = isCompleted;
    if (isCompleted && !milestone.isCompleted) {
      updateData.completedDate = new Date();
      // Trigger notification
      await notificationService.createNotification(req.user.id, {
        type: 'milestone_completed',
        title: 'Milestone Achieved! 🎉',
        message: `Congratulations! You've completed the milestone "${milestone.title}"`,
        data: { milestoneId: req.params.milestoneId, goalId: req.params.goalId }
      });
    }
  }
  updateData.updatedAt = new Date();

  const [updatedMilestone] = await db
    .update(goalMilestones)
    .set(updateData)
    .where(eq(goalMilestones.id, req.params.milestoneId))
    .returning();

  return new ApiResponse(200, { milestone: updatedMilestone }, "Milestone updated successfully").send(res);
}));

// @route   DELETE /api/goals/:goalId/milestones/:milestoneId
// @desc    Delete milestone
// @access  Private
router.delete("/:goalId/milestones/:milestoneId", protect, asyncHandler(async (req, res, next) => {
  // Check if milestone belongs to user's goal
  const [milestone] = await db
    .select()
    .from(goalMilestones)
    .innerJoin(goals, eq(goalMilestones.goalId, goals.id))
    .where(
      and(
        eq(goalMilestones.id, req.params.milestoneId),
        eq(goals.userId, req.user.id)
      )
    );

  if (!milestone) {
    return next(new AppError(404, "Milestone not found"));
  }

  await db.delete(goalMilestones).where(eq(goalMilestones.id, req.params.milestoneId));

  return new ApiResponse(200, null, "Milestone deleted successfully").send(res);
}));

// @route   POST /api/goals/:goalId/milestones/:milestoneId/contribute
// @desc    Add contribution to milestone
// @access  Private
router.post(
  "/:goalId/milestones/:milestoneId/contribute",
  protect,
  [body("amount").isFloat({ min: 0.01 })],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const { amount } = req.body;

    // Check if milestone belongs to user's goal
    const [milestone] = await db
      .select()
      .from(goalMilestones)
      .innerJoin(goals, eq(goalMilestones.goalId, goals.id))
      .where(
        and(
          eq(goalMilestones.id, req.params.milestoneId),
          eq(goals.userId, req.user.id)
        )
      );

    if (!milestone) {
      return next(new AppError(404, "Milestone not found"));
    }

    if (milestone.isCompleted) {
      return next(new AppError(400, "Cannot contribute to completed milestones"));
    }

    const currentAmount = parseFloat(milestone.currentAmount || 0) + parseFloat(amount);
    const targetAmount = parseFloat(milestone.targetAmount);

    let isCompleted = milestone.isCompleted;
    let completedDate = milestone.completedDate;

    if (currentAmount >= targetAmount && !isCompleted) {
      isCompleted = true;
      completedDate = new Date();

      // Trigger notification
      await notificationService.createNotification(req.user.id, {
        type: 'milestone_completed',
        title: 'Milestone Achieved! 🎉',
        message: `Congratulations! You've completed the milestone "${milestone.title}"`,
        data: { milestoneId: req.params.milestoneId, goalId: req.params.goalId }
      });
    }

    const [updatedMilestone] = await db
      .update(goalMilestones)
      .set({
        currentAmount: currentAmount.toString(),
        isCompleted,
        completedDate,
        updatedAt: new Date(),
      })
      .where(eq(goalMilestones.id, req.params.milestoneId))
      .returning();

    return new ApiResponse(200, { milestone: updatedMilestone }, "Contribution added to milestone successfully").send(res);
  })
);

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

// ============================================================
// CROSS-CURRENCY FX ENDPOINTS (Issue #570)
// ============================================================

/**
 * @route   POST /api/goals/fx/store-rate
 * @desc    Store FX rate snapshot
 * @access  Private
 */
router.post("/fx/store-rate", protect, async (req, res) => {
  try {
    const { sourceCurrency, targetCurrency, exchangeRate, rateTimestamp } = req.body;

    if (!sourceCurrency || !targetCurrency || !exchangeRate || !rateTimestamp) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: sourceCurrency, targetCurrency, exchangeRate, rateTimestamp"
      });
    }

    const rate = await fxService.storeFXRate({
      tenantId: req.user.tenantId,
      sourceCurrency,
      targetCurrency,
      exchangeRate: parseFloat(exchangeRate),
      rateTimestamp: new Date(rateTimestamp),
      policyType: 'transaction_time'
    });

    res.json({
      success: true,
      message: "FX rate stored successfully",
      data: { rate }
    });
  } catch (error) {
    console.error("Store FX rate error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while storing FX rate"
    });
  }
});

/**
 * @route   POST /api/goals/fx/set-policy
 * @desc    Set FX conversion policy for tenant
 * @access  Private
 */
router.post("/fx/set-policy", protect, async (req, res) => {
  try {
    const { policyType = 'transaction_time', baseCurrency = 'USD', allowedCurrencies = [] } = req.body;

    const policy = await fxService.setConversionPolicy({
      tenantId: req.user.tenantId,
      policyType,
      baseCurrency,
      allowedCurrencies
    });

    res.json({
      success: true,
      message: "FX conversion policy set successfully",
      data: { policy }
    });
  } catch (error) {
    console.error("Set FX policy error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while setting FX policy"
    });
  }
});

/**
 * @route   GET /api/goals/:id/fx-report
 * @desc    Get multi-currency FX report for a goal
 * @access  Private
 */
router.get("/:id/fx-report", protect, checkOwnership("Goal"), async (req, res) => {
  try {
    const report = await fxService.getGoalFXReport({
      goalId: req.params.id,
      tenantId: req.user.tenantId
    });

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "FX report not available for this goal"
      });
    }

    res.json({
      success: true,
      data: { report }
    });
  } catch (error) {
    console.error("Get FX report error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching FX report"
    });
  }
});

/**
 * @route   GET /api/goals/:id/fx-reconciliation
 * @desc    Get FX reconciliation history for a goal
 * @access  Private
 */
router.get("/:id/fx-reconciliation", protect, checkOwnership("Goal"), async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const history = await fxService.getReconciliationHistory({
      tenantId: req.user.tenantId,
      goalId: req.params.id,
      days: parseInt(days)
    });

    res.json({
      success: true,
      data: { history }
    });
  } catch (error) {
    console.error("Get FX reconciliation error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while fetching reconciliation history"
    });
  }
});

/**
 * @route   POST /api/goals/:id/fx-recalculate
 * @desc    Recalculate goal progress from normalized FX amounts
 * @access  Private
 */
router.post("/:id/fx-recalculate", protect, checkOwnership("Goal"), async (req, res) => {
  try {
    const progress = await fxService.recalculateGoalProgress({
      goalId: req.params.id,
      tenantId: req.user.tenantId
    });

    res.json({
      success: true,
      message: "Goal progress recalculated from normalized FX amounts",
      data: progress
    });
  } catch (error) {
    console.error("Recalculate goal progress error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error while recalculating progress"
    });
  }
});

// ============================================================
// SMART SAVINGS GOALS ENDPOINTS (Issue #640)
// ============================================================

router.get("/smart/priorities", protect, async (req, res) => {
  try {
    const data = await smartSavingsAllocationService.getPrioritizedGoals(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart priorities error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to calculate priorities" });
  }
});

router.post("/smart/auto-allocation", protect, async (req, res) => {
  try {
    const { monthlySurplus, strategy = "balanced" } = req.body || {};
    const data = await smartSavingsAllocationService.recommendAutoAllocation(req.user.id, {
      monthlySurplus,
      strategy,
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart auto-allocation error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to generate allocation" });
  }
});

router.get("/smart/conflicts", protect, async (req, res) => {
  try {
    const data = await smartSavingsAllocationService.detectGoalConflicts(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart conflicts error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to detect conflicts" });
  }
});

router.post("/smart/scenario", protect, async (req, res) => {
  try {
    const { monthlyDelta = 0, monthlySurplus, strategy = "balanced" } = req.body || {};
    const data = await smartSavingsAllocationService.runSavingsScenario(req.user.id, {
      monthlyDelta,
      monthlySurplus,
      strategy,
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart scenario error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to run scenario" });
  }
});

router.post("/smart/contribution-auto-adjust", protect, async (req, res) => {
  try {
    const { strategy = "balanced" } = req.body || {};
    const data = await smartSavingsAllocationService.suggestContributionAutoAdjustments(req.user.id, {
      strategy,
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart contribution auto-adjust error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to auto-adjust contributions" });
  }
});

router.get("/smart/templates", protect, async (_req, res) => {
  try {
    const data = smartSavingsAllocationService.getGoalTemplates();
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart templates error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to get templates" });
  }
});

router.get("/smart/reminders", protect, async (req, res) => {
  try {
    const data = await smartSavingsAllocationService.getSmartReminders(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart reminders error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to get reminders" });
  }
});

// ============================================================
// GOAL DEPENDENCY PLANNER ENDPOINTS (Issue #708)
// ============================================================

router.get("/smart/dependencies", protect, async (req, res) => {
  try {
    const data = await goalDependencyService.getDependencyStatusForAllGoals(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart dependencies error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to get dependency status" });
  }
});

router.post("/smart/allocation-with-dependencies", protect, async (req, res) => {
  try {
    const { monthlySurplus, strategy = "balanced" } = req.body || {};
    const data = await smartSavingsAllocationService.recommendDependencyAwareAllocation(req.user.id, {
      monthlySurplus,
      strategy,
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart allocation with dependencies error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to generate dependency-aware allocation" });
  }
});

// ============================================================
// SMART GOALS DASHBOARD ENDPOINTS (Issue #693)
// ============================================================

router.get("/smart/dashboard", protect, async (req, res) => {
  try {
    const data = await goalsDashboardService.getGoalsDashboard(req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart dashboard error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to get dashboard" });
  }
});

router.get("/smart/dashboard/summary", protect, async (req, res) => {
  try {
    const dashboard = await goalsDashboardService.getGoalsDashboard(req.user.id);
    res.json({
      success: true,
      data: {
        summary: dashboard.summary,
        goalsOverview: dashboard.goalsOverview,
      },
    });
  } catch (error) {
    console.error("Smart dashboard summary error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to get dashboard summary" });
  }
});

router.get("/smart/dashboard/insights", protect, async (req, res) => {
  try {
    const dashboard = await goalsDashboardService.getGoalsDashboard(req.user.id);
    res.json({
      success: true,
      data: {
        insights: dashboard.insights,
        nextActions: dashboard.nextActions,
        milestones: dashboard.milestones,
      },
    });
  } catch (error) {
    console.error("Smart dashboard insights error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to get insights" });
  }
});

router.get("/smart/:goalId/progress", protect, async (req, res) => {
  try {
    const data = await goalProgressTrackingService.getGoalProgressMetrics(req.params.goalId, req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart goal progress error:", error);
    res.status(error.message === "Goal not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to get goal progress",
    });
  }
});

router.get("/smart/:goalId/indicators", protect, async (req, res) => {
  try {
    const data = await goalProgressTrackingService.getProgressIndicators(req.params.goalId, req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart goal indicators error:", error);
    res.status(error.message === "Goal not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to get progress indicators",
    });
  }
});

router.get("/smart/:goalId/health", protect, async (req, res) => {
  try {
    const data = await goalProgressTrackingService.getGoalHealthScore(req.params.goalId, req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart goal health error:", error);
    res.status(error.message === "Goal not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to get goal health",
    });
  }
});

router.get("/smart/:goalId/streak", protect, async (req, res) => {
  try {
    const data = await goalProgressTrackingService.getContributionStreak(req.params.goalId, req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart goal streak error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to get contribution streak" });
  }
});

router.get("/smart/:goalId/comparative", protect, async (req, res) => {
  try {
    const data = await goalProgressTrackingService.getComparativeMetrics(req.params.goalId, req.user.id);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart goal comparative error:", error);
    res.status(error.message === "Goal not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to get comparative metrics",
    });
  }
});

router.get("/smart/:goalId/monthly-breakdown", protect, async (req, res) => {
  try {
    const months = req.query.months ? Number(req.query.months) : 12;
    const boundedMonths = Number.isFinite(months) ? Math.max(1, Math.min(24, months)) : 12;
    const data = await goalProgressTrackingService.getMonthlyBreakdown(req.params.goalId, req.user.id, boundedMonths);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Smart goal monthly breakdown error:", error);
    res.status(500).json({ success: false, message: error.message || "Failed to get monthly breakdown" });
  }
});

router.post("/smart/:goalId/contribution", protect, async (req, res) => {
  try {
    const { amount, note = "" } = req.body || {};
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: "Valid contribution amount is required" });
    }

    if (!req.user.tenantId) {
      return res.status(400).json({ success: false, message: "Tenant context is required for contribution tracking" });
    }

    const data = await goalProgressTrackingService.recordContribution(
      req.params.goalId,
      req.user.id,
      req.user.tenantId,
      Number(amount),
      note,
    );

    res.json({ success: true, data, message: "Contribution recorded successfully" });
  } catch (error) {
    console.error("Smart goal contribution error:", error);
    res.status(error.message === "Goal not found" ? 404 : 500).json({
      success: false,
      message: error.message || "Failed to record contribution",
    });
  }
});

export default router;
