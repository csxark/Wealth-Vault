import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, sql, desc } from "drizzle-orm";
import db from "../config/db.js";
import { expenseShares, expenses, vaultMembers, reimbursements, users } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import { checkVaultAccess } from "../middleware/vaultAuth.js";
import { asyncHandler, ValidationError, NotFoundError, ForbiddenError } from "../middleware/errorHandler.js";
import notificationService from "../services/notificationService.js";

const router = express.Router();

/**
 * @swagger
 * /expense-shares:
 *   post:
 *     summary: Create expense shares for a vault expense
 *     tags: [Expense Shares]
 */
router.post("/", protect, [
  body("expenseId").isUUID(),
  body("shares").isArray({ min: 1 }),
  body("shares.*.userId").isUUID(),
  body("shares.*.shareAmount").isFloat({ min: 0.01 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError("Validation failed", errors.array());
  }

  const { expenseId, shares } = req.body;

  // Verify expense exists and belongs to a vault
  const [expense] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), sql`${expenses.vaultId} IS NOT NULL`));

  if (!expense) {
    throw new NotFoundError('Expense not found or not a vault expense');
  }

  // Check vault access
  const [membership] = await db
    .select()
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, expense.vaultId), eq(vaultMembers.userId, req.user.id)));

  if (!membership) {
    throw new ForbiddenError('Access denied to vault');
  }

  // Validate total shares match expense amount
  const totalShares = shares.reduce((sum, share) => sum + parseFloat(share.shareAmount), 0);
  const expenseAmount = parseFloat(expense.amount);

  if (Math.abs(totalShares - expenseAmount) > 0.01) { // Allow small rounding differences
    throw new ValidationError('Total shares must equal expense amount');
  }

  // Create expense shares
  const shareInserts = shares.map(share => ({
    expenseId,
    vaultId: expense.vaultId,
    userId: share.userId,
    shareAmount: share.shareAmount.toString(),
    sharePercentage: ((parseFloat(share.shareAmount) / expenseAmount) * 100),
  }));

  const createdShares = await db
    .insert(expenseShares)
    .values(shareInserts)
    .returning();

  // Notify other family members
  const otherMembers = shares.filter(share => share.userId !== req.user.id);
  for (const member of otherMembers) {
    await notificationService.createNotification(member.userId, {
      type: 'expense_shared',
      title: 'Expense Shared',
      message: `An expense of $${expenseAmount.toFixed(2)} has been shared with you`,
      data: { expenseId, shareAmount: member.shareAmount },
    });
  }

  res.status(201).json({
    success: true,
    message: 'Expense shares created successfully',
    data: { shares: createdShares },
  });
}));

/**
 * @swagger
 * /expense-shares/expense/:expenseId:
 *   get:
 *     summary: Get shares for a specific expense
 *     tags: [Expense Shares]
 */
router.get("/expense/:expenseId", protect, asyncHandler(async (req, res) => {
  const { expenseId } = req.params;

  // Verify expense exists and user has access
  const [expense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, expenseId));

  if (!expense) {
    throw new NotFoundError('Expense not found');
  }

  // Check vault access if it's a vault expense
  if (expense.vaultId) {
    const [membership] = await db
      .select()
      .from(vaultMembers)
      .where(and(eq(vaultMembers.vaultId, expense.vaultId), eq(vaultMembers.userId, req.user.id)));

    if (!membership) {
      throw new ForbiddenError('Access denied to vault');
    }
  } else if (expense.userId !== req.user.id) {
    throw new ForbiddenError('Access denied to expense');
  }

  // Get shares with user details
  const shares = await db
    .select({
      id: expenseShares.id,
      userId: expenseShares.userId,
      shareAmount: expenseShares.shareAmount,
      sharePercentage: expenseShares.sharePercentage,
      isPaid: expenseShares.isPaid,
      paidAt: expenseShares.paidAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(expenseShares)
    .innerJoin(users, eq(expenseShares.userId, users.id))
    .where(eq(expenseShares.expenseId, expenseId));

  res.success(shares, 'Expense shares retrieved successfully');
}));

/**
 * @swagger
 * /expense-shares/:shareId/pay:
 *   post:
 *     summary: Mark a share as paid
 *     tags: [Expense Shares]
 */
router.post("/:shareId/pay", protect, asyncHandler(async (req, res) => {
  const { shareId } = req.params;

  // Get share details
  const [share] = await db
    .select()
    .from(expenseShares)
    .where(eq(expenseShares.id, shareId));

  if (!share) {
    throw new NotFoundError('Expense share not found');
  }

  // Check vault access
  const [membership] = await db
    .select()
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, share.vaultId), eq(vaultMembers.userId, req.user.id)));

  if (!membership) {
    throw new ForbiddenError('Access denied to vault');
  }

  // Only the person who owes can mark as paid, or vault owner
  if (share.userId !== req.user.id && membership.role !== 'owner') {
    throw new ForbiddenError('Only the share owner or vault owner can mark as paid');
  }

  // Update share as paid
  const [updatedShare] = await db
    .update(expenseShares)
    .set({
      isPaid: true,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(expenseShares.id, shareId))
    .returning();

  // Notify the person who paid the original expense
  const [originalExpense] = await db
    .select()
    .from(expenses)
    .where(eq(expenses.id, share.expenseId));

  if (originalExpense && originalExpense.userId !== req.user.id) {
    await notificationService.createNotification(originalExpense.userId, {
      type: 'share_paid',
      title: 'Share Payment Received',
      message: `$${share.shareAmount} payment received for shared expense`,
      data: { shareId, expenseId: share.expenseId },
    });
  }

  res.success(updatedShare, 'Share marked as paid successfully');
}));

/**
 * @swagger
 * /expense-shares/vault/:vaultId:
 *   get:
 *     summary: Get all expense shares for a vault
 *     tags: [Expense Shares]
 */
router.get("/vault/:vaultId", protect, checkVaultAccess(), asyncHandler(async (req, res) => {
  const { vaultId } = req.params;
  const { status = 'all' } = req.query; // all, paid, unpaid

  let whereConditions = [eq(expenseShares.vaultId, vaultId)];

  if (status === 'paid') {
    whereConditions.push(eq(expenseShares.isPaid, true));
  } else if (status === 'unpaid') {
    whereConditions.push(eq(expenseShares.isPaid, false));
  }

  const shares = await db
    .select({
      id: expenseShares.id,
      expenseId: expenseShares.expenseId,
      userId: expenseShares.userId,
      shareAmount: expenseShares.shareAmount,
      sharePercentage: expenseShares.sharePercentage,
      isPaid: expenseShares.isPaid,
      paidAt: expenseShares.paidAt,
      createdAt: expenseShares.createdAt,
      expense: {
        id: expenses.id,
        description: expenses.description,
        amount: expenses.amount,
        date: expenses.date,
        categoryId: expenses.categoryId,
      },
      user: {
        firstName: users.firstName,
        lastName: users.lastName,
      },
    })
    .from(expenseShares)
    .innerJoin(expenses, eq(expenseShares.expenseId, expenses.id))
    .innerJoin(users, eq(expenseShares.userId, users.id))
    .where(and(...whereConditions))
    .orderBy(desc(expenseShares.createdAt));

  res.success(shares, 'Vault expense shares retrieved successfully');
}));

export default router;
