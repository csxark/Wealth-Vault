
import express from 'express';
import { body, validationResult } from 'express-validator';
import { eq, and, gte, lte, asc, desc, sql, like } from 'drizzle-orm';
import db from '../config/db.js';
import { expenses, categories, users } from '../db/schema.js';
import { protect, checkOwnership } from '../middleware/auth.js';

const router = express.Router();

// Helper to update category stats
const updateCategoryStats = async (categoryId) => {
  try {
    const result = await db.select({
      count: sql`count(*)`,
      total: sql`sum(${expenses.amount})`
    })
      .from(expenses)
      .where(eq(expenses.categoryId, categoryId));

    const count = Number(result[0].count);
    const total = Number(result[0].total) || 0;
    const average = count > 0 ? total / count : 0;

    // Use sql to update jsonb field properly if possible, or simple replace
    // For simplicity, we replace the metadata object, as we know its structure
    await db.update(categories)
      .set({
        metadata: {
          usageCount: count,
          averageAmount: average,
          lastUsed: new Date().toISOString()
        }
      })
      .where(eq(categories.id, categoryId));
  } catch (err) {
    console.error('Failed to update category stats:', err);
  }
};

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

    const conditions = [eq(expenses.userId, req.user.id)];

    if (category) conditions.push(eq(expenses.categoryId, category));
    if (startDate) conditions.push(gte(expenses.date, new Date(startDate)));
    if (endDate) conditions.push(lte(expenses.date, new Date(endDate)));
    if (minAmount) conditions.push(gte(expenses.amount, minAmount.toString()));
    if (maxAmount) conditions.push(lte(expenses.amount, maxAmount.toString()));
    if (paymentMethod) conditions.push(eq(expenses.paymentMethod, paymentMethod));

    const sortFn = sortOrder === 'desc' ? desc : asc;
    let orderByColumn = expenses.date;
    if (sortBy === 'amount') orderByColumn = expenses.amount;
    // Add other sort columns as needed

    const queryLimit = parseInt(limit);
    const queryOffset = (parseInt(page) - 1) * queryLimit;

    const [expensesList, countResult] = await Promise.all([
      db.query.expenses.findMany({
        where: and(...conditions),
        orderBy: [sortFn(orderByColumn)],
        limit: queryLimit,
        offset: queryOffset,
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          }
        }
      }),
      db.select({ count: sql`count(*)` })
        .from(expenses)
        .where(and(...conditions))
    ]);

    const total = Number(countResult[0]?.count || 0);

    res.json({
      success: true,
      data: {
        expenses: expensesList,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / queryLimit),
          totalItems: total,
          itemsPerPage: queryLimit
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
    // req.resource is already the simple object from middleware, 
    // but checkOwnership middleware might not populate category relations
    // We should fetch afresh with relation if needed or rely on checkOwnership to be simple
    // Since we want relation, let's fetch it fully
    const expense = await db.query.expenses.findFirst({
      where: eq(expenses.id, req.params.id),
      with: {
        category: {
          columns: { name: true, color: true, icon: true }
        }
      }
    });

    res.json({
      success: true,
      data: { expense }
    });
  } catch (error) {
    console.error('Get expense error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching expense' });
  }
});

// @route   POST /api/expenses
// @desc    Create new expense
// @access  Private
router.post('/', protect, [
  body('amount').isFloat({ min: 0.01 }),
  body('description').trim().isLength({ min: 1, max: 200 }),
  body('category').notEmpty(), // Assuming validation checks ID format if strictly needed
  body('date').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

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

    // Verify category
    const [categoryDoc] = await db.select().from(categories)
      .where(and(eq(categories.id, category), eq(categories.userId, req.user.id)));

    if (!categoryDoc) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }

    const [newExpense] = await db.insert(expenses).values({
      userId: req.user.id,
      amount: amount.toString(),
      description,
      categoryId: category,
      date: date ? new Date(date) : new Date(),
      paymentMethod: paymentMethod || 'other',
      location,
      tags: tags || [],
      isRecurring: isRecurring || false,
      recurringPattern,
      notes,
      subcategory
    }).returning();

    // Update category stats (async, don't block response necessarily, but good to wait)
    await updateCategoryStats(category);

    const expenseWithCategory = await db.query.expenses.findFirst({
      where: eq(expenses.id, newExpense.id),
      with: { category: { columns: { name: true, color: true, icon: true } } }
    });

    res.status(201).json({
      success: true,
      message: 'Expense created successfully',
      data: { expense: expenseWithCategory }
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({ success: false, message: 'Server error while creating expense' });
  }
});

// @route   PUT /api/expenses/:id
// @desc    Update expense
// @access  Private
router.put('/:id', protect, checkOwnership('Expense'), async (req, res) => {
  try {
    const oldExpense = req.resource;
    const { amount, description, category, date, paymentMethod, location, tags, isRecurring, recurringPattern, notes, subcategory, status } = req.body;

    const updateData = {};
    if (amount !== undefined) updateData.amount = amount.toString();
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) {
      // Verify new category
      const [cat] = await db.select().from(categories).where(and(eq(categories.id, category), eq(categories.userId, req.user.id)));
      if (!cat) return res.status(400).json({ success: false, message: 'Invalid category' });
      updateData.categoryId = category;
    }
    if (date !== undefined) updateData.date = new Date(date);
    // ... map other fields
    if (paymentMethod) updateData.paymentMethod = paymentMethod;
    if (location) updateData.location = location;
    if (tags) updateData.tags = tags;
    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (recurringPattern) updateData.recurringPattern = recurringPattern;
    if (notes) updateData.notes = notes;
    if (subcategory) updateData.subcategory = subcategory;
    if (status) updateData.status = status;

    updateData.updatedAt = new Date();

    const [updatedExpense] = await db.update(expenses)
      .set(updateData)
      .where(eq(expenses.id, req.params.id))
      .returning();

    // Update stats if amount or category changed
    if (updateData.amount || updateData.categoryId) {
      if (oldExpense.categoryId) await updateCategoryStats(oldExpense.categoryId);
      if (updateData.categoryId && updateData.categoryId !== oldExpense.categoryId) {
        await updateCategoryStats(updateData.categoryId);
      }
    }

    const result = await db.query.expenses.findFirst({
      where: eq(expenses.id, updatedExpense.id),
      with: { category: { columns: { name: true, color: true, icon: true } } }
    });

    res.json({
      success: true,
      message: 'Expense updated successfully',
      data: { expense: result }
    });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({ success: false, message: 'Server error while updating expense' });
  }
});

// @route   DELETE /api/expenses/:id
// @desc    Delete expense
// @access  Private
router.delete('/:id', protect, checkOwnership('Expense'), async (req, res) => {
  try {
    const expense = req.resource;
    await db.delete(expenses).where(eq(expenses.id, req.params.id));

    if (expense.categoryId) {
      await updateCategoryStats(expense.categoryId);
    }

    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({ success: false, message: 'Server error while deleting expense' });
  }
});

// @route   GET /api/expenses/stats/summary
// @desc    Get expense summary statistics
// @access  Private
router.get('/stats/summary', protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Default dates if not provided
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate) : new Date();

    const conditions = [
      eq(expenses.userId, req.user.id),
      eq(expenses.status, 'completed'),
      gte(expenses.date, start),
      lte(expenses.date, end)
    ];

    // Total expenses
    const [totalResult] = await db.select({
      total: sql`sum(${expenses.amount})`,
      count: sql`count(*)`
    })
      .from(expenses)
      .where(and(...conditions));

    // By Category
    const byCategory = await db.select({
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      total: sql`sum(${expenses.amount})`,
      count: sql`count(*)`
    })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(and(...conditions))
      .groupBy(expenses.categoryId, categories.name, categories.color) // Ensure grouping correctness
      .orderBy(desc(sql`sum(${expenses.amount})`)); // Sort by total amount

    res.json({
      success: true,
      data: {
        summary: {
          total: Number(totalResult?.total || 0),
          count: Number(totalResult?.count || 0)
        },
        byCategory: byCategory.map(item => ({
          categoryName: item.categoryName,
          categoryColor: item.categoryColor,
          total: Number(item.total),
          count: Number(item.count)
        }))
      }
    });
  } catch (error) {
    console.error('Get expense stats error:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching expense statistics' });
  }
});

export default router;
