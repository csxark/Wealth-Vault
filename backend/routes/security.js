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

const router = express.Router();

/**
 * @route   GET /api/security/markers/pending
 * @desc    Get all pending security markers for current user
 * @access  Private
 */
router.get('/markers/pending', protect, async (req, res) => {
  try {
    const markers = await getPendingSecurityMarkers(req.user.id);

    res.json({
      success: true,
      data: markers,
      count: markers.length
    });
  } catch (error) {
    console.error('Error fetching pending security markers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch security markers',
      error: error.message
    });
  }
});

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
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
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

      res.json({
        success: true,
        data: markers,
        pagination: {
          total: Number(countResult?.count || 0),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      console.error('Error fetching security markers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch security markers',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/security/markers/:id
 * @desc    Get detailed information about a specific security marker
 * @access  Private
 */
router.get('/markers/:id', protect, param('id').isUUID(), async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
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
      return res.status(404).json({
        success: false,
        message: 'Security marker not found'
      });
    }

    res.json({
      success: true,
      data: marker
    });
  } catch (error) {
    console.error('Error fetching security marker:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch security marker',
      error: error.message
    });
  }
});

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
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
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
        return res.status(404).json({
          success: false,
          message: 'Security marker not found'
        });
      }

      if (existingMarker.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: `Marker already ${existingMarker.status}`
        });
      }

      // If MFA required, verify code (in production, implement actual MFA verification)
      if (existingMarker.requiresMFA && !req.body.mfaCode) {
        return res.status(400).json({
          success: false,
          message: 'MFA verification required',
          error: 'MFA_REQUIRED'
        });
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

      res.json({
        success: true,
        message: 'Security marker cleared successfully',
        data: updatedMarker
      });
    } catch (error) {
      console.error('Error clearing security marker:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear security marker',
        error: error.message
      });
    }
  }
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
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
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
        return res.status(404).json({
          success: false,
          message: 'Security marker not found'
        });
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

      res.json({
        success: true,
        message: 'Transaction blocked successfully',
        data: {
          marker: updatedMarker,
          dispute: dispute
        }
      });
    } catch (error) {
      console.error('Error blocking security marker:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to block transaction',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/security/statistics
 * @desc    Get security statistics for current user
 * @access  Private
 */
router.get('/statistics', protect, async (req, res) => {
  try {
    const stats = await getSecurityStatistics(req.user.id);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching security statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch security statistics',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/security/report
 * @desc    Generate AI-powered security report
 * @access  Private
 */
router.get('/report', protect, async (req, res) => {
  try {
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

    res.json({
      success: true,
      data: {
        report,
        statistics: stats
      }
    });
  } catch (error) {
    console.error('Error generating security report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate security report',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/security/disputes
 * @desc    Get all disputed transactions for current user
 * @access  Private
 */
router.get('/disputes', protect, async (req, res) => {
  try {
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

    res.json({
      success: true,
      data: disputes,
      count: disputes.length
    });
  } catch (error) {
    console.error('Error fetching disputes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch disputes',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/security/disputes
 * @desc    Create a new disputed transaction
 * @access  Private
 */
router.post(
  '/disputes',
  protect,  [
    body('expenseId').isUUID(),
    body('disputeType').isIn(['unauthorized', 'fraudulent', 'incorrect_amount', 'duplicate', 'other']),
    body('disputeReason').isString().isLength({ min: 10, max: 500 }),
    body('disputedAmount').optional().isNumeric()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
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
        return res.status(404).json({
          success: false,
          message: 'Expense not found'
        });
      }

      // Check if already disputed
      const existingDispute = await db.query.disputedTransactions.findFirst({
        where: and(
          eq(disputedTransactions.expenseId, req.body.expenseId),
          eq(disputedTransactions.userId, req.user.id)
        )
      });

      if (existingDispute) {
        return res.status(400).json({
          success: false,
          message: 'Transaction already under dispute'
        });
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

      res.status(201).json({
        success: true,
        message: 'Dispute created successfully',
        data: dispute
      });
    } catch (error) {
      console.error('Error creating dispute:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create dispute',
        error: error.message
      });
    }
  }
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
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
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
        return res.status(404).json({
          success: false,
          message: 'Dispute not found'
        });
      }

      res.json({
        success: true,
        message: 'Dispute updated successfully',
        data: updatedDispute
      });
    } catch (error) {
      console.error('Error updating dispute:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update dispute',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/security/dashboard
 * @desc    Get comprehensive security dashboard data
 * @access  Private
 */
router.get('/dashboard', protect, async (req, res) => {
  try {
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

    res.json({
      success: true,
      data: {
        statistics: stats,
        pendingMarkers: pendingMarkers.slice(0, 5),
        recentDisputes,
        summary: {
          requiresAttention: stats.pending + recentDisputes.length,
          criticalAlerts: stats.critical,
          overallStatus: stats.critical > 0 ? 'critical' : 
                        stats.pending > 3 ? 'warning' : 'good'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching security dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch security dashboard',
      error: error.message
    });
  }
});

export default router;
