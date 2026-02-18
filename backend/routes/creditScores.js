import express from 'express';
import { eq, and, desc, asc } from 'drizzle-orm';
import db from '../config/db.js';
import { creditScores, creditScoreAlerts } from '../db/schema.js';
import { authenticateToken } from '../middleware/auth.js';
import creditScoreService from '../services/creditScoreService.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from '../services/auditService.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/credit-scores
 * Get all credit scores for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      bureau,
      isActive,
      page = 1,
      limit = 20,
      sortBy = 'lastUpdated',
      sortOrder = 'desc'
    } = req.query;

    const offset = (page - 1) * limit;

    const filters = {
      bureau,
      isActive: isActive !== undefined ? isActive === 'true' : true,
      sortBy,
      sortOrder,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const scores = await creditScoreService.getCreditScores(userId, filters);

    // Get total count for pagination
    const conditions = [eq(creditScores.userId, userId)];
    if (bureau) conditions.push(eq(creditScores.bureau, bureau));
    if (isActive !== undefined) conditions.push(eq(creditScores.isActive, isActive === 'true'));

    const totalCount = await db
      .select({ count: sql`count(*)::int` })
      .from(creditScores)
      .where(and(...conditions));

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.CREDIT_SCORE_VIEW,
      resourceType: ResourceTypes.CREDIT_SCORE,
      metadata: { filters },
      status: "success",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      data: scores,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount[0]?.count || 0,
        totalPages: Math.ceil((totalCount[0]?.count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching credit scores:', error);
    res.status(500).json({ error: 'Failed to fetch credit scores' });
  }
});

/**
 * GET /api/credit-scores/latest
 * Get latest credit scores for all bureaus
 */
router.get('/latest', async (req, res) => {
  try {
    const userId = req.user.id;

    const latestScores = await creditScoreService.getLatestCreditScores(userId);

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.CREDIT_SCORE_VIEW,
      resourceType: ResourceTypes.CREDIT_SCORE,
      metadata: { type: 'latest' },
      status: "success",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      data: latestScores,
      count: latestScores.length
    });
  } catch (error) {
    console.error('Error fetching latest credit scores:', error);
    res.status(500).json({ error: 'Failed to fetch latest credit scores' });
  }
});

/**
 * GET /api/credit-scores/analytics
 * Get credit score analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const userId = req.user.id;

    const analytics = await creditScoreService.getCreditScoreAnalytics(userId);

    res.json({
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching credit score analytics:', error);
    res.status(500).json({ error: 'Failed to fetch credit score analytics' });
  }
});

/**
 * GET /api/credit-scores/:id
 * Get a specific credit score by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const score = await creditScoreService.getCreditScoreById(id, userId);

    if (!score) {
      return res.status(404).json({ error: 'Credit score not found' });
    }

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.CREDIT_SCORE_VIEW,
      resourceType: ResourceTypes.CREDIT_SCORE,
      resourceId: id,
      status: "success",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      data: score
    });
  } catch (error) {
    console.error('Error fetching credit score:', error);
    res.status(500).json({ error: 'Failed to fetch credit score' });
  }
});

/**
 * POST /api/credit-scores
 * Create a new credit score entry
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      bureau,
      score,
      accountNumber,
      reportDate,
      factors,
      metadata
    } = req.body;

    // Validate required fields
    if (!bureau || score === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: bureau and score are required'
      });
    }

    const newCreditScore = await creditScoreService.createCreditScore({
      userId,
      bureau,
      score,
      accountNumber,
      reportDate,
      factors,
      metadata
    });

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.CREDIT_SCORE_CREATE,
      resourceType: ResourceTypes.CREDIT_SCORE,
      resourceId: newCreditScore.id,
      metadata: {
        bureau,
        score,
        rating: newCreditScore.rating
      },
      status: "success",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.status(201).json({
      data: newCreditScore,
      message: 'Credit score created successfully'
    });
  } catch (error) {
    console.error('Error creating credit score:', error);
    
    // Log failed audit event
    await logAuditEventAsync({
      userId: req.user.id,
      action: AuditActions.CREDIT_SCORE_CREATE,
      resourceType: ResourceTypes.CREDIT_SCORE,
      metadata: { error: error.message },
      status: "failure",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.status(500).json({ error: error.message || 'Failed to create credit score' });
  }
});

/**
 * POST /api/credit-scores/simulate
 * Simulate fetching credit scores from bureaus (for testing/demo)
 */
router.post('/simulate', async (req, res) => {
  try {
    const userId = req.user.id;

    const simulatedScores = await creditScoreService.simulateBureauFetch(userId);

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.CREDIT_SCORE_CREATE,
      resourceType: ResourceTypes.CREDIT_SCORE,
      metadata: {
        type: 'simulation',
        bureaus: simulatedScores.map(s => s.bureau)
      },
      status: "success",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.status(201).json({
      data: simulatedScores,
      message: 'Simulated credit scores created successfully'
    });
  } catch (error) {
    console.error('Error simulating credit scores:', error);
    res.status(500).json({ error: 'Failed to simulate credit scores' });
  }
});

/**
 * PUT /api/credit-scores/:id
 * Update a credit score
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.userId;
    delete updates.createdAt;

    const updatedScore = await creditScoreService.updateCreditScore(id, userId, updates);

    if (!updatedScore) {
      return res.status(404).json({ error: 'Credit score not found' });
    }

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.CREDIT_SCORE_UPDATE,
      resourceType: ResourceTypes.CREDIT_SCORE,
      resourceId: id,
      metadata: { updates },
      status: "success",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      data: updatedScore,
      message: 'Credit score updated successfully'
    });
  } catch (error) {
    console.error('Error updating credit score:', error);
    res.status(500).json({ error: 'Failed to update credit score' });
  }
});

/**
 * DELETE /api/credit-scores/:id
 * Delete a credit score
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await creditScoreService.deleteCreditScore(id, userId);

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.CREDIT_SCORE_DELETE,
      resourceType: ResourceTypes.CREDIT_SCORE,
      resourceId: id,
      status: "success",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    res.json({
      message: 'Credit score deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting credit score:', error);
    res.status(500).json({ error: 'Failed to delete credit score' });
  }
});

/**
 * GET /api/credit-score-alerts
 * Get all credit score alerts for the authenticated user
 */
router.get('/alerts', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      isRead,
      alertType,
      bureau,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const offset = (page - 1) * limit;

    const filters = {
      isRead: isRead !== undefined ? isRead === 'true' : undefined,
      alertType,
      bureau,
      sortBy,
      sortOrder,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const alerts = await creditScoreService.getAlerts(userId, filters);

    // Get total count for pagination
    const conditions = [eq(creditScoreAlerts.userId, userId)];
    if (isRead !== undefined) conditions.push(eq(creditScoreAlerts.isRead, isRead === 'true'));
    if (alertType) conditions.push(eq(creditScoreAlerts.alertType, alertType));

    const totalCount = await db
      .select({ count: sql`count(*)::int` })
      .from(creditScoreAlerts)
      .where(and(...conditions));

    res.json({
      data: alerts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount[0]?.count || 0,
        totalPages: Math.ceil((totalCount[0]?.count || 0) / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching credit score alerts:', error);
    res.status(500).json({ error: 'Failed to fetch credit score alerts' });
  }
});

/**
 * GET /api/credit-score-alerts/unread-count
 * Get count of unread alerts
 */
router.get('/alerts/unread-count', async (req, res) => {
  try {
    const userId = req.user.id;

    const unreadAlerts = await db.query.creditScoreAlerts.findMany({
      where: and(
        eq(creditScoreAlerts.userId, userId),
        eq(creditScoreAlerts.isRead, false)
      )
    });

    res.json({
      count: unreadAlerts.length
    });
  } catch (error) {
    console.error('Error fetching unread alert count:', error);
    res.status(500).json({ error: 'Failed to fetch unread alert count' });
  }
});

/**
 * PUT /api/credit-score-alerts/:id/read
 * Mark a specific alert as read
 */
router.put('/alerts/:id/read', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const updatedAlert = await creditScoreService.markAlertAsRead(id, userId);

    if (!updatedAlert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json({
      data: updatedAlert,
      message: 'Alert marked as read'
    });
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({ error: 'Failed to mark alert as read' });
  }
});

/**
 * PUT /api/credit-score-alerts/mark-all-read
 * Mark all alerts as read
 */
router.put('/alerts/mark-all-read', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await creditScoreService.markAllAlertsAsRead(userId);

    res.json(result);
  } catch (error) {
    console.error('Error marking all alerts as read:', error);
    res.status(500).json({ error: 'Failed to mark all alerts as read' });
  }
});

/**
 * DELETE /api/credit-score-alerts/:id
 * Delete a credit score alert
 */
router.delete('/alerts/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await creditScoreService.deleteAlert(id, userId);

    res.json({
      message: 'Alert deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({ error: 'Failed to delete alert' });
  }
});

export default router;
