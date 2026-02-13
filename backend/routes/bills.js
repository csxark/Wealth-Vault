import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler.js';
import billService from '../services/billService.js';

const router = express.Router();

/**
 * @route   GET /api/bills
 * @desc    Get all bills for the authenticated user
 * @access  Private
 */
router.get('/', protect, asyncHandler(async (req, res) => {
  const { status, categoryId, sortBy, sortOrder, limit, offset } = req.query;
  
  const filters = {
    status,
    categoryId,
    sortBy: sortBy || 'dueDate',
    sortOrder: sortOrder || 'asc',
    limit: parseInt(limit) || 50,
    offset: parseInt(offset) || 0
  };

  const bills = await billService.getBills(req.user.id, filters);
  
  res.json({
    success: true,
    data: bills,
    count: bills.length
  });
}));

/**
 * @route   GET /api/bills/upcoming
 * @desc    Get upcoming bills with cash flow analysis
 * @access  Private
 */
router.get('/upcoming', protect, asyncHandler(async (req, res) => {
  const { days } = req.query;
  const daysAhead = parseInt(days) || 30;

  const upcomingBills = await billService.getUpcomingBills(req.user.id, daysAhead);
  
  res.json({
    success: true,
    data: upcomingBills,
    count: upcomingBills.length
  });
}));

/**
 * @route   GET /api/bills/suggestions
 * @desc    Get smart payment date suggestions based on cash flow
 * @access  Private
 */
router.get('/suggestions', protect, asyncHandler(async (req, res) => {
  const { billId } = req.query;
  
  const suggestions = await billService.getPaymentSuggestions(req.user.id, billId || null);
  
  res.json({
    success: true,
    data: suggestions,
    count: suggestions.length
  });
}));

/**
 * @route   GET /api/bills/analytics
 * @desc    Get bill analytics and statistics
 * @access  Private
 */
router.get('/analytics', protect, asyncHandler(async (req, res) => {
  const { period } = req.query;
  
  const analytics = await billService.getBillAnalytics(req.user.id, period || 'monthly');
  
  res.json({
    success: true,
    data: analytics
  });
}));

/**
 * @route   GET /api/bills/detect
 * @desc    Detect potential bills from transaction history
 * @access  Private
 */
router.get('/detect', protect, asyncHandler(async (req, res) => {
  const { months } = req.query;
  const monthsToAnalyze = parseInt(months) || 6;

  const detectedBills = await billService.detectPotentialBills(req.user.id, monthsToAnalyze);
  
  res.json({
    success: true,
    data: detectedBills,
    count: detectedBills.length
  });
}));

/**
 * @route   POST /api/bills/detect
 * @desc    Create bills from detected patterns
 * @access  Private
 */
router.post('/detect', protect, asyncHandler(async (req, res) => {
  const { detections } = req.body;
  
  if (!detections || !Array.isArray(detections) || detections.length === 0) {
    throw new ValidationError('Please provide an array of detected bills to create');
  }

  const createdBills = [];
  
  for (const detection of detections) {
    try {
      const bill = await billService.createBillFromDetection(req.user.id, detection);
      createdBills.push(bill);
    } catch (error) {
      console.error('Error creating bill from detection:', error);
      // Continue with other detections
    }
  }
  
  res.status(201).json({
    success: true,
    data: createdBills,
    count: createdBills.length,
    message: `Created ${createdBills.length} bills from detections`
  });
}));

/**
 * @route   GET /api/bills/:id
 * @desc    Get a specific bill by ID
 * @access  Private
 */
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const bill = await billService.getBillById(id, req.user.id);
  
  if (!bill) {
    throw new NotFoundError('Bill not found');
  }
  
  res.json({
    success: true,
    data: bill
  });
}));

/**
 * @route   POST /api/bills
 * @desc    Create a new bill
 * @access  Private
 */
router.post('/', protect, asyncHandler(async (req, res) => {
  const {
    name,
    description,
    amount,
    currency,
    frequency,
    dueDate,
    categoryId,
    autoPay,
    paymentMethod,
    reminderDays,
    smartScheduleEnabled,
    payee,
    payeeAccount,
    isRecurring,
    endDate,
    tags,
    notes
  } = req.body;
  
  if (!name || !amount || !frequency || !dueDate) {
    throw new ValidationError('Please provide name, amount, frequency, and dueDate');
  }

  const billData = {
    userId: req.user.id,
    name,
    description,
    amount,
    currency: currency || 'USD',
    frequency,
    dueDate,
    categoryId,
    autoPay: autoPay || false,
    paymentMethod: paymentMethod || 'other',
    reminderDays: reminderDays || 3,
    smartScheduleEnabled: smartScheduleEnabled || false,
    payee,
    payeeAccount,
    isRecurring: isRecurring !== undefined ? isRecurring : true,
    endDate,
    tags: tags || [],
    notes
  };

  const bill = await billService.createBill(billData);
  
  res.status(201).json({
    success: true,
    data: bill,
    message: 'Bill created successfully'
  });
}));

/**
 * @route   PUT /api/bills/:id
 * @desc    Update a bill
 * @access  Private
 */
router.put('/:id', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.userId;
  delete updates.createdAt;
  
  const bill = await billService.updateBill(id, req.user.id, updates);
  
  if (!bill) {
    throw new NotFoundError('Bill not found');
  }
  
  res.json({
    success: true,
    data: bill,
    message: 'Bill updated successfully'
  });
}));

/**
 * @route   DELETE /api/bills/:id
 * @desc    Delete a bill
 * @access  Private
 */
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  await billService.deleteBill(id, req.user.id);
  
  res.json({
    success: true,
    message: 'Bill deleted successfully'
  });
}));

/**
 * @route   POST /api/bills/:id/pay
 * @desc    Mark a bill as paid
 * @access  Private
 */
router.post('/:id/pay', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paidDate } = req.body;
  
  const bill = await billService.markBillAsPaid(id, req.user.id, paidDate ? new Date(paidDate) : new Date());
  
  if (!bill) {
    throw new NotFoundError('Bill not found');
  }
  
  res.json({
    success: true,
    data: bill,
    message: 'Bill marked as paid successfully'
  });
}));

/**
 * @route   POST /api/bills/:id/schedule
 * @desc    Schedule payment for a bill
 * @access  Private
 */
router.post('/:id/schedule', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { scheduledDate } = req.body;
  
  if (!scheduledDate) {
    throw new ValidationError('Please provide a scheduled payment date');
  }
  
  const bill = await billService.schedulePayment(id, req.user.id, scheduledDate);
  
  if (!bill) {
    throw new NotFoundError('Bill not found');
  }
  
  res.json({
    success: true,
    data: bill,
    message: 'Payment scheduled successfully'
  });
}));

/**
 * @route   POST /api/bills/:id/smart-schedule
 * @desc    Enable smart scheduling for a bill
 * @access  Private
 */
router.post('/:id/smart-schedule', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { enabled } = req.body;
  
  const bill = await billService.updateBill(id, req.user.id, {
    smartScheduleEnabled: enabled !== undefined ? enabled : true
  });
  
  if (!bill) {
    throw new NotFoundError('Bill not found');
  }
  
  // If enabling smart schedule, get suggestions
  let suggestions = null;
  if (bill.smartScheduleEnabled) {
    suggestions = await billService.getPaymentSuggestions(req.user.id, id);
  }
  
  res.json({
    success: true,
    data: bill,
    suggestions: suggestions ? suggestions[0] : null,
    message: `Smart scheduling ${bill.smartScheduleEnabled ? 'enabled' : 'disabled'}`
  });
}));

export default router;
