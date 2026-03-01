import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import investmentService from '../services/investmentService.js';
import portfolioService from '../services/portfolioService.js';
import priceService from '../services/priceService.js';
import investmentAnalyticsService from '../services/investmentAnalyticsService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../utils/AppError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { riskInterceptor } from '../middleware/riskInterceptor.js';
import { securityInterceptor } from '../middleware/auditMiddleware.js';

const router = express.Router();

// Apply authentication to all routes
router.use(protect);

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(400, 'Validation failed', errors.array()));
  }
  next();
};

// Investment CRUD Routes

/**
 * @route GET /api/investments
 */
router.get('/', [
  query('portfolioId').optional().isUUID(),
  query('type').optional().isIn(['stock', 'etf', 'mutual_fund', 'bond', 'crypto']),
  query('isActive').optional().isBoolean(),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const { portfolioId, type, isActive } = req.query;
  const filters = {};

  if (portfolioId) filters.portfolioId = portfolioId;
  if (type) filters.type = type;
  if (isActive !== undefined) filters.isActive = isActive === 'true';

  const investments = await investmentService.getInvestments(req.user.id, filters);
  return new ApiResponse(200, investments, 'Investments retrieved successfully').send(res);
}));

/**
 * @route GET /api/investments/:id
 */
router.get('/:id', [
  param('id').isUUID(),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const investment = await investmentService.getInvestmentById(req.params.id, req.user.id);
  if (!investment) throw new AppError('Investment not found', 404);
  return new ApiResponse(200, investment, 'Investment retrieved successfully').send(res);
}));

/**
 * @route POST /api/investments
 */
router.post('/', [
  body('portfolioId').isUUID(),
  body('symbol').isLength({ min: 1, max: 10 }).trim(),
  body('name').isLength({ min: 1, max: 100 }).trim(),
  body('type').isIn(['stock', 'etf', 'mutual_fund', 'bond', 'crypto']),
  body('quantity').isFloat({ min: 0 }),
  body('averageCost').isFloat({ min: 0 }),
  body('currency').optional().isLength({ min: 3, max: 3 }),
  handleValidationErrors,
  riskInterceptor,
  securityInterceptor(),
], asyncHandler(async (req, res) => {
  const investmentData = {
    portfolioId: req.body.portfolioId,
    symbol: req.body.symbol.toUpperCase(),
    name: req.body.name,
    type: req.body.type,
    assetClass: req.body.assetClass || 'equity',
    sector: req.body.sector,
    country: req.body.country || 'US',
    currency: req.body.currency || 'USD',
    quantity: req.body.quantity.toString(),
    averageCost: req.body.averageCost.toString(),
    tags: req.body.tags || [],
    notes: req.body.notes,
  };

  const investment = await investmentService.createInvestment(investmentData, req.user.id);
  return new ApiResponse(201, investment, 'Investment created successfully').send(res);
}));

/**
 * @route PUT /api/investments/:id
 */
router.put('/:id', [
  param('id').isUUID(),
  body('name').optional().isLength({ min: 1, max: 100 }).trim(),
  body('type').optional().isIn(['stock', 'etf', 'mutual_fund', 'bond', 'crypto']),
  handleValidationErrors,
  securityInterceptor(),
], asyncHandler(async (req, res) => {
  const updateData = {};
  const allowedFields = ['name', 'type', 'assetClass', 'sector', 'country', 'tags', 'notes', 'isActive'];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  const investment = await investmentService.updateInvestment(req.params.id, updateData, req.user.id);
  if (!investment) throw new AppError('Investment not found', 404);
  return new ApiResponse(200, investment, 'Investment updated successfully').send(res);
}));

/**
 * @route DELETE /api/investments/:id
 */
router.delete('/:id', [
  param('id').isUUID(),
  handleValidationErrors,
  securityInterceptor(),
], asyncHandler(async (req, res) => {
  const success = await investmentService.deleteInvestment(req.params.id, req.user.id);
  if (!success) throw new AppError('Investment not found or access denied', 404);
  return new ApiResponse(200, null, 'Investment deleted successfully').send(res);
}));

// Transaction Routes

/**
 * @route POST /api/investments/:id/transactions
 */
router.post('/:id/transactions', [
  param('id').isUUID(),
  body('type').isIn(['buy', 'sell', 'dividend', 'split', 'fee']),
  body('quantity').isFloat({ min: 0 }),
  body('price').isFloat({ min: 0 }),
  handleValidationErrors,
  riskInterceptor,
], asyncHandler(async (req, res) => {
  const transactionData = {
    type: req.body.type,
    quantity: req.body.quantity.toString(),
    price: req.body.price.toString(),
    totalAmount: (req.body.quantity * req.body.price).toString(),
    fees: req.body.fees?.toString() || '0',
    currency: req.body.currency || 'USD',
    date: req.body.date ? new Date(req.body.date) : new Date(),
    broker: req.body.broker,
    orderId: req.body.orderId,
    notes: req.body.notes,
  };

  const transaction = await investmentService.addInvestmentTransaction(req.params.id, transactionData, req.user.id);
  return new ApiResponse(201, transaction, 'Transaction added successfully').send(res);
}));

/**
 * @route GET /api/investments/:id/transactions
 */
router.get('/:id/transactions', [
  param('id').isUUID(),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const transactions = await investmentService.getInvestmentTransactions(req.params.id, req.user.id);
  return new ApiResponse(200, transactions, 'Transactions retrieved successfully').send(res);
}));

// Portfolio Routes

/**
 * @route GET /api/investments/portfolios
 */
router.get('/portfolios', asyncHandler(async (req, res) => {
  const portfolios = await portfolioService.getPortfolios(req.user.id);
  return new ApiResponse(200, portfolios, 'Portfolios retrieved successfully').send(res);
}));

/**
 * @route POST /api/investments/portfolios
 */
router.post('/portfolios', [
  body('name').isLength({ min: 1, max: 100 }).trim(),
  body('currency').optional().isLength({ min: 3, max: 3 }),
  body('riskTolerance').optional().isIn(['conservative', 'moderate', 'aggressive']),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const portfolioData = {
    name: req.body.name,
    description: req.body.description,
    currency: req.body.currency || 'USD',
    riskTolerance: req.body.riskTolerance || 'moderate',
    investmentStrategy: req.body.investmentStrategy,
    targetAllocation: req.body.targetAllocation || {},
  };

  const portfolio = await portfolioService.createPortfolio(portfolioData, req.user.id);
  return new ApiResponse(201, portfolio, 'Portfolio created successfully').send(res);
}));

/**
 * @route GET /api/investments/portfolios/:id/summary
 */
router.get('/portfolios/:id/summary', [
  param('id').isUUID(),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const summary = await portfolioService.getPortfolioSummary(req.params.id, req.user.id);
  if (!summary) throw new AppError('Portfolio not found', 404);
  return new ApiResponse(200, summary, 'Portfolio summary retrieved successfully').send(res);
}));

/**
 * @route POST /api/investments/portfolios/:id/update-prices
 */
router.post('/portfolios/:id/update-prices', [
  param('id').isUUID(),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const result = await priceService.updatePortfolioPrices(req.params.id, req.user.id);
  return new ApiResponse(200, result, 'Price update completed').send(res);
}));

/**
 * @route GET /api/investments/:id/price-history
 */
router.get('/:id/price-history', [
  param('id').isUUID(),
  query('days').optional().isInt({ min: 1, max: 365 }),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const history = await priceService.getPriceHistory(req.params.id, days);
  return new ApiResponse(200, history, 'Price history retrieved successfully').send(res);
}));

/**
 * @route GET /api/investments/:id/analytics
 */
router.get('/:id/analytics', [
  param('id').isUUID(),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const analytics = await investmentAnalyticsService.calculateInvestmentPerformance(req.params.id, req.user.id);
  if (!analytics) throw new AppError('Investment not found', 404);
  return new ApiResponse(200, analytics, 'Investment analytics retrieved successfully').send(res);
}));

/**
 * @route GET /api/investments/portfolios/:id/analytics
 */
router.get('/portfolios/:id/analytics', [
  param('id').isUUID(),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const analytics = await investmentAnalyticsService.calculatePortfolioPerformance(req.params.id, req.user.id);
  if (!analytics) throw new AppError('Portfolio not found', 404);
  return new ApiResponse(200, analytics, 'Portfolio analytics retrieved successfully').send(res);
}));

/**
 * @route POST /api/investments/portfolios/:id/optimize
 */
router.post('/portfolios/:id/optimize', [
  param('id').isUUID(),
  body('riskTolerance').optional().isIn(['conservative', 'moderate', 'aggressive']),
  handleValidationErrors,
], asyncHandler(async (req, res) => {
  const optimizationParams = {
    riskTolerance: req.body.riskTolerance || 'moderate',
    targetReturn: req.body.targetReturn,
    constraints: req.body.constraints || {},
  };

  const optimizationResult = await portfolioService.optimizePortfolio(req.params.id, req.user.id, optimizationParams);
  return new ApiResponse(200, optimizationResult, 'Portfolio optimization completed').send(res);
}));

/**
 * @route GET /api/investments/portfolios/:id/rebalancing/alerts
 * @desc Get rebalancing alerts for a portfolio
 * @access Private
 */
router.get('/portfolios/:id/rebalancing/alerts', [
  param('id').isUUID(),
  query('threshold').optional().isFloat({ min: 0, max: 100 }),
  query('includeResolved').optional().isBoolean(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const threshold = parseFloat(req.query.threshold) || 5;
    const includeResolved = req.query.includeResolved === 'true';
    
    const alerts = await portfolioRebalancingService.getRebalancingAlerts(
      req.params.id,
      req.user.id,
      threshold,
      includeResolved
    );

    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    console.error('Error fetching rebalancing alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rebalancing alerts',
    });
  }
});

/**
 * @route GET /api/investments/portfolios/:id/rebalancing/recommendations
 * @desc Get rebalancing recommendations for a portfolio
 * @access Private
 */
router.get('/portfolios/:id/rebalancing/recommendations', [
  param('id').isUUID(),
  query('threshold').optional().isFloat({ min: 0, max: 100 }),
  query('optimizationEnabled').optional().isBoolean(),
  query('taxEfficient').optional().isBoolean(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const options = {
      threshold: parseFloat(req.query.threshold) || 5,
      optimizationEnabled: req.query.optimizationEnabled === 'true',
      taxEfficient: req.query.taxEfficient === 'true',
    };
    
    const recommendations = await portfolioRebalancingService.getRebalancingRecommendations(
      req.params.id,
      req.user.id,
      options
    );

    res.json({
      success: true,
      data: recommendations,
    });
  } catch (error) {
    console.error('Error fetching rebalancing recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rebalancing recommendations',
    });
  }
});

/**
 * @route POST /api/investments/portfolios/:id/rebalancing/execute
 * @desc Execute a rebalancing action
 * @access Private
 */
router.post('/portfolios/:id/rebalancing/execute', [
  param('id').isUUID(),
  body('actions').isArray(),
  body('notes').optional().isLength({ max: 500 }),
  handleValidationErrors,
], async (req, res) => {
  try {
    const rebalanceData = {
      actions: req.body.actions,
      notes: req.body.notes,
      afterAllocation: req.body.afterAllocation,
      afterValue: req.body.afterValue,
      expectedImprovement: req.body.expectedImprovement,
    };
    
    const result = await portfolioRebalancingService.executeRebalancing(
      req.params.id,
      req.user.id,
      rebalanceData
    );

    res.json({
      success: true,
      message: 'Rebalancing executed successfully',
      data: result,
    });
  } catch (error) {
    console.error('Error executing rebalancing:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute rebalancing',
    });
  }
});

/**
 * @route GET /api/investments/portfolios/:id/rebalancing/history
 * @desc Get rebalancing history for a portfolio
 * @access Private
 */
router.get('/portfolios/:id/rebalancing/history', [
  param('id').isUUID(),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('offset').optional().isInt({ min: 0 }),
  handleValidationErrors,
], async (req, res) => {
  try {
    const options = {
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    };
    
    const history = await portfolioRebalancingService.getRebalancingHistory(
      req.params.id,
      req.user.id,
      options
    );

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Error fetching rebalancing history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rebalancing history',
    });
  }
});

/**
 * @route GET /api/investments/portfolios/:id/rebalancing/settings
 * @desc Get rebalancing settings for a portfolio
 * @access Private
 */
router.get('/portfolios/:id/rebalancing/settings', [
  param('id').isUUID(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const settings = await portfolioRebalancingService.getRebalancingSettings(
      req.params.id,
      req.user.id
    );

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching rebalancing settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rebalancing settings',
    });
  }
});

/**
 * @route PUT /api/investments/portfolios/:id/rebalancing/settings
 * @desc Update rebalancing settings for a portfolio
 * @access Private
 */
router.put('/portfolios/:id/rebalancing/settings', [
  param('id').isUUID(),
  body('threshold').optional().isFloat({ min: 0, max: 100 }),
  body('autoRebalance').optional().isBoolean(),
  body('rebalanceFrequency').optional().isIn(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
  body('notifyOnDrift').optional().isBoolean(),
  body('highPriorityThreshold').optional().isFloat({ min: 0, max: 100 }),
  handleValidationErrors,
], async (req, res) => {
  try {
    const settings = await portfolioRebalancingService.updateRebalancingSettings(
      req.params.id,
      req.user.id,
      req.body
    );

    res.json({
      success: true,
      message: 'Rebalancing settings updated successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error updating rebalancing settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update rebalancing settings',
    });
  }
});

export default router;
