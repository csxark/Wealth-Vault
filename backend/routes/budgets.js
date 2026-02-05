import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, sql, desc, sum, gte, lte } from "drizzle-orm";
import db from "../config/db.js";
import { vaults, vaultMembers, expenses, categories, familySettings } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import { checkVaultAccess, isVaultOwner } from "../middleware/vaultAuth.js";
import { asyncHandler, ValidationError, NotFoundError, ForbiddenError } from "../middleware/errorHandler.js";

const router = express.Router();

/**
 * @swagger
 * /budgets/vault/:vaultId:
 *   get:
 *     summary: Get vault budget
 *     tags: [Budgets]
 */
router.get("/vault/:vaultId", protect, checkVaultAccess(), asyncHandler(async (req, res) => {
  const { vaultId } = req.params;
  const { period = 'monthly' } = req.query;

  // Get vault settings
  const [vaultSettings] = await db
    .select()
    .from(familySettings)
    .where(eq(familySettings.vaultId, vaultId));

  if (!vaultSettings) {
    throw new NotFoundError('Vault settings not found');
  }

  // Calculate date range based on period
  const now = new Date();
  let startDate, endDate;

  if (period === 'monthly') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (period === 'yearly') {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31);
  }

  // Get vault expenses for the period
  const vaultExpenses = await db
    .select({
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      amount: sql`sum(${expenses.amount})`,
      count: sql`count(*)`,
    })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(
      and(
        eq(expenses.vaultId, vaultId),
        eq(expenses.status, 'completed'),
        gte(expenses.date, startDate),
        lte(expenses.date, endDate)
      )
    )
    .groupBy(expenses.categoryId, categories.name, categories.color);

  // Calculate total spending
  const totalSpending = vaultExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  // Get vault members count for budget allocation
  const membersCount = await db
    .select({ count: sql`count(*)` })
    .from(vaultMembers)
    .where(eq(vaultMembers.vaultId, vaultId));

  const memberCount = Number(membersCount[0]?.count || 1);

  res.success({
    vaultId,
    period,
    totalBudget: Number(vaultSettings.monthlyBudget || 0),
    totalSpending,
    remainingBudget: Number(vaultSettings.monthlyBudget || 0) - totalSpending,
    memberCount,
    spendingByCategory: vaultExpenses.map(exp => ({
      categoryId: exp.categoryId,
      categoryName: exp.categoryName,
      categoryColor: exp.categoryColor,
      amount: Number(exp.amount),
      count: Number(exp.count),
    })),
  }, 'Vault budget retrieved successfully');
}));

/**
 * @swagger
 * /budgets/vault/:vaultId:
 *   put:
 *     summary: Update vault budget
 *     tags: [Budgets]
 */
router.put("/vault/:vaultId", protect, isVaultOwner, [
  body("monthlyBudget").optional().isFloat({ min: 0 }),
  body("defaultSplitMethod").optional().isIn(['equal', 'percentage', 'custom']),
  body("enableReimbursements").optional().isBoolean(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError("Validation failed", errors.array());
  }

  const { vaultId } = req.params;
  const { monthlyBudget, defaultSplitMethod, enableReimbursements } = req.body;

  // Update or create vault settings
  const updateData = {};
  if (monthlyBudget !== undefined) updateData.monthlyBudget = monthlyBudget.toString();
  if (defaultSplitMethod) updateData.defaultSplitMethod = defaultSplitMethod;
  if (enableReimbursements !== undefined) updateData.enableReimbursements = enableReimbursements;
  updateData.updatedAt = new Date();

  const [updatedSettings] = await db
    .update(familySettings)
    .set(updateData)
    .where(eq(familySettings.vaultId, vaultId))
    .returning();

  if (!updatedSettings) {
    throw new NotFoundError('Vault settings not found');
  }

  res.success(updatedSettings, 'Vault budget updated successfully');
}));

/**
 * @swagger
 * /budgets/vault/:vaultId/alerts:
 *   get:
 *     summary: Get vault budget alerts
 *     tags: [Budgets]
 */
router.get("/vault/:vaultId/alerts", protect, checkVaultAccess(), asyncHandler(async (req, res) => {
  const { vaultId } = req.params;

  // Get vault settings and current spending
  const [vaultSettings] = await db
    .select()
    .from(familySettings)
    .where(eq(familySettings.vaultId, vaultId));

  if (!vaultSettings || !vaultSettings.monthlyBudget) {
    return res.success([], 'No budget alerts');
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Calculate current month spending
  const [spendingResult] = await db
    .select({ total: sql`sum(${expenses.amount})` })
    .from(expenses)
    .where(
      and(
        eq(expenses.vaultId, vaultId),
        eq(expenses.status, 'completed'),
        gte(expenses.date, startOfMonth),
        lte(expenses.date, endOfMonth)
      )
    );

  const currentSpending = Number(spendingResult?.total || 0);
  const monthlyBudget = Number(vaultSettings.monthlyBudget);
  const percentage = (currentSpending / monthlyBudget) * 100;

  const alerts = [];

  if (percentage >= 100) {
    alerts.push({
      type: 'exceeded',
      message: `Vault budget exceeded by $${(currentSpending - monthlyBudget).toFixed(2)} (${percentage.toFixed(1)}%)`,
      severity: 'critical',
    });
  } else if (percentage >= 80) {
    alerts.push({
      type: 'warning',
      message: `Vault budget at ${percentage.toFixed(1)}% - approaching limit`,
      severity: 'warning',
    });
  }

  res.success(alerts, 'Vault budget alerts retrieved successfully');
}));

export default router;
