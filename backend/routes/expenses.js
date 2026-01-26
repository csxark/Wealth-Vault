import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, gte, lte, asc, desc, sql, like } from "drizzle-orm";
import db from "../config/db.js";
import { expenses, categories, users } from "../db/schema.js";
import { protect, checkOwnership } from "../middleware/auth.js";
import { asyncHandler, ValidationError, NotFoundError } from "../middleware/errorHandler.js";
import { parseListQuery } from "../utils/pagination.js";
import { logAudit, AuditActions, ResourceTypes } from "../middleware/auditLogger.js";

const router = express.Router();

// Helper to update category stats
const updateCategoryStats = async (categoryId) => {
  try {
    const result = await db
      .select({
        count: sql`count(*)`,
        total: sql`sum(${expenses.amount})`,
      })
      .from(expenses)
      .where(eq(expenses.categoryId, categoryId));

    const count = Number(result[0].count);
    const total = Number(result[0].total) || 0;
    const average = count > 0 ? total / count : 0;

    // Use sql to update jsonb field properly if possible, or simple replace
    // For simplicity, we replace the metadata object, as we know its structure
    await db
      .update(categories)
      .set({
        metadata: {
          usageCount: count,
          averageAmount: average,
          lastUsed: new Date().toISOString(),
        },
      })
      .where(eq(categories.id, categoryId));
  } catch (err) {
    console.error("Failed to update category stats:", err);
  }
};

/**
 * @swagger
 * /expenses:
 *   get:
 *     summary: Get all expenses for authenticated user
 *     tags: [Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter expenses from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter expenses until this date
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [date, amount]
 *           default: date
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in description, amount, or payment method
 *     responses:
 *       200:
 *         description: List of expenses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     expenses:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Expense'
 *                     pagination:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get("/", protect, asyncHandler(async (req, res) => {
  const queryOptions = {
    allowedSortFields: ['date', 'amount', 'createdAt'],
    defaultSortField: 'date',
    allowedFilters: ['category', 'paymentMethod', 'status'],
    maxLimit: 100,
  };

  const { pagination, sorting, search, filters, dateRange } = parseListQuery(req.query, queryOptions);
  
  const conditions = [eq(expenses.userId, req.user.id)];

  // Apply filters
  if (filters.category) conditions.push(eq(expenses.categoryId, filters.category));
  if (filters.paymentMethod) conditions.push(eq(expenses.paymentMethod, filters.paymentMethod));
  if (filters.status) conditions.push(eq(expenses.status, filters.status));
  
  // Apply date range
  if (dateRange.startDate) conditions.push(gte(expenses.date, dateRange.startDate));
  if (dateRange.endDate) conditions.push(lte(expenses.date, dateRange.endDate));

  // Apply search
  if (search.search) {
    const searchTerm = `%${search.search.toLowerCase()}%`;
    conditions.push(
      sql`(LOWER(${expenses.description}) LIKE ${searchTerm} OR 
           CAST(${expenses.amount} AS TEXT) LIKE ${searchTerm} OR
           LOWER(${expenses.paymentMethod}) LIKE ${searchTerm})`
    );
  }

  const sortFn = sorting.sortOrder === "desc" ? desc : asc;
  let orderByColumn = expenses.date;
  if (sorting.sortBy === "amount") orderByColumn = expenses.amount;
  if (sorting.sortBy === "createdAt") orderByColumn = expenses.createdAt;

  const [expensesList, countResult] = await Promise.all([
    db.query.expenses.findMany({
      where: and(...conditions),
      orderBy: [sortFn(orderByColumn)],
      limit: pagination.limit,
      offset: pagination.offset,
      with: {
        category: {
          columns: { name: true, color: true, icon: true },
        },
      },
    }),
    db
      .select({ count: sql`count(*)` })
      .from(expenses)
      .where(and(...conditions)),
  ]);

  const total = Number(countResult[0]?.count || 0);
  const paginatedData = req.buildPaginatedResponse(expensesList, total);

  return res.paginated(paginatedData.items, paginatedData.pagination, 'Expenses retrieved successfully');
}));

// @route   GET /api/expenses/:id
// @desc    Get expense by ID
// @access  Private
router.get("/:id", protect, checkOwnership("Expense"), asyncHandler(async (req, res) => {
  const expense = await db.query.expenses.findFirst({
    where: eq(expenses.id, req.params.id),
    with: {
      category: {
        columns: { name: true, color: true, icon: true },
      },
    },
  });

  if (!expense) {
    throw new NotFoundError('Expense not found');
  }

  return res.success(expense, 'Expense retrieved successfully');
}));

// @route   POST /api/expenses
// @desc    Create new expense
// @access  Private
router.post(
  "/",
  protect,
  [
    body("amount").isFloat({ min: 0.01 }),
    body("description").trim().isLength({ min: 1, max: 200 }),
    body("category").notEmpty(), // Assuming validation checks ID format if strictly needed
    body("date").optional().isISO8601(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ success: false, errors: errors.array() });

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
        subcategory,
      } = req.body;

      // Verify category
      const [categoryDoc] = await db
        .select()
        .from(categories)
        .where(
          and(eq(categories.id, category), eq(categories.userId, req.user.id))
        );

      if (!categoryDoc) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid category" });
      }

      const [newExpense] = await db
        .insert(expenses)
        .values({
          userId: req.user.id,
          amount: amount.toString(),
          description,
          categoryId: category,
          date: date ? new Date(date) : new Date(),
          paymentMethod: paymentMethod || "other",
          location,
          tags: tags || [],
          isRecurring: isRecurring || false,
          recurringPattern,
          notes,
          subcategory,
        })
        .returning();

      // Update category stats (async, don't block response necessarily, but good to wait)
      await updateCategoryStats(category);

      // Log expense creation
      logAudit(req, {
        userId: req.user.id,
        action: AuditActions.EXPENSE_CREATE,
        resourceType: ResourceTypes.EXPENSE,
        resourceId: newExpense.id,
        metadata: {
          amount: amount,
          description: description,
          categoryId: category,
        },
        status: 'success',
      });

      const expenseWithCategory = await db.query.expenses.findFirst({
        where: eq(expenses.id, newExpense.id),
        with: {
          category: { columns: { name: true, color: true, icon: true } },
        },
      });

      res.status(201).json({
        success: true,
        message: "Expense created successfully",
        data: { expense: expenseWithCategory },
      });
    } catch (error) {
      console.error("Create expense error:", error);
      res.status(500).json({
        success: false,
        message: "Server error while creating expense",
      });
    }
  }
);

// @route   PUT /api/expenses/:id
// @desc    Update expense
// @access  Private
router.put("/:id", protect, checkOwnership("Expense"), async (req, res) => {
  try {
    const oldExpense = req.resource;
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
      subcategory,
      status,
    } = req.body;

    const updateData = {};
    if (amount !== undefined) updateData.amount = amount.toString();
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) {
      // Verify new category
      const [cat] = await db
        .select()
        .from(categories)
        .where(
          and(eq(categories.id, category), eq(categories.userId, req.user.id))
        );
      if (!cat)
        return res
          .status(400)
          .json({ success: false, message: "Invalid category" });
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

    const [updatedExpense] = await db
      .update(expenses)
      .set(updateData)
      .where(eq(expenses.id, req.params.id))
      .returning();

    // Update stats if amount or category changed
    if (updateData.amount || updateData.categoryId) {
      if (oldExpense.categoryId)
        await updateCategoryStats(oldExpense.categoryId);
      if (
        updateData.categoryId &&
        updateData.categoryId !== oldExpense.categoryId
      ) {
        await updateCategoryStats(updateData.categoryId);
      }
    }

    // Log expense update
    logAudit(req, {
      userId: req.user.id,
      action: AuditActions.EXPENSE_UPDATE,
      resourceType: ResourceTypes.EXPENSE,
      resourceId: req.params.id,
      metadata: {
        updatedFields: Object.keys(updateData),
        oldAmount: oldExpense.amount,
        newAmount: updateData.amount,
      },
      status: 'success',
    });

    const result = await db.query.expenses.findFirst({
      where: eq(expenses.id, updatedExpense.id),
      with: { category: { columns: { name: true, color: true, icon: true } } },
    });

    res.json({
      success: true,
      message: "Expense updated successfully",
      data: { expense: result },
    });
  } catch (error) {
    console.error("Update expense error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while updating expense" });
  }
});

// @route   DELETE /api/expenses/:id
// @desc    Delete expense
// @access  Private
router.delete("/:id", protect, checkOwnership("Expense"), async (req, res) => {
  try {
    const expense = req.resource;
    await db.delete(expenses).where(eq(expenses.id, req.params.id));

    if (expense.categoryId) {
      await updateCategoryStats(expense.categoryId);
    }

    // Log expense deletion
    logAudit(req, {
      userId: req.user.id,
      action: AuditActions.EXPENSE_DELETE,
      resourceType: ResourceTypes.EXPENSE,
      resourceId: req.params.id,
      metadata: {
        amount: expense.amount,
        description: expense.description,
        categoryId: expense.categoryId,
      },
      status: 'success',
    });

    res.json({ success: true, message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Delete expense error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while deleting expense" });
  }
});

// @route   POST /api/expenses/import
// @desc    Import expenses from CSV data
// @access  Private
router.post("/import", protect, async (req, res) => {
  try {
    const { expenses: expensesData } = req.body;

    if (!expensesData || !Array.isArray(expensesData)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request: expenses array is required",
      });
    }

    const errors = [];
    const validExpenses = [];

    // Validate and prepare expenses
    for (let i = 0; i < expensesData.length; i++) {
      const expense = expensesData[i];
      const rowNumber = i + 1;

      try {
        // Validate required fields
        if (!expense.amount || isNaN(parseFloat(expense.amount))) {
          errors.push(`Row ${rowNumber}: Invalid or missing amount`);
          continue;
        }

        if (!expense.description || typeof expense.description !== 'string' || expense.description.trim().length === 0) {
          errors.push(`Row ${rowNumber}: Invalid or missing description`);
          continue;
        }

        if (!expense.category || typeof expense.category !== 'string') {
          errors.push(`Row ${rowNumber}: Invalid or missing category`);
          continue;
        }

        // Validate category exists and belongs to user
        const [categoryDoc] = await db
          .select()
          .from(categories)
          .where(
            and(eq(categories.id, expense.category), eq(categories.userId, req.user.id))
          );

        if (!categoryDoc) {
          errors.push(`Row ${rowNumber}: Invalid category "${expense.category}"`);
          continue;
        }

        // Validate date
        let expenseDate;
        if (expense.date) {
          expenseDate = new Date(expense.date);
          if (isNaN(expenseDate.getTime())) {
            errors.push(`Row ${rowNumber}: Invalid date format`);
            continue;
          }
        } else {
          expenseDate = new Date();
        }

        validExpenses.push({
          userId: req.user.id,
          amount: parseFloat(expense.amount).toString(),
          description: expense.description.trim(),
          categoryId: expense.category,
          date: expenseDate,
          paymentMethod: expense.paymentMethod || "other",
          location: expense.location || null,
          tags: expense.tags || [],
          isRecurring: expense.isRecurring || false,
          recurringPattern: expense.recurringPattern || null,
          notes: expense.notes || null,
          subcategory: expense.subcategory || null,
        });
      } catch (error) {
        errors.push(`Row ${rowNumber}: ${error.message}`);
      }
    }

    if (validExpenses.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid expenses to import",
        errors,
      });
    }

    // Bulk insert valid expenses
    const insertedExpenses = await db
      .insert(expenses)
      .values(validExpenses)
      .returning();

    // Log expense import
    logAudit(req, {
      userId: req.user.id,
      action: AuditActions.EXPENSE_IMPORT,
      resourceType: ResourceTypes.EXPENSE,
      metadata: {
        importedCount: insertedExpenses.length,
        errorCount: errors.length,
      },
      status: 'success',
    });

    // Update category stats for all affected categories
    const affectedCategoryIds = [...new Set(validExpenses.map(exp => exp.categoryId))];
    for (const categoryId of affectedCategoryIds) {
      await updateCategoryStats(categoryId);
    }

    res.status(201).json({
      success: true,
      message: `Successfully imported ${insertedExpenses.length} expenses`,
      data: {
        imported: insertedExpenses.length,
        errors: errors.length,
        errorDetails: errors.slice(0, 10), // Limit error details to first 10
      },
    });
  } catch (error) {
    console.error("Import expenses error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while importing expenses",
    });
  }
});

// @route   GET /api/expenses/stats/summary
// @desc    Get expense summary statistics
// @access  Private
router.get("/stats/summary", protect, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Default dates if not provided
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate) : new Date();

    const conditions = [
      eq(expenses.userId, req.user.id),
      eq(expenses.status, "completed"),
      gte(expenses.date, start),
      lte(expenses.date, end),
    ];

    // Total expenses
    const [totalResult] = await db
      .select({
        total: sql`sum(${expenses.amount})`,
        count: sql`count(*)`,
      })
      .from(expenses)
      .where(and(...conditions));

    // By Category
    const byCategory = await db
      .select({
        categoryId: expenses.categoryId,
        categoryName: categories.name,
        categoryColor: categories.color,
        total: sql`sum(${expenses.amount})`,
        count: sql`count(*)`,
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
          count: Number(totalResult?.count || 0),
        },
        byCategory: byCategory.map((item) => ({
          categoryName: item.categoryName,
          categoryColor: item.categoryColor,
          total: Number(item.total),
          count: Number(item.count),
        })),
      },
    });
  } catch (error) {
    console.error("Get expense stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching expense statistics",
    });
  }
});

export default router;
