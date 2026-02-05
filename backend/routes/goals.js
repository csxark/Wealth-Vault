import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, sql, desc, asc, gte } from "drizzle-orm";
import db from "../config/db.js";
import { goals, users, categories, goalMilestones, vaultMembers } from "../db/schema.js";
import { protect, checkOwnership } from "../middleware/auth.js";
import { checkVaultAccess } from "../middleware/vaultAuth.js";
import notificationService from "../services/notificationService.js";

const router = express.Router();

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
        return res.status(403).json({ success: false, message: "Access denied to vault" });
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
          return res.status(403).json({ success: false, message: "Access denied to vault" });
        }
      }

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

// Milestone CRUD Routes

// @route   GET /api/goals/:goalId/milestones
// @desc    Get all milestones for a goal
// @access  Private
router.get("/:goalId/milestones", protect, checkOwnership("Goal"), async (req, res) => {
  try {
    const milestones = await db.query.goalMilestones.findMany({
      where: eq(goalMilestones.goalId, req.params.goalId),
      orderBy: [asc(goalMilestones.order), asc(goalMilestones.createdAt)],
    });

    res.json({
      success: true,
      data: { milestones },
    });
  } catch (error) {
    console.error("Get milestones error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while fetching milestones" });
  }
});

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
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ success: false, errors: errors.array() });

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

      res.status(201).json({
        success: true,
        message: "Milestone created successfully",
        data: { milestone: newMilestone },
      });
    } catch (error) {
      console.error("Create milestone error:", error);
      res
        .status(500)
        .json({ success: false, message: "Server error while creating milestone" });
    }
  }
);

// @route   PUT /api/goals/:goalId/milestones/:milestoneId
// @desc    Update milestone
// @access  Private
router.put("/:goalId/milestones/:milestoneId", protect, async (req, res) => {
  try {
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
      return res.status(404).json({ success: false, message: "Milestone not found" });
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

    res.json({
      success: true,
      message: "Milestone updated successfully",
      data: { milestone: updatedMilestone },
    });
  } catch (error) {
    console.error("Update milestone error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while updating milestone" });
  }
});

// @route   DELETE /api/goals/:goalId/milestones/:milestoneId
// @desc    Delete milestone
// @access  Private
router.delete("/:goalId/milestones/:milestoneId", protect, async (req, res) => {
  try {
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
      return res.status(404).json({ success: false, message: "Milestone not found" });
    }

    await db.delete(goalMilestones).where(eq(goalMilestones.id, req.params.milestoneId));

    res.json({ success: true, message: "Milestone deleted successfully" });
  } catch (error) {
    console.error("Delete milestone error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while deleting milestone" });
  }
});

// @route   POST /api/goals/:goalId/milestones/:milestoneId/contribute
// @desc    Add contribution to milestone
// @access  Private
router.post(
  "/:goalId/milestones/:milestoneId/contribute",
  protect,
  [body("amount").isFloat({ min: 0.01 })],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ success: false, errors: errors.array() });

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
        return res.status(404).json({ success: false, message: "Milestone not found" });
      }

      if (milestone.isCompleted) {
        return res
          .status(400)
          .json({ success: false, message: "Cannot contribute to completed milestones" });
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

      res.json({
        success: true,
        message: "Contribution added to milestone successfully",
        data: { milestone: updatedMilestone },
      });
    } catch (error) {
      console.error("Add milestone contribution error:", error);
      res
        .status(500)
        .json({
          success: false,
          message: "Server error while adding contribution to milestone",
        });
    }
  }
);

export default router;
