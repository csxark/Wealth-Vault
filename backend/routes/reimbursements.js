import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, sql, desc } from "drizzle-orm";
import db from "../config/db.js";
import { reimbursements, vaultMembers, users, expenses } from "../db/schema.js";
import { protect } from "../middleware/auth.js";
import { checkVaultAccess } from "../middleware/vaultAuth.js";
import { asyncHandler, ValidationError, NotFoundError, ForbiddenError } from "../middleware/errorHandler.js";
import notificationService from "../services/notificationService.js";

const router = express.Router();

/**
 * @swagger
 * /reimbursements:
 *   post:
 *     summary: Create a reimbursement request
 *     tags: [Reimbursements]
 */
router.post("/", protect, [
  body("vaultId").isUUID(),
  body("toUserId").isUUID(),
  body("amount").isFloat({ min: 0.01 }),
  body("description").trim().isLength({ min: 1, max: 200 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError("Validation failed", errors.array());
  }

  const { vaultId, toUserId, amount, description, expenseId, dueDate } = req.body;

  // Check vault access
  const [membership] = await db
    .select()
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, req.user.id)));

  if (!membership) {
    throw new ForbiddenError('Access denied to vault');
  }

  // Verify recipient is also a vault member
  const [recipientMembership] = await db
    .select()
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, toUserId)));

  if (!recipientMembership) {
    throw new ValidationError('Recipient is not a member of this vault');
  }

  // Verify expense belongs to vault if provided
  if (expenseId) {
    const [expense] = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.vaultId, vaultId)));

    if (!expense) {
      throw new NotFoundError('Expense not found in this vault');
    }
  }

  // Create reimbursement
  const [reimbursement] = await db
    .insert(reimbursements)
    .values({
      vaultId,
      fromUserId: req.user.id,
      toUserId,
      amount: amount.toString(),
      description,
      expenseId: expenseId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
    })
    .returning();

  // Notify recipient
  await notificationService.createNotification(toUserId, {
    type: 'reimbursement_requested',
    title: 'Reimbursement Requested',
    message: `${req.user.firstName} is requesting reimbursement of $${amount.toFixed(2)}`,
    data: { reimbursementId: reimbursement.id, amount, description },
  });

  res.status(201).json({
    success: true,
    message: 'Reimbursement request created successfully',
    data: { reimbursement },
  });
}));

/**
 * @swagger
 * /reimbursements/vault/:vaultId:
 *   get:
 *     summary: Get reimbursements for a vault
 *     tags: [Reimbursements]
 */
router.get("/vault/:vaultId", protect, checkVaultAccess(), asyncHandler(async (req, res) => {
  const { vaultId } = req.params;
  const { status = 'all', user = 'all' } = req.query; // status: all, pending, completed, cancelled; user: all, mine, others

  let whereConditions = [eq(reimbursements.vaultId, vaultId)];

  if (status !== 'all') {
    whereConditions.push(eq(reimbursements.status, status));
  }

  if (user === 'mine') {
    whereConditions.push(sql`${reimbursements.fromUserId} = ${req.user.id} OR ${reimbursements.toUserId} = ${req.user.id}`);
  }

  const reimbursementsList = await db
    .select({
      id: reimbursements.id,
      amount: reimbursements.amount,
      description: reimbursements.description,
      status: reimbursements.status,
      expenseId: reimbursements.expenseId,
      dueDate: reimbursements.dueDate,
      completedAt: reimbursements.completedAt,
      createdAt: reimbursements.createdAt,
      fromUser: {
        id: sql`from_user.id`,
        firstName: sql`from_user.first_name`,
        lastName: sql`from_user.last_name`,
      },
      toUser: {
        id: sql`to_user.id`,
        firstName: sql`to_user.first_name`,
        lastName: sql`to_user.last_name`,
      },
    })
    .from(reimbursements)
    .innerJoin(sql`users as from_user`, eq(reimbursements.fromUserId, sql`from_user.id`))
    .innerJoin(sql`users as to_user`, eq(reimbursements.toUserId, sql`to_user.id`))
    .where(and(...whereConditions))
    .orderBy(desc(reimbursements.createdAt));

  res.success(reimbursementsList, 'Reimbursements retrieved successfully');
}));

/**
 * @swagger
 * /reimbursements/:reimbursementId/complete:
 *   post:
 *     summary: Mark reimbursement as completed
 *     tags: [Reimbursements]
 */
router.post("/:reimbursementId/complete", protect, asyncHandler(async (req, res) => {
  const { reimbursementId } = req.params;

  // Get reimbursement details
  const [reimbursement] = await db
    .select()
    .from(reimbursements)
    .where(eq(reimbursements.id, reimbursementId));

  if (!reimbursement) {
    throw new NotFoundError('Reimbursement not found');
  }

  // Check vault access
  const [membership] = await db
    .select()
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, reimbursement.vaultId), eq(vaultMembers.userId, req.user.id)));

  if (!membership) {
    throw new ForbiddenError('Access denied to vault');
  }

  // Only the recipient can mark as completed
  if (reimbursement.toUserId !== req.user.id) {
    throw new ForbiddenError('Only the recipient can mark reimbursement as completed');
  }

  // Update reimbursement as completed
  const [updatedReimbursement] = await db
    .update(reimbursements)
    .set({
      status: 'completed',
      completedAt: new Date(),
    })
    .where(eq(reimbursements.id, reimbursementId))
    .returning();

  // Notify the requester
  await notificationService.createNotification(reimbursement.fromUserId, {
    type: 'reimbursement_completed',
    title: 'Reimbursement Completed',
    message: `Your reimbursement request of $${reimbursement.amount} has been marked as completed`,
    data: { reimbursementId },
  });

  res.success(updatedReimbursement, 'Reimbursement marked as completed successfully');
}));

/**
 * @swagger
 * /reimbursements/:reimbursementId/cancel:
 *   post:
 *     summary: Cancel a reimbursement request
 *     tags: [Reimbursements]
 */
router.post("/:reimbursementId/cancel", protect, asyncHandler(async (req, res) => {
  const { reimbursementId } = req.params;

  // Get reimbursement details
  const [reimbursement] = await db
    .select()
    .from(reimbursements)
    .where(eq(reimbursements.id, reimbursementId));

  if (!reimbursement) {
    throw new NotFoundError('Reimbursement not found');
  }

  // Check vault access
  const [membership] = await db
    .select()
    .from(vaultMembers)
    .where(and(eq(vaultMembers.vaultId, reimbursement.vaultId), eq(vaultMembers.userId, req.user.id)));

  if (!membership) {
    throw new ForbiddenError('Access denied to vault');
  }

  // Only the requester can cancel
  if (reimbursement.fromUserId !== req.user.id) {
    throw new ForbiddenError('Only the requester can cancel the reimbursement');
  }

  // Update reimbursement as cancelled
  const [updatedReimbursement] = await db
    .update(reimbursements)
    .set({
      status: 'cancelled',
    })
    .where(eq(reimbursements.id, reimbursementId))
    .returning();

  // Notify the recipient
  await notificationService.createNotification(reimbursement.toUserId, {
    type: 'reimbursement_cancelled',
    title: 'Reimbursement Cancelled',
    message: `The reimbursement request of $${reimbursement.amount} has been cancelled`,
    data: { reimbursementId },
  });

  res.success(updatedReimbursement, 'Reimbursement cancelled successfully');
}));

/**
 * @swagger
 * /reimbursements/vault/:vaultId/summary:
 *   get:
 *     summary: Get reimbursement summary for a vault
 *     tags: [Reimbursements]
 */
router.get("/vault/:vaultId/summary", protect, checkVaultAccess(), asyncHandler(async (req, res) => {
  const { vaultId } = req.params;

  // Get summary statistics
  const summary = await db
    .select({
      status: reimbursements.status,
      count: sql`count(*)`,
      totalAmount: sql`sum(${reimbursements.amount})`,
    })
    .from(reimbursements)
    .where(eq(reimbursements.vaultId, vaultId))
    .groupBy(reimbursements.status);

  // Get user's pending reimbursements (both owed and owing)
  const userReimbursements = await db
    .select({
      id: reimbursements.id,
      amount: reimbursements.amount,
      description: reimbursements.description,
      status: reimbursements.status,
      fromUserId: reimbursements.fromUserId,
      toUserId: reimbursements.toUserId,
      createdAt: reimbursements.createdAt,
    })
    .from(reimbursements)
    .where(
      and(
        eq(reimbursements.vaultId, vaultId),
        sql`${reimbursements.fromUserId} = ${req.user.id} OR ${reimbursements.toUserId} = ${req.user.id}`,
        eq(reimbursements.status, 'pending')
      )
    )
    .orderBy(desc(reimbursements.createdAt));

  // Calculate balances
  let totalOwed = 0;
  let totalOwing = 0;

  userReimbursements.forEach(reimbursement => {
    if (reimbursement.fromUserId === req.user.id) {
      // User is requesting reimbursement (owed to them)
      totalOwed += parseFloat(reimbursement.amount);
    } else {
      // User owes reimbursement
      totalOwing += parseFloat(reimbursement.amount);
    }
  });

  const summaryObj = {
    total: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
    totalAmount: 0,
    pendingAmount: 0,
    completedAmount: 0,
  };

  summary.forEach(row => {
    summaryObj[row.status] = Number(row.count);
    summaryObj.total += Number(row.count);
    summaryObj[`${row.status}Amount`] = Number(row.totalAmount);
    summaryObj.totalAmount += Number(row.totalAmount);
  });

  res.success({
    summary: summaryObj,
    userBalances: {
      totalOwed,
      totalOwing,
      netBalance: totalOwed - totalOwing,
    },
    pendingReimbursements: userReimbursements,
  }, 'Reimbursement summary retrieved successfully');
}));

export default router;
