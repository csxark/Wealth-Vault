import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect, checkOwnership } from '../middleware/auth.js';
import Expense from '../models/Expense.js';
import Category from '../models/Category.js';

const router = express.Router();

// @route   GET /api/expenses
// @desc    Get all expenses for authenticated user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      paymentMethod,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = { user: req.user._id };
    
    if (category) filter.category = category;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }
    if (minAmount || maxAmount) {
      filter.amount = {};
      if (minAmount) filter.amount.$gte = parseFloat(minAmount);
      if (maxAmount) filter.amount.$lte = parseFloat(maxAmount);
    }
    if (paymentMethod) filter.paymentMethod = paymentMethod;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const expenses = await Expense.find(filter)
      .populate('category', 'name color icon')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Expense.countDocuments(filter);

    res.json({
      success: true,
      data: {
        expenses,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching expenses'
    });
  }
});

// @route   GET /api/expenses/:id
// @desc    Get expense by ID
// @access  Private
router.get('/:id', protect, checkOwnership('Expense'), async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id)
      .populate('category', 'name color icon');

    res.json({
      success: true,
      data: {
        expense
      }
    });
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching expense'
    });
  }
});

// @route   POST /api/expenses
// @desc    Create new expense
// @access  Private
router.post('/', protect, [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Description is required and must be less than 200 characters'),
  body('category')
    .isMongoId()
    .withMessage('Valid category ID is required'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date'),
  body('paymentMethod')
    .optional()
    .isIn(['cash', 'credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'check', 'other'])
    .withMessage('Invalid payment method'),
  body('location.name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Location name must be less than 100 characters'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('isRecurring')
    .optional()
    .isBoolean()
    .withMessage('isRecurring must be a boolean')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      amount,
      description,
      category,
      date,
      paymentMethod,
      location,
      tags,
      isRecurring,
      recurringPattern,
      notes,
      subcategory
    } = req.body;

    // Verify category exists and belongs to user
    const categoryDoc = await Category.findOne({ _id: category, user: req.user._id });
    if (!categoryDoc) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category'
      });
    }

    // Create expense
    const expense = new Expense({
      user: req.user._id,
      amount,
      description,
      category,
      date: date || new Date(),
      paymentMethod: paymentMethod || 'other',
      location,
      tags: tags || [],
      isRecurring: isRecurring || false,
      recurringPattern,
      notes,
      subcategory
    });

    await expense.save();

    // Update category usage stats
    await categoryDoc.updateUsageStats(amount);

    // Populate category info for response
    await expense.populate('category', 'name color icon');

    res.status(201).json({
      success: true,
      message: 'Expense created successfully',
      data: {
        expense
      }
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating expense'
    });
  }
});

// @route   PUT /api/expenses/:id
// @desc    Update expense
// @access  Private
router.put('/:id', protect, checkOwnership('Expense'), [
  body('amount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be a positive number'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Description must be less than 200 characters'),
  body('category')
    .optional()
    .isMongoId()
    .withMessage('Valid category ID is required'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO date'),
  body('paymentMethod')
    .optional()
    .isIn(['cash', 'credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'check', 'other'])
    .withMessage('Invalid payment method')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const expense = req.resource;
    const oldAmount = expense.amount;
    const oldCategory = expense.category;

    // Update fields
    const updateFields = {};
    const allowedFields = [
      'amount', 'description', 'category', 'date', 'paymentMethod',
      'location', 'tags', 'isRecurring', 'recurringPattern', 'notes',
      'subcategory', 'status'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    // If category is being changed, verify it belongs to user
    if (updateFields.category && updateFields.category !== oldCategory.toString()) {
      const newCategory = await Category.findOne({ _id: updateFields.category, user: req.user._id });
      if (!newCategory) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category'
        });
      }
    }

    // Update expense
    const updatedExpense = await Expense.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    ).populate('category', 'name color icon');

    // Update category usage stats if amount or category changed
    if (updateFields.amount !== undefined || updateFields.category !== undefined) {
      const newAmount = updateFields.amount !== undefined ? updateFields.amount : oldAmount;
      const newCategoryId = updateFields.category || oldCategory;

      // Update old category stats
      if (oldCategory) {
        const oldCategoryDoc = await Category.findById(oldCategory);
        if (oldCategoryDoc) {
          // Recalculate stats without this expense
          const oldCategoryExpenses = await Expense.find({ 
            user: req.user._id, 
            category: oldCategory,
            _id: { $ne: expense._id }
          });
          const oldTotal = oldCategoryExpenses.reduce((sum, exp) => sum + exp.amount, 0);
          oldCategoryDoc.metadata.averageAmount = oldCategoryExpenses.length > 0 ? oldTotal / oldCategoryExpenses.length : 0;
          oldCategoryDoc.metadata.usageCount = oldCategoryExpenses.length;
          await oldCategoryDoc.save();
        }
      }

      // Update new category stats
      const newCategoryDoc = await Category.findById(newCategoryId);
      if (newCategoryDoc) {
        await newCategoryDoc.updateUsageStats(newAmount);
      }
    }

    res.json({
      success: true,
      message: 'Expense updated successfully',
      data: {
        expense: updatedExpense
      }
    });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating expense'
    });
  }
});

// @route   DELETE /api/expenses/:id
// @desc    Delete expense
// @access  Private
router.delete('/:id', protect, checkOwnership('Expense'), async (req, res) => {
  try {
    const expense = req.resource;

    // Update category usage stats
    if (expense.category) {
      const categoryDoc = await Category.findById(expense.category);
      if (categoryDoc) {
        // Recalculate stats without this expense
        const categoryExpenses = await Expense.find({ 
          user: req.user._id, 
          category: expense.category,
          _id: { $ne: expense._id }
        });
        const total = categoryExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        categoryDoc.metadata.averageAmount = categoryExpenses.length > 0 ? total / categoryExpenses.length : 0;
        categoryDoc.metadata.usageCount = categoryExpenses.length;
        await categoryDoc.save();
      }
    }

    await Expense.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting expense'
    });
  }
});

// @route   GET /api/expenses/stats/summary
// @desc    Get expense summary statistics
// @access  Private
router.get('/stats/summary', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const filter = { user: req.user._id };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const totalExpenses = await Expense.getTotalByDateRange(req.user._id, 
      startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1),
      endDate ? new Date(endDate) : new Date()
    );

    const expensesByCategory = await Expense.getByCategory(req.user._id,
      startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1),
      endDate ? new Date(endDate) : new Date()
    );

    res.json({
      success: true,
      data: {
        summary: totalExpenses,
        byCategory: expensesByCategory
      }
    });
  } catch (error) {
    console.error('Get expense stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching expense statistics'
    });
  }
});

export default router;
