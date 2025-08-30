import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect, checkOwnership } from '../middleware/auth.js';
import Category from '../models/Category.js';

const router = express.Router();

// @route   GET /api/categories
// @desc    Get all categories for authenticated user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { type, isActive } = req.query;
    
    const filter = { user: req.user._id };
    if (type) filter.type = type;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const categories = await Category.find(filter)
      .sort({ priority: 1, name: 1 });

    res.json({
      success: true,
      count: categories.length,
      data: {
        categories
      }
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching categories'
    });
  }
});

// @route   GET /api/categories/:id
// @desc    Get category by ID
// @access  Private
router.get('/:id', protect, checkOwnership('Category'), async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        category: req.resource
      }
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching category'
    });
  }
});

// @route   POST /api/categories
// @desc    Create new category
// @access  Private
router.post('/', protect, [
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category name is required and must be less than 50 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description must be less than 200 characters'),
  body('color')
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Color must be a valid hex color'),
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Icon name must be less than 50 characters'),
  body('type')
    .optional()
    .isIn(['expense', 'income', 'both'])
    .withMessage('Invalid category type'),
  body('budget.monthly')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly budget must be a positive number'),
  body('budget.yearly')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Yearly budget must be a positive number'),
  body('spendingLimit')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Spending limit must be a positive number'),
  body('priority')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Priority must be a non-negative integer')
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
      name,
      description,
      color,
      icon,
      type,
      budget,
      spendingLimit,
      priority,
      parentCategory
    } = req.body;

    // Check if category name already exists for this user
    const existingCategory = await Category.findOne({ 
      user: req.user._id, 
      name: { $regex: new RegExp(`^${name}$`, 'i') }
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists'
      });
    }

    // Verify parent category if provided
    if (parentCategory) {
      const parent = await Category.findOne({ _id: parentCategory, user: req.user._id });
      if (!parent) {
        return res.status(400).json({
          success: false,
          message: 'Invalid parent category'
        });
      }
    }

    // Create category
    const category = new Category({
      user: req.user._id,
      name,
      description,
      color,
      icon: icon || 'tag',
      type: type || 'expense',
      budget: budget || { monthly: 0, yearly: 0 },
      spendingLimit: spendingLimit || 0,
      priority: priority || 0,
      parentCategory
    });

    await category.save();

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: {
        category
      }
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating category'
    });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Private
router.put('/:id', protect, checkOwnership('Category'), [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Category name must be less than 50 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description must be less than 200 characters'),
  body('color')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Color must be a valid hex color'),
  body('icon')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Icon name must be less than 50 characters'),
  body('type')
    .optional()
    .isIn(['expense', 'income', 'both'])
    .withMessage('Invalid category type'),
  body('budget.monthly')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly budget must be a positive number'),
  body('budget.yearly')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Yearly budget must be a positive number'),
  body('spendingLimit')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Spending limit must be a positive number'),
  body('priority')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Priority must be a non-negative integer')
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

    const category = req.resource;

    // Check if trying to update a default category
    if (category.isDefault && req.body.name) {
      return res.status(400).json({
        success: false,
        message: 'Cannot rename default categories'
      });
    }

    // Check if name is being changed and if it conflicts with existing categories
    if (req.body.name && req.body.name !== category.name) {
      const existingCategory = await Category.findOne({ 
        user: req.user._id, 
        name: { $regex: new RegExp(`^${req.body.name}$`, 'i') },
        _id: { $ne: category._id }
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists'
        });
      }
    }

    // Update fields
    const updateFields = {};
    const allowedFields = [
      'name', 'description', 'color', 'icon', 'type', 'budget', 
      'spendingLimit', 'priority', 'isActive'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateFields[field] = req.body[field];
      }
    });

    // Update category
    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: {
        category: updatedCategory
      }
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating category'
    });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete category
// @access  Private
router.delete('/:id', protect, checkOwnership('Category'), async (req, res) => {
  try {
    const category = req.resource;

    // Check if category can be deleted
    if (!category.canDelete()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete default categories or categories with existing expenses'
      });
    }

    await Category.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting category'
    });
  }
});

// @route   GET /api/categories/stats/usage
// @desc    Get category usage statistics
// @access  Private
router.get('/stats/usage', protect, async (req, res) => {
  try {
    const categories = await Category.find({ user: req.user._id, isActive: true })
      .sort({ priority: 1, name: 1 });

    const categoriesWithStats = categories.map(cat => ({
      _id: cat._id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      type: cat.type,
      budget: cat.budget,
      spendingLimit: cat.spendingLimit,
      usageCount: cat.metadata.usageCount,
      averageAmount: cat.metadata.averageAmount,
      lastUsed: cat.metadata.lastUsed,
      isOverBudget: cat.isOverBudget
    }));

    res.json({
      success: true,
      data: {
        categories: categoriesWithStats
      }
    });
  } catch (error) {
    console.error('Get category stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching category statistics'
    });
  }
});

export default router;
