/**
 * Security Routes
 * Endpoints for reviewing and managing security markers and disputed transactions
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import { query, param, body, validationResult } from 'express-validator';
import {
  getPendingSecurityMarkers,
  clearSecurityMarker,
  getSecurityStatistics
} from '../services/anomalyDetection.js';
import { generateSecurityReport } from '../services/securityAI.js';
import { db } from '../config/db.js';
import { securityMarkers, disputedTransactions, expenses } from '../db/schema.js';
import { eq, and, desc, gte, sql } from 'drizzle-orm';
import { sendAnomalyDetectionAlert, sendScamDetectionAlert } from '../services/emailService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/AppError.js';
import { ApiResponse } from '../utils/ApiResponse.js';

const router = express.Router();

/**
 * @route   GET /api/security/markers/pending
 * @desc    Get all pending security markers for current user
 * @access  Private
 */
router.get('/markers/pending', protect, asyncHandler(async (req, res, next) => {
  const markers = await getPendingSecurityMarkers(req.user.id);
  return new ApiResponse(200, markers, 'Pending security markers retrieved successfully').send(res);
}));

/**
 * @route   GET /api/security/markers
 * @desc    Get all security markers with filters
 * @access  Private
 */
router.get(
  '/markers',
  protect,
  [
    query('status').optional().isString(),
    query('severity').optional().isString(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const { status, severity, limit = 20, offset = 0 } = req.query;

    const conditions = [eq(securityMarkers.userId, req.user.id)];
    if (status) conditions.push(eq(securityMarkers.status, status));
    if (severity) conditions.push(eq(securityMarkers.severity, severity));

    const markers = await db.query.securityMarkers.findMany({
      where: and(...conditions),
      with: {
        expense: {
          with: {
            category: {
              columns: { name: true, icon: true, color: true }
            }
          }
        }
      },
      orderBy: [desc(securityMarkers.createdAt)],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const [countResult] = await db
      .select({ count: sql`count(*)` })
      .from(securityMarkers)
      .where(and(...conditions));

    return new ApiResponse(200, {
      markers,
      pagination: {
        total: Number(countResult?.count || 0),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    }, 'Security markers retrieved successfully').send(res);
  })
);

/**
 * @route   GET /api/security/markers/:id
 * @desc    Get detailed information about a specific security marker
 * @access  Private
 */
router.get('/markers/:id', protect, param('id').isUUID(), asyncHandler(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(400, "Validation failed", errors.array()));
  }

  const marker = await db.query.securityMarkers.findFirst({
    where: and(
      eq(securityMarkers.id, req.params.id),
      eq(securityMarkers.userId, req.user.id)
    ),
    with: {
      expense: {
        with: {
          category: {
            columns: { name: true, icon: true, color: true }
          }
        }
      }
    }
  });

  if (!marker) {
    return next(new AppError(404, 'Security marker not found'));
  }

  return new ApiResponse(200, marker, 'Security marker retrieved successfully').send(res);
}));

/**
 * @route   POST /api/security/markers/:id/clear
 * @desc    Clear a security marker (mark as safe/verified)
 * @access  Private
 */
router.post(
  '/markers/:id/clear',
  protect,
  [
    param('id').isUUID(),
    body('mfaCode').optional().isString(),
    body('notes').optional().isString()
  ],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    // Verify marker belongs to user
    const [existingMarker] = await db
      .select()
      .from(securityMarkers)
      .where(
        and(
          eq(securityMarkers.id, req.params.id),
          eq(securityMarkers.userId, req.user.id)
        )
      );

    if (!existingMarker) {
      return next(new AppError(404, 'Security marker not found'));
    }

    if (existingMarker.status !== 'pending') {
      return next(new AppError(400, `Marker already ${existingMarker.status}`));
    }

    // If MFA required, verify code
    if (existingMarker.requiresMFA && !req.body.mfaCode) {
      return next(new AppError(400, 'MFA verification required', [{ code: 'MFA_REQUIRED' }]));
    }

    // Clear the marker
    const [updatedMarker] = await db
      .update(securityMarkers)
      .set({
        status: 'cleared',
        mfaVerifiedAt: existingMarker.requiresMFA ? new Date() : null,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        reviewNotes: req.body.notes || null,
        updatedAt: new Date()
      })
      .where(eq(securityMarkers.id, req.params.id))
      .returning();

    // Update expense status if it was blocked
    if (existingMarker.expenseId) {
      await db
        .update(expenses)
        .set({
          status: 'completed',
          updatedAt: new Date()
        })
        .where(eq(expenses.id, existingMarker.expenseId));
    }

    return new ApiResponse(200, updatedMarker, 'Security marker cleared successfully').send(res);
  })
);

/**
 * @route   POST /api/security/markers/:id/block
 * @desc    Block a security marker (confirm as fraudulent)
 * @access  Private
 */
router.post(
  '/markers/:id/block',
  protect,
  [
    param('id').isUUID(),
    body('reason').isString(),
    body('createDispute').optional().isBoolean()
  ],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    // Verify marker belongs to user
    const [existingMarker] = await db
      .select()
      .from(securityMarkers)
      .where(
        and(
          eq(securityMarkers.id, req.params.id),
          eq(securityMarkers.userId, req.user.id)
        )
      );

    if (!existingMarker) {
      return next(new AppError(404, 'Security marker not found'));
    }

    // Block the marker
    const [updatedMarker] = await db
      .update(securityMarkers)
      .set({
        status: 'blocked',
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
        reviewNotes: req.body.reason,
        updatedAt: new Date()
      })
      .where(eq(securityMarkers.id, req.params.id))
      .returning();

    // Update expense status
    if (existingMarker.expenseId) {
      await db
        .update(expenses)
        .set({
          status: 'suspicious',
          updatedAt: new Date()
        })
        .where(eq(expenses.id, existingMarker.expenseId));
    }

    // Create dispute if requested
    let dispute = null;
    if (req.body.createDispute && existingMarker.expenseId) {
      const [expense] = await db
        .select()
        .from(expenses)
        .where(eq(expenses.id, existingMarker.expenseId));

      if (expense) {
        [dispute] = await db
          .insert(disputedTransactions)
          .values({
            userId: req.user.id,
            expenseId: existingMarker.expenseId,
            securityMarkerId: existingMarker.id,
            disputeType: 'unauthorized',
            disputeReason: req.body.reason,
            disputeStatus: 'open',
            originalAmount: expense.amount,
            isBlocked: true
          })
          .returning();
      }
    }

    return new ApiResponse(200, {
      marker: updatedMarker,
      dispute: dispute
    }, 'Transaction blocked successfully').send(res);
  })
);

/**
 * @route   GET /api/security/statistics
 * @desc    Get security statistics for current user
 * @access  Private
 */
router.get('/statistics', protect, asyncHandler(async (req, res, next) => {
  const stats = await getSecurityStatistics(req.user.id);
  return new ApiResponse(200, stats, 'Security statistics retrieved successfully').send(res);
}));

/**
 * @route   GET /api/security/report
 * @desc    Generate AI-powered security report
 * @access  Private
 */
router.get('/report', protect, asyncHandler(async (req, res, next) => {
  // Get recent security markers
  const recentMarkers = await db.query.securityMarkers.findMany({
    where: eq(securityMarkers.userId, req.user.id),
    orderBy: [desc(securityMarkers.createdAt)],
    limit: 10
  });

  // Get statistics
  const stats = await getSecurityStatistics(req.user.id);

  // Generate AI report
  const report = await generateSecurityReport({
    userId: req.user.id,
    recentMarkers,
    suspiciousCount: stats.total,
    spendingPattern: { /* Could include spending baseline here */ }
  });

  return new ApiResponse(200, {
    report,
    statistics: stats
  }, 'Security report generated successfully').send(res);
}));

/**
 * @route   GET /api/security/disputes
 * @desc    Get all disputed transactions for current user
 * @access  Private
 */
router.get('/disputes', protect, asyncHandler(async (req, res, next) => {
  const disputes = await db.query.disputedTransactions.findMany({
    where: eq(disputedTransactions.userId, req.user.id),
    with: {
      expense: {
        with: {
          category: {
            columns: { name: true, icon: true, color: true }
          }
        }
      },
      securityMarker: true
    },
    orderBy: [desc(disputedTransactions.createdAt)]
  });

  return new ApiResponse(200, disputes, 'Disputed transactions retrieved successfully').send(res);
}));

/**
 * @route   POST /api/security/disputes
 * @desc    Create a new disputed transaction
 * @access  Private
 */
router.post(
  '/disputes',
  protect, [
  body('expenseId').isUUID(),
  body('disputeType').isIn(['unauthorized', 'fraudulent', 'incorrect_amount', 'duplicate', 'other']),
  body('disputeReason').isString().isLength({ min: 10, max: 500 }),
  body('disputedAmount').optional().isNumeric()
],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    // Verify expense belongs to user
    const [expense] = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.id, req.body.expenseId),
          eq(expenses.userId, req.user.id)
        )
      );

    if (!expense) {
      return next(new AppError(404, 'Expense not found'));
    }

    // Check if already disputed
    const existingDispute = await db.query.disputedTransactions.findFirst({
      where: and(
        eq(disputedTransactions.expenseId, req.body.expenseId),
        eq(disputedTransactions.userId, req.user.id)
      )
    });

    if (existingDispute) {
      return next(new AppError(400, 'Transaction already under dispute'));
    }

    // Create dispute
    const [dispute] = await db
      .insert(disputedTransactions)
      .values({
        userId: req.user.id,
        expenseId: req.body.expenseId,
        disputeType: req.body.disputeType,
        disputeReason: req.body.disputeReason,
        originalAmount: expense.amount,
        disputedAmount: req.body.disputedAmount || expense.amount,
        isBlocked: true
      })
      .returning();

    // Update expense status
    await db
      .update(expenses)
      .set({
        status: 'disputed',
        updatedAt: new Date()
      })
      .where(eq(expenses.id, req.body.expenseId));

    return new ApiResponse(201, dispute, 'Dispute created successfully').send(res);
  })
);

/**
 * @route   PUT /api/security/disputes/:id
 * @desc    Update dispute status
 * @access  Private
 */
router.put(
  '/disputes/:id',
  protect,
  [
    param('id').isUUID(),
    body('disputeStatus').optional().isIn(['open', 'investigating', 'resolved', 'rejected', 'closed']),
    body('notes').optional().isString()
  ],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const updateData = {};
    if (req.body.disputeStatus) {
      updateData.disputeStatus = req.body.disputeStatus;

      if (req.body.disputeStatus === 'resolved') {
        updateData.resolvedAt = new Date();
        updateData.isBlocked = false;
      }
    }

    if (req.body.notes) {
      // Append to communication log
      const [existing] = await db
        .select({ communicationLog: disputedTransactions.communicationLog })
        .from(disputedTransactions)
        .where(eq(disputedTransactions.id, req.params.id));

      const log = existing?.communicationLog || [];
      log.push({
        timestamp: new Date().toISOString(),
        userId: req.user.id,
        note: req.body.notes
      });

      updateData.communicationLog = log;
    }

    updateData.updatedAt = new Date();

    const [updatedDispute] = await db
      .update(disputedTransactions)
      .set(updateData)
      .where(
        and(
          eq(disputedTransactions.id, req.params.id),
          eq(disputedTransactions.userId, req.user.id)
        )
      )
      .returning();

    if (!updatedDispute) {
      return next(new AppError(404, 'Dispute not found'));
    }

    return new ApiResponse(200, updatedDispute, 'Dispute updated successfully').send(res);
  })
);

/**
 * @route   GET /api/security/dashboard
 * @desc    Get comprehensive security dashboard data
 * @access  Private
 */
router.get('/dashboard', protect, asyncHandler(async (req, res, next) => {
  const [stats, pendingMarkers, recentDisputes] = await Promise.all([
    getSecurityStatistics(req.user.id),
    getPendingSecurityMarkers(req.user.id),
    db.query.disputedTransactions.findMany({
      where: and(
        eq(disputedTransactions.userId, req.user.id),
        eq(disputedTransactions.disputeStatus, 'open')
      ),
      limit: 5
    })
  ]);

  return new ApiResponse(200, {
    statistics: stats,
    pendingMarkers: pendingMarkers.slice(0, 5),
    recentDisputes,
    summary: {
      requiresAttention: stats.pending + recentDisputes.length,
      criticalAlerts: stats.critical,
      overallStatus: stats.critical > 0 ? 'critical' :
        stats.pending > 3 ? 'warning' : 'good'
    }
  }, 'Security dashboard retrieved successfully').send(res);
}));

export default router;
