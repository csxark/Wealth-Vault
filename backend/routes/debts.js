import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import debtService from '../services/debtService.js';

const router = express.Router();

/**
 * @route   GET /api/debts
 * @desc    Get all debts for the authenticated user
 * @access  Private
 */
router.get('/', protect, asyncHandler(async (req, res) => {
  const { status, type, sortBy, sortOrder } = req.query;
  
  const filters = {
    status,
    type,
    sortBy: sortBy || 'currentBalance',
    sortOrder: sortOrder || 'desc'
  };

  const debts = await debtService.getDebts(req.user.id, filters);
  
  res.json({
    success: true,
    data: debts,
    count: debts.length
  });
}));

/**
 * @route   GET /api/debts/analytics
 * @desc    Get debt analytics and statistics
 * @access  Private
 */
router.get('/analytics', protect, asyncHandler(async (req, res) => {
  const analytics = await debtService.getDebtAnalytics(req.user.id);
  
  res.json({
    success: true,
    data: analytics
  });
}));

/**
 * @route   GET /api/debts/payoff-strategies
 * @desc    Get payoff strategies (snowball vs avalanche) comparison
 * @access  Private
 */
router.get('/payoff-strategies', protect, asyncHandler(async (req, res) => {
  const { extraPayment } = req.query;
  const extraPaymentAmount = parseFloat(extraPayment) || 0;

  const strategies = await debtService.getPayoffStrategies(req.user.id, extraPaymentAmount);
  
  res.json({
    success: true,
    data: strategies
  });
}));

/**
 * @route   GET /api/debts/:id
 * @desc    Get a specific debt by ID
 * @access  Private
 */
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const debt = await debtService.getDebtById(id, req.user.id);
  
  if (!debt) {
    throw new NotFoundError('Debt not found');
  }
  
  res.json({
    success: true,
    data: debt
  });
}));

/**
 * @route   GET /api/debts/:id/payments
 * @desc    Get payment history for a specific debt
 * @access  Private
 */
router.get('/:id/payments', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const payments = await debtService.getPaymentHistory(id, req.user.id);
  
  res.json({
    success: true,
    data: payments,
    count: payments.length
  });
}));

/**
 * @route   POST /api/debts
 * @desc    Create a new debt
 * @access  Private
 */
router.post('/', protect, asyncHandler(async (req, res) => {
  const {
    name,
    description,
    type,
    lender,
    originalBalance,
    currentBalance,
    interestRate,
    minimumPayment,
    dueDate,
    startDate,
    isPriority,
    categoryId,
    currency,
    accountNumber,
    notes,
    tags
  } = req.body;
  
  if (!name || !type || !originalBalance || !currentBalance || !interestRate || !minimumPayment) {
    throw new ValidationError('Please provide name, type, originalBalance, currentBalance, interestRate, and minimumPayment');
  }

  const debtData = {
    userId: req.user.id,
    name,
    description,
    type,
    lender,
    originalBalance,
    currentBalance,
    interestRate,
    minimumPayment,
    dueDate,
    startDate,
    isPriority,
    categoryId,
    currency: currency || 'USD',
    accountNumber,
    notes,
    tags: tags || []
  };

  const debt = await debtService.createDebt(debtData);
  
  res.status(201).json({
    success: true,
    data: debt,
    message: 'Debt created successfully'
  });
}));

/**
 * @route   PUT /api/debts/:id
 * @desc    Update a debt
 * @access  Private
 */
router.put('/:id', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.userId;
  delete updates.createdAt;
  
  const debt = await debtService.updateDebt(id, req.user.id, updates);
  
  if (!debt) {
    throw new NotFoundError('Debt not found');
  }
  
  res.json({
    success: true,
    data: debt,
    message: 'Debt updated successfully'
  });
}));

/**
 * @route   DELETE /api/debts/:id
 * @desc    Delete a debt
 * @access  Private
 */
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  await debtService.deleteDebt(id, req.user.id);
  
  res.json({
    success: true,
    message: 'Debt deleted successfully'
  });
}));

/**
 * @route   POST /api/debts/:id/payments
 * @desc    Record a payment on a debt
 * @access  Private
 */
router.post('/:id/payments', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    amount,
    paymentDate,
    paymentMethod,
    isExtraPayment,
    notes,
    principalAmount,
    interestAmount
  } = req.body;
  
  if (!amount) {
    throw new ValidationError('Please provide payment amount');
  }

  const paymentData = {
    amount,
    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
    paymentMethod: paymentMethod || 'other',
    isExtraPayment: isExtraPayment || false,
    notes,
    principalAmount,
    interestAmount
  };

  const result = await debtService.recordPayment(id, req.user.id, paymentData);
  
  res.status(201).json({
    success: true,
    data: result,
    message: result.debt.status === 'paid_off' ? 'Congratulations! Debt paid off!' : 'Payment recorded successfully'
  });
}));

export default router;
