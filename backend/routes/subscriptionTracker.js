import express from 'express';
import { z } from 'zod';
import subscriptionTrackerService from '../services/subscriptionTrackerService.js';
import subscriptionAnalyzerService from '../services/subscriptionAnalyzerService.js';
import subscriptionDetectionService from '../services/subscriptionDetectionService.js';
import subscriptionOptimizationService from '../services/subscriptionOptimizationService.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

/**
 * GET /api/subscription-tracker/dashboard
 * Get comprehensive subscription dashboard data
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const dashboard = await subscriptionTrackerService.getDashboard(userId);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/health-score
 * Get subscription health score
 */
router.get('/health-score', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const healthScore = await subscriptionTrackerService.getHealthScore(userId);
    res.json({ success: true, data: healthScore });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/calendar/:year/:month
 * Get subscription calendar for a specific month
 */
router.get('/calendar/:year/:month', async (req, res, next) => {
  try {
    const { year, month } = req.params;
    const userId = req.user.id;
    const calendar = await subscriptionTrackerService.getCalendar(
      userId,
      parseInt(year),
      parseInt(month)
    );
    res.json({ success: true, data: calendar });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/forecast
 * Get subscription forecast for upcoming months
 */
router.get('/forecast', async (req, res, next) => {
  try {
    const { months = 6 } = req.query;
    const userId = req.user.id;
    const forecast = await subscriptionTrackerService.getForecast(
      userId,
      parseInt(months)
    );
    res.json({ success: true, data: forecast });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/compare
 * Compare subscription spending across time periods
 */
router.get('/compare', async (req, res, next) => {
  try {
    const { period1Start, period1End, period2Start, period2End } = req.query;
    const userId = req.user.id;
    const comparison = await subscriptionTrackerService.comparePeriods(
      userId,
      period1Start,
      period1End,
      period2Start,
      period2End
    );
    res.json({ success: true, data: comparison });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/insights
 * Get subscription insights and trends
 */
router.get('/insights', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const insights = await subscriptionTrackerService.getInsights(userId);
    res.json({ success: true, data: insights });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/export
 * Export subscription data
 */
router.get('/export', async (req, res, next) => {
  try {
    const { format = 'json' } = req.query;
    const userId = req.user.id;
    const data = await subscriptionTrackerService.exportData(userId, format);
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=subscriptions.csv');
      res.send(data);
    } else {
      res.json({ success: true, data });
    }
  } catch (error) {
    next(error);
  }
});

// ============ Analyzer Routes ============

/**
 * GET /api/subscription-tracker/analyzer/spending-patterns
 * Analyze spending patterns over time
 */
router.get('/analyzer/spending-patterns', async (req, res, next) => {
  try {
    const { months = 6 } = req.query;
    const userId = req.user.id;
    const patterns = await subscriptionAnalyzerService.analyzeSpendingPatterns(
      userId,
      parseInt(months)
    );
    res.json({ success: true, data: patterns });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/analyzer/category-distribution
 * Analyze category distribution
 */
router.get('/analyzer/category-distribution', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const distribution = await subscriptionAnalyzerService.analyzeCategoryDistribution(userId);
    res.json({ success: true, data: distribution });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/analyzer/payment-methods
 * Analyze payment methods
 */
router.get('/analyzer/payment-methods', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const paymentMethods = await subscriptionAnalyzerService.analyzePaymentMethods(userId);
    res.json({ success: true, data: paymentMethods });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/analyzer/unusual-patterns
 * Detect unusual spending patterns
 */
router.get('/analyzer/unusual-patterns', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const anomalies = await subscriptionAnalyzerService.detectUnusualPatterns(userId);
    res.json({ success: true, data: anomalies });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/analyzer/report
 * Generate comprehensive analysis report
 */
router.get('/analyzer/report', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const report = await subscriptionAnalyzerService.generateReport(userId);
    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

// ============ Detection Routes ============

/**
 * GET /api/subscription-tracker/detect
 * Detect potential subscriptions from expenses
 */
router.get('/detect', async (req, res, next) => {
  try {
    const { months = 6 } = req.query;
    const userId = req.user.id;
    const detections = await subscriptionDetectionService.detectPotentialSubscriptions(
      userId,
      parseInt(months)
    );
    res.json({ success: true, data: detections });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/detection-stats
 * Get detection statistics
 */
router.get('/detection-stats', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const stats = await subscriptionDetectionService.getDetectionStats(userId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/subscription-tracker/create-from-detection
 * Create subscription from detection
 */
const createFromDetectionSchema = z.object({
  serviceName: z.string().min(1),
  averageAmount: z.number().positive(),
  suggestedFrequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  categoryId: z.string().uuid().optional(),
  expenseIds: z.array(z.string().uuid()).optional(),
  confidence: z.number().min(0).max(1).optional()
});

router.post('/create-from-detection', async (req, res, next) => {
  try {
    const data = createFromDetectionSchema.parse(req.body);
    const userId = req.user.id;
    const subscription = await subscriptionDetectionService.createFromDetection(userId, data);
    res.status(201).json({ success: true, data: subscription });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors
      });
    }
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/recommendations
 * Get subscription recommendations
 */
router.get('/recommendations', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const recommendations = await subscriptionDetectionService.getRecommendations(userId);
    res.json({ success: true, data: recommendations });
  } catch (error) {
    next(error);
  }
});

// ============ Optimization Routes ============

/**
 * GET /api/subscription-tracker/optimization/recommendations
 * Get cost optimization recommendations
 */
router.get('/optimization/recommendations', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const recommendations = await subscriptionOptimizationService.getOptimizationRecommendations(userId);
    res.json({ success: true, data: recommendations });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/optimization/trends
 * Get subscription spending trends
 */
router.get('/optimization/trends', async (req, res, next) => {
  try {
    const { months = 6 } = req.query;
    const userId = req.user.id;
    const trends = await subscriptionOptimizationService.getSubscriptionTrends(
      userId,
      parseInt(months)
    );
    res.json({ success: true, data: trends });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/subscription-tracker/optimization/savings-summary
 * Get potential savings summary
 */
router.get('/optimization/savings-summary', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const summary = await subscriptionOptimizationService.getPotentialSavingsSummary(userId);
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

export default router;
