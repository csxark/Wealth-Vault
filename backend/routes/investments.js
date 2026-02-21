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

export default router;
