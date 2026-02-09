import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import investmentService from '../services/investmentService.js';
import portfolioService from '../services/portfolioService.js';
import priceService from '../services/priceService.js';
import investmentAnalyticsService from '../services/investmentAnalyticsService.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }
  next();
};

// Investment CRUD Routes

/**
 * @route GET /api/investments
 * @desc Get all investments for the authenticated user
 * @access Private
 */
router.get('/', [
  query('portfolioId').optional().isUUID(),
  query('type').optional().isIn(['stock', 'etf', 'mutual_fund', 'bond', 'crypto']),
  query('isActive').optional().isBoolean(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const { portfolioId, type, isActive } = req.query;
    const filters = {};

    if (portfolioId) filters.portfolioId = portfolioId;
    if (type) filters.type = type;
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    const investments = await investmentService.getInvestments(req.user.id, filters);

    res.json({
      success: true,
      data: investments,
    });
  } catch (error) {
    console.error('Error fetching investments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch investments',
    });
  }
});

/**
 * @route GET /api/investments/:id
 * @desc Get investment by ID
 * @access Private
 */
router.get('/:id', [
  param('id').isUUID(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const investment = await investmentService.getInvestmentById(req.params.id, req.user.id);

    if (!investment) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found',
      });
    }

    res.json({
      success: true,
      data: investment,
    });
  } catch (error) {
    console.error('Error fetching investment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch investment',
    });
  }
});

/**
 * @route POST /api/investments
 * @desc Create a new investment
 * @access Private
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
], async (req, res) => {
  try {
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

    res.status(201).json({
      success: true,
      message: 'Investment created successfully',
      data: investment,
    });
  } catch (error) {
    console.error('Error creating investment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create investment',
    });
  }
});

/**
 * @route PUT /api/investments/:id
 * @desc Update an investment
 * @access Private
 */
router.put('/:id', [
  param('id').isUUID(),
  body('name').optional().isLength({ min: 1, max: 100 }).trim(),
  body('type').optional().isIn(['stock', 'etf', 'mutual_fund', 'bond', 'crypto']),
  body('sector').optional().isLength({ min: 1, max: 50 }),
  body('tags').optional().isArray(),
  body('notes').optional().isLength({ max: 500 }),
  handleValidationErrors,
], async (req, res) => {
  try {
    const updateData = {};
    const allowedFields = ['name', 'type', 'assetClass', 'sector', 'country', 'tags', 'notes', 'isActive'];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    const investment = await investmentService.updateInvestment(req.params.id, updateData, req.user.id);

    res.json({
      success: true,
      message: 'Investment updated successfully',
      data: investment,
    });
  } catch (error) {
    console.error('Error updating investment:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update investment',
    });
  }
});

/**
 * @route DELETE /api/investments/:id
 * @desc Delete an investment
 * @access Private
 */
router.delete('/:id', [
  param('id').isUUID(),
  handleValidationErrors,
], async (req, res) => {
  try {
    await investmentService.deleteInvestment(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Investment deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting investment:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to delete investment',
    });
  }
});

// Transaction Routes

/**
 * @route POST /api/investments/:id/transactions
 * @desc Add a transaction to an investment
 * @access Private
 */
router.post('/:id/transactions', [
  param('id').isUUID(),
  body('type').isIn(['buy', 'sell', 'dividend', 'split', 'fee']),
  body('quantity').isFloat({ min: 0 }),
  body('price').isFloat({ min: 0 }),
  body('date').optional().isISO8601(),
  handleValidationErrors,
], async (req, res) => {
  try {
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

    res.status(201).json({
      success: true,
      message: 'Transaction added successfully',
      data: transaction,
    });
  } catch (error) {
    console.error('Error adding transaction:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to add transaction',
    });
  }
});

/**
 * @route GET /api/investments/:id/transactions
 * @desc Get transactions for an investment
 * @access Private
 */
router.get('/:id/transactions', [
  param('id').isUUID(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const transactions = await investmentService.getInvestmentTransactions(req.params.id, req.user.id);

    res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
    });
  }
});

// Portfolio Routes

/**
 * @route GET /api/investments/portfolios
 * @desc Get all portfolios for the user
 * @access Private
 */
router.get('/portfolios', async (req, res) => {
  try {
    const portfolios = await portfolioService.getPortfolios(req.user.id);

    res.json({
      success: true,
      data: portfolios,
    });
  } catch (error) {
    console.error('Error fetching portfolios:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch portfolios',
    });
  }
});

/**
 * @route POST /api/investments/portfolios
 * @desc Create a new portfolio
 * @access Private
 */
router.post('/portfolios', [
  body('name').isLength({ min: 1, max: 100 }).trim(),
  body('description').optional().isLength({ max: 500 }),
  body('currency').optional().isLength({ min: 3, max: 3 }),
  body('riskTolerance').optional().isIn(['conservative', 'moderate', 'aggressive']),
  handleValidationErrors,
], async (req, res) => {
  try {
    const portfolioData = {
      name: req.body.name,
      description: req.body.description,
      currency: req.body.currency || 'USD',
      riskTolerance: req.body.riskTolerance || 'moderate',
      investmentStrategy: req.body.investmentStrategy,
      targetAllocation: req.body.targetAllocation || {},
    };

    const portfolio = await portfolioService.createPortfolio(portfolioData, req.user.id);

    res.status(201).json({
      success: true,
      message: 'Portfolio created successfully',
      data: portfolio,
    });
  } catch (error) {
    console.error('Error creating portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create portfolio',
    });
  }
});

/**
 * @route GET /api/investments/portfolios/:id/summary
 * @desc Get portfolio summary with investments
 * @access Private
 */
router.get('/portfolios/:id/summary', [
  param('id').isUUID(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const summary = await portfolioService.getPortfolioSummary(req.params.id, req.user.id);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Error fetching portfolio summary:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Portfolio not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch portfolio summary',
    });
  }
});

// Price Routes

/**
 * @route POST /api/investments/portfolios/:id/update-prices
 * @desc Update prices for all investments in a portfolio
 * @access Private
 */
router.post('/portfolios/:id/update-prices', [
  param('id').isUUID(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const result = await priceService.updatePortfolioPrices(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Price update completed',
      data: result,
    });
  } catch (error) {
    console.error('Error updating prices:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update prices',
    });
  }
});

/**
 * @route GET /api/investments/:id/price-history
 * @desc Get price history for an investment
 * @access Private
 */
router.get('/:id/price-history', [
  param('id').isUUID(),
  query('days').optional().isInt({ min: 1, max: 365 }),
  handleValidationErrors,
], async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const history = await priceService.getPriceHistory(req.params.id, days);

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Error fetching price history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch price history',
    });
  }
});

// Analytics Routes

/**
 * @route GET /api/investments/:id/analytics
 * @desc Get analytics for an investment
 * @access Private
 */
router.get('/:id/analytics', [
  param('id').isUUID(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const analytics = await investmentAnalyticsService.calculateInvestmentPerformance(req.params.id, req.user.id);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Error fetching investment analytics:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch investment analytics',
    });
  }
});

/**
 * @route GET /api/investments/portfolios/:id/analytics
 * @desc Get analytics for a portfolio
 * @access Private
 */
router.get('/portfolios/:id/analytics', [
  param('id').isUUID(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const analytics = await investmentAnalyticsService.calculatePortfolioPerformance(req.params.id, req.user.id);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.error('Error fetching portfolio analytics:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Portfolio not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch portfolio analytics',
    });
  }
});

/**
 * @route POST /api/investments/portfolios/:id/optimize
 * @desc Optimize portfolio using Modern Portfolio Theory
 * @access Private
 */
router.post('/portfolios/:id/optimize', [
  param('id').isUUID(),
  body('riskTolerance').optional().isIn(['conservative', 'moderate', 'aggressive']),
  body('targetReturn').optional().isFloat({ min: 0, max: 1 }),
  body('constraints').optional().isObject(),
  handleValidationErrors,
], async (req, res) => {
  try {
    const optimizationParams = {
      riskTolerance: req.body.riskTolerance || 'moderate',
      targetReturn: req.body.targetReturn,
      constraints: req.body.constraints || {},
    };

    const optimizationResult = await portfolioService.optimizePortfolio(req.params.id, req.user.id, optimizationParams);

    res.json({
      success: true,
      message: 'Portfolio optimization completed',
      data: optimizationResult,
    });
  } catch (error) {
    console.error('Error optimizing portfolio:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Portfolio not found',
      });
    }

    if (error.message.includes('at least 2 investments')) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to optimize portfolio',
    });
  }
});

export default router;
