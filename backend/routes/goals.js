import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect, checkOwnership } from '../middleware/auth.js';
import Goal from '../models/Goal.js';

const router = express.Router();

// @route   GET /api/goals
// @desc    Get all goals for authenticated user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      priority,
      sortBy = 'deadline',
      sortOrder = 'asc'
    } = req.query;
    
    const filter = { user: req.user._id };
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (priority) filter.priority = priority;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const goals = await Goal.find(filter)
      .populate('category', 'name color icon')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Goal.countDocuments(filter);

    res.json({
      success: true,
      data: {
        goals,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get goals error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching goals'
    });
  }
});

// @route   GET /api/goals/:id
// @desc    Get goal by ID
// @access  Private
router.get('/:id', protect, checkOwnership('Goal'), async (req, res) => {
  try {
    const goal = await Goal.findById(req.params.id)
      .populate('category', 'name color icon');

    res.json({
      success: true,
      data: {
        goal
      }
    });
  } catch (error) {
    console.error('Get goal error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching goal'
    });
  }
});

// @route   POST /api/goals
// @desc    Create new goal
// @access  Private
router.post('/', protect, [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Goal title is required and must be less than 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('targetAmount')
    .isFloat({ min: 0.01 })
    .withMessage('Target amount must be a positive number'),
  body('currency')
    .optional()
    .isIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR'])
    .withMessage('Invalid currency'),
  body('type')
    .optional()
    .isIn(['savings', 'debt_payoff', 'investment', 'purchase', 'emergency_fund', 'other'])
    .withMessage('Invalid goal type'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid priority level'),
  body('deadline')
    .isISO8601()
    .withMessage('Deadline must be a valid ISO date'),
  body('recurringContribution.amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Contribution amount must be a positive number'),
  body('recurringContribution.frequency')
    .optional()
    .isIn(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'])
    .withMessage('Invalid contribution frequency')
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
      title,
      description,
      targetAmount,
      currency,
      type,
      priority,
      deadline,
      category,
      tags,
      notes,
      milestones,
      recurringContribution
    } = req.body;

    // Verify category if provided
    if (category) {
      const Category = await import('../models/Category.js');
      const categoryDoc = await Category.default.findOne({ _id: category, user: req.user._id });
      if (!categoryDoc) {
        return res.status(400).json({
          success: false,
          message: 'Invalid category'
        });
      }
    }

    // Create goal
    const goal = new Goal({
      user: req.user._id,
      title,
      description,
      targetAmount,
      currency: currency || 'USD',
      type: type || 'savings',
      priority: priority || 'medium',
      deadline: new Date(deadline),
      category,
      tags: tags || [],
      notes,
      milestones: milestones || [],
      recurringContribution: recurringContribution || { amount: 0, frequency: 'monthly' }
    });

    // Calculate next contribution date if recurring
    if (recurringContribution && recurringContribution.amount > 0) {
      goal.recurringContribution.nextContributionDate = goal.calculateNextContribution();
    }

    await goal.save();

    // Populate category info for response
    if (category) {
      await goal.populate('category', 'name color icon');
    }

    res.status(201).json({
      success: true,
      message: 'Goal created successfully',
      data: {
        goal
      }
    });
  } catch (error) {
    console.error('Create goal error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating goal'
    });
  }
});

// @route   PUT /api/goals/:id
// @desc    Update goal
// @access  Private
router.put('/:id', protect, checkOwnership('Goal'), [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Goal title must be less than 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be less than 500 characters'),
  body('targetAmount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Target amount must be a positive number'),
  body('currency')
    .optional()
    .isIn(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR'])
    .withMessage('Invalid currency'),
  body('type')
    .optional()
    .isIn(['savings', 'debt_payoff', 'investment', 'purchase', 'emergency_fund', 'other'])
    .withMessage('Invalid goal type'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid priority level'),
  body('deadline')
    .optional()
    .isISO8601()
    .withMessage('Deadline must be a valid ISO date'),
  body('status')
    .optional()
    .isIn(['active', 'paused', 'completed', 'cancelled'])
    .withMessage('Invalid status')
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

    const goal = req.resource;

    // Update fields
    const updateFields = {};
    const allowedFields = [
      'title', 'description', 'targetAmount', 'currency', 'type', 
      'priority', 'deadline', 'status', 'notes', 'tags'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    // Update goal
    const updatedGoal = await Goal.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    ).populate('category', 'name color icon');

    res.json({
      success: true,
      message: 'Goal updated successfully',
      data: {
        goal: updatedGoal
      }
    });
  } catch (error) {
    console.error('Update goal error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating goal'
    });
  }
});

// @route   DELETE /api/goals/:id
// @desc    Delete goal
// @access  Private
router.delete('/:id', protect, checkOwnership('Goal'), async (req, res) => {
  try {
    await Goal.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Goal deleted successfully'
    });
  } catch (error) {
    console.error('Delete goal error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting goal'
    });
  }
});

// @route   POST /api/goals/:id/contribute
// @desc    Add contribution to goal
// @access  Private
router.post('/:id/contribute', protect, checkOwnership('Goal'), [
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Contribution amount must be a positive number'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description must be less than 200 characters')
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

    const { amount, description } = req.body;
    const goal = req.resource;

    // Check if goal is active
    if (goal.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot contribute to inactive goals'
      });
    }

    // Add contribution
    await goal.addContribution(amount, description);

    // Populate category info for response
    if (goal.category) {
      await goal.populate('category', 'name color icon');
    }

    res.json({
      success: true,
      message: 'Contribution added successfully',
      data: {
        goal
      }
    });
  } catch (error) {
    console.error('Add contribution error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding contribution'
    });
  }
});

// @route   GET /api/goals/stats/summary
// @desc    Get goals summary statistics
// @access  Private
router.get('/stats/summary', protect, async (req, res) => {
  try {
    const summary = await Goal.getGoalsSummary(req.user._id);

    res.json({
      success: true,
      data: {
        summary
      }
    });
  } catch (error) {
    console.error('Get goals summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching goals summary'
    });
  }
});

export default router;
