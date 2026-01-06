
import express from 'express';
import { body, validationResult } from 'express-validator';
import { eq, and, sql, not } from 'drizzle-orm';
import db from '../config/db.js';
import { categories, expenses } from '../db/schema.js';
import { protect, checkOwnership } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/categories
// @desc    Get all categories for authenticated user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const { type, isActive } = req.query;

    const conditions = [eq(categories.userId, req.user.id)];
    if (type) conditions.push(eq(categories.type, type));
    if (isActive !== undefined) conditions.push(eq(categories.isActive, isActive === 'true'));

    const cats = await db.query.categories.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (categories, { asc }) => [asc(categories.priority), asc(categories.name)]
    });

    res.json({
      success: true,
      count: cats.length,
      data: { categories: cats }
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching categories' });
  }
});

// @route   GET /api/categories/:id
// @desc    Get category by ID
// @access  Private
router.get('/:id', protect, checkOwnership('Category'), async (req, res) => {
  res.json({
    success: true,
    data: { category: req.resource }
  });
});

// @route   POST /api/categories
// @desc    Create new category
// @access  Private
router.post('/', protect, [
  body('name').trim().isLength({ min: 1, max: 50 }),
  body('color').matches(/^#[0-9A-F]{6}$/i)
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { name, description, color, icon, type, budget, spendingLimit, priority, parentCategory } = req.body;

    // Check duplicate name
    // ILIKE/sql lower() is needed for case-insensitive check
    const [existing] = await db.select().from(categories)
      .where(and(
        eq(categories.userId, req.user.id),
        sql`lower(${categories.name}) = lower(${name})`
      ));

    if (existing) {
      return res.status(400).json({ success: false, message: 'Category with this name already exists' });
    }

    const [newCategory] = await db.insert(categories).values({
      userId: req.user.id,
      name,
      description,
      color,
      icon: icon || 'tag',
      type: type || 'expense',
      budget: budget || { monthly: 0, yearly: 0 },
      spendingLimit: spendingLimit || '0',
      priority: priority || 0,
      parentCategoryId: parentCategory
    }).returning();

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: { category: newCategory }
    });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ success: false, message: 'Server error while creating category' });
  }
});

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Private
router.put('/:id', protect, checkOwnership('Category'), async (req, res) => {
  try {
    const category = req.resource;
    const { name } = req.body;

    if (category.isDefault && name) {
      return res.status(400).json({ success: false, message: 'Cannot rename default categories' });
    }

    if (name && name.toLowerCase() !== category.name.toLowerCase()) {
      const [existing] = await db.select().from(categories)
        .where(and(
          eq(categories.userId, req.user.id),
          sql`lower(${categories.name}) = lower(${name})`,
          not(eq(categories.id, category.id))
        ));

      if (existing) return res.status(400).json({ success: false, message: 'Category name already exists' });
    }

    const { description, color, icon, type, budget, spendingLimit, priority, isActive } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (color) updateData.color = color;
    if (icon) updateData.icon = icon;
    if (type) updateData.type = type;
    if (budget) updateData.budget = budget;
    if (spendingLimit) updateData.spendingLimit = spendingLimit;
    if (priority !== undefined) updateData.priority = priority;
    if (isActive !== undefined) updateData.isActive = isActive;

    updateData.updatedAt = new Date();

    const [updatedCategory] = await db.update(categories)
      .set(updateData)
      .where(eq(categories.id, req.params.id))
      .returning();

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: { category: updatedCategory }
    });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating category' });
  }
});

// @route   DELETE /api/categories/:id
// @desc    Delete category
// @access  Private
router.delete('/:id', protect, checkOwnership('Category'), async (req, res) => {
  try {
    const category = req.resource;

    if (category.isDefault) {
      return res.status(400).json({ success: false, message: 'Cannot delete default categories' });
    }

    // Check usage - query expenses count
    const [usage] = await db.select({ count: sql`count(*)` })
      .from(expenses)
      .where(eq(expenses.categoryId, category.id));

    if (Number(usage.count) > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete categories with existing expenses' });
    }

    await db.delete(categories).where(eq(categories.id, category.id));

    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ success: false, message: 'Server error while deleting category' });
  }
});

// @route   GET /api/categories/stats/usage
// @desc    Get category usage statistics
// @access  Private
router.get('/stats/usage', protect, async (req, res) => {
  try {
    const cats = await db.query.categories.findMany({
      where: and(eq(categories.userId, req.user.id), eq(categories.isActive, true)),
      orderBy: (categories, { asc }) => [asc(categories.priority), asc(categories.name)]
    });

    // Transform to match old API if necessary, but Drizzle object is already clean JSON
    // We just ensure metadata access is safe
    const categoriesWithStats = cats.map(cat => ({
      _id: cat.id, // For frontend compatibility if it expects _id
      id: cat.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      type: cat.type,
      budget: cat.budget,
      spendingLimit: cat.spendingLimit,
      usageCount: cat.metadata?.usageCount || 0,
      averageAmount: cat.metadata?.averageAmount || 0,
      lastUsed: cat.metadata?.lastUsed,
      // Recalculate isOverBudget dynamically if needed, or rely on frontend
      isOverBudget: cat.spendingLimit > 0 && (cat.metadata?.averageAmount || 0) > cat.spendingLimit
    }));

    res.json({
      success: true,
      data: { categories: categoriesWithStats }
    });
  } catch (error) {
    console.error('Get category stats error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching statistics' });
  }
});

export default router;
