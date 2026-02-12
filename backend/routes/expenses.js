import { initializeRecurringExpense, disableRecurring } from "../services/expenseService.js";
import { getJobStatus, runManualExecution } from "../jobs/recurringExecution.js";
import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, gte, lte, asc, desc, sql, like } from "drizzle-orm";
import db from "../config/db.js";
import { expenses, categories, users, vaultMembers, subscriptions } from "../db/schema.js";
import { protect, checkOwnership } from "../middleware/auth.js";
import { checkVaultAccess } from "../middleware/vaultAuth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parseListQuery } from "../utils/pagination.js";
import { securityInterceptor, auditBulkOperation } from "../middleware/auditMiddleware.js";
import { logAudit, AuditActions, ResourceTypes } from "../services/auditService.js";
import { guardExpenseCreation } from "../middleware/securityGuard.js";
import eventBus from "../events/eventBus.js";
import { AppError } from "../utils/AppError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

// Side-effects like updateCategoryStats, monitorBudget, matchSubscription 
// are now handled by event listeners in ../listeners/

const router = express.Router();

// Helper to update category stats removed - now handled by categoryListener via 'EXPENSE_CREATED' event

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

  const conditions = [];

  // Default to personal expenses if no vaultId provided
  if (req.query.vaultId) {
    // Check if user is member of the vault
    const [membership] = await db
      .select()
      .from(vaultMembers)
      .where(and(eq(vaultMembers.vaultId, req.query.vaultId), eq(vaultMembers.userId, req.user.id)));

    if (!membership) {
      return next(new AppError(403, 'You do not have access to this vault'));
    }
    conditions.push(eq(expenses.vaultId, req.query.vaultId));
  } else {
    conditions.push(eq(expenses.userId, req.user.id), sql`${expenses.vaultId} IS NULL`);
  }

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

  return new ApiResponse(200, paginatedData, 'Expenses retrieved successfully').send(res);
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
    return next(new AppError(404, 'Expense not found'));
  }

  return new ApiResponse(200, expense, 'Expense retrieved successfully').send(res);
}));

// @route   POST /api/expenses
// @desc    Create new expense
// @access  Private
router.post(
  "/",
  protect,
  guardExpenseCreation(), // Security guard middleware
  securityInterceptor(),
  [
    body("amount").isFloat({ min: 0.01 }),
    body("description").trim().isLength({ min: 1, max: 200 }),
    body("category").notEmpty(), // Assuming validation checks ID format if strictly needed
    body("date").optional().isISO8601(),
  ],
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new AppError(400, "Validation failed", errors.array()));
    }

    const {
      amount,
      description,
      category,
      vaultId,
      date,
      paymentMethod,
      location,
      tags,
      isRecurring,
      recurringPattern,
      notes,
      subcategory,
      currency = 'USD',
    } = req.body;

    // Verify category (If personal, must be owned by user. If vault, should we allow shared categories? For now, user's categories are personal)
    const [categoryDoc] = await db
      .select()
      .from(categories)
      .where(
        and(eq(categories.id, category), eq(categories.userId, req.user.id))
      );

    if (!categoryDoc) {
      return next(new AppError(400, "Invalid category"));
    }

    // Verify vault access if provided
    if (vaultId) {
      const [membership] = await db
        .select()
        .from(vaultMembers)
        .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, req.user.id)));

      if (!membership) {
        return next(new AppError(403, "Access denied to the specified vault"));
      }
    }

    const [newExpense] = await db
      .insert(expenses)
      .values({
        userId: req.user.id,
        amount: amount.toString(),
        description,
        categoryId: category,
        vaultId: vaultId || null,
        date: date ? new Date(date) : new Date(),
        paymentMethod: paymentMethod || "other",
        location,
        tags: tags || [],
        isRecurring: isRecurring || false,
        recurringPattern,
        notes,
        subcategory,
        currency,
      })
      .returning();

    // Side effects are now handled asynchronously via the Event Bus
    eventBus.emit('EXPENSE_CREATED', {
      ...newExpense,
      splitDetails: req.body.splitDetails,
      paidById: req.body.paidById || req.user.id
    });

    const expenseWithCategory = await db.query.expenses.findFirst({
      where: eq(expenses.id, newExpense.id),
      with: {
        category: { columns: { name: true, color: true, icon: true } },
      },
    });

    return new ApiResponse(201, expenseWithCategory, "Expense created successfully").send(res);
  }));


// @route   PUT /api/expenses/:id
// @desc    Update expense
// @access  Private
router.put("/:id", protect, checkOwnership("Expense"), securityInterceptor(), asyncHandler(async (req, res, next) => {
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
    if (!cat) {
      return next(new AppError(400, "Invalid category"));
    }
    updateData.categoryId = category;
  }
  if (date !== undefined) updateData.date = new Date(date);
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

  // Emit update event
  eventBus.emit('EXPENSE_UPDATED', {
    ...updatedExpense,
    oldCategoryId: oldExpense.categoryId
  });

  const result = await db.query.expenses.findFirst({
    where: eq(expenses.id, updatedExpense.id),
    with: { category: { columns: { name: true, color: true, icon: true } } },
  });

  return new ApiResponse(200, result, "Expense updated successfully").send(res);
}));

// @route   DELETE /api/expenses/:id
// @desc    Delete expense
// @access  Private
router.delete("/:id", protect, checkOwnership("Expense"), securityInterceptor(), asyncHandler(async (req, res, next) => {
  const expense = req.resource;
  await db.delete(expenses).where(eq(expenses.id, req.params.id));

  // Emit deletion event
  eventBus.emit('EXPENSE_DELETED', expense);

  return new ApiResponse(200, null, "Expense deleted successfully").send(res);
}));

// @route   POST /api/expenses/import
// @desc    Import expenses from CSV data
// @access  Private
router.post("/import", protect, auditBulkOperation('EXPENSE_IMPORT', 'expense'), asyncHandler(async (req, res, next) => {
  const { expenses: expensesData } = req.body;

  if (!expensesData || !Array.isArray(expensesData)) {
    return next(new AppError(400, "Invalid request: expenses array is required"));
  }

  const errors = [];
  const validExpenses = [];

  // Validate and prepare expenses
  for (let i = 0; i < expensesData.length; i++) {
    const expense = expensesData[i];
    const rowNumber = i + 1;

    // Using a nested try-catch here is acceptable for row-level validation if we want to continue, 
    // but we'll adapt it to avoid manual res.status calls.
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
  }

  if (validExpenses.length === 0) {
    return next(new AppError(400, "No valid expenses to import", errors));
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

  // Update category stats handled via events/listeners now

  return new ApiResponse(201, {
    imported: insertedExpenses.length,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
  }, `Successfully imported ${insertedExpenses.length} expenses`).send(res);
}));

// @route   GET /api/expenses/stats/summary
// @desc    Get expense summary statistics
// @access  Private
router.get("/stats/summary", protect, asyncHandler(async (req, res, next) => {
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

  const data = {
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
  };

  return new ApiResponse(200, data, "Expense statistics retrieved successfully").send(res);
}));

// @route   GET /api/expenses/recurring/status
// @desc    Get recurring expense job status
// @access  Private
router.get("/recurring/status", protect, asyncHandler(async (req, res, next) => {
  const status = getJobStatus();
  return new ApiResponse(200, { status }, "Recurring expense job status retrieved successfully").send(res);
}));

// @route   POST /api/expenses/recurring/execute
// @desc    Manually trigger recurring expense execution
// @access  Private (admin only in production)
router.post("/recurring/execute", protect, asyncHandler(async (req, res, next) => {
  console.log(`Manual recurring execution triggered by user: ${req.user.id}`);
  const results = await runManualExecution();

  // Log the manual execution
  logAudit(req, {
    userId: req.user.id,
    action: 'RECURRING_MANUAL_EXECUTE',
    resourceType: ResourceTypes.EXPENSE,
    metadata: {
      processed: results?.processed || 0,
      created: results?.created || 0,
      failed: results?.failed || 0,
    },
    status: results ? 'success' : 'failure',
  });

  return new ApiResponse(200, results, "Recurring expense execution completed").send(res);
}));

// @route   PUT /api/expenses/:id/recurring
// @desc    Update recurring settings for an expense
// @access  Private
router.put("/:id/recurring", protect, checkOwnership("Expense"), asyncHandler(async (req, res, next) => {
  const { isRecurring, recurringPattern } = req.body;
  const expenseId = req.params.id;

  if (isRecurring && recurringPattern) {
    // Enable/update recurring
    await db
      .update(expenses)
      .set({
        isRecurring: true,
        recurringPattern,
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, expenseId));

    // Initialize the next execution date
    const nextDate = await initializeRecurringExpense(expenseId, recurringPattern);

    return new ApiResponse(200, { nextExecutionDate: nextDate }, "Recurring settings updated").send(res);
  } else {
    // Disable recurring
    await disableRecurring(expenseId);

    return new ApiResponse(200, null, "Recurring disabled for this expense").send(res);
  }
}));

// @route   GET /api/expenses/recurring/list
// @desc    Get all recurring expenses for the user
// @access  Private
router.get("/recurring/list", protect, asyncHandler(async (req, res, next) => {
  const recurringExpenses = await db.query.expenses.findMany({
    where: and(
      eq(expenses.userId, req.user.id),
      eq(expenses.isRecurring, true)
    ),
    orderBy: [asc(expenses.nextExecutionDate)],
    with: {
      category: {
        columns: { name: true, color: true, icon: true },
      },
    },
  });

  return new ApiResponse(200, recurringExpenses, "Recurring expenses retrieved successfully").send(res);
}));

/**
 * POST /api/expenses/categorize
 * Bulk categorize expenses using ML
 */
router.post('/categorize', protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { expenseIds, autoApply = true } = req.body;

  if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
    return next(new AppError(400, "expenseIds array is required and must not be empty"));
  }

  if (expenseIds.length > 100) {
    return next(new AppError(400, "Cannot categorize more than 100 expenses at once"));
  }

  const results = await bulkCategorizeExpenses(userId, expenseIds);

  // Log audit event
  await logAuditEventAsync({
    userId,
    action: AuditActions.EXPENSE_UPDATE,
    resourceType: ResourceTypes.EXPENSE,
    resourceId: null, // Bulk operation
    metadata: {
      bulkCategorization: true,
      expenseCount: expenseIds.length,
      appliedCount: results.filter(r => r.applied).length,
      autoApply
    },
    status: 'success',
    ipAddress: req.ip,
    userAgent: req.get('User-Agent')
  });

  return new ApiResponse(200, {
    results,
    summary: {
      total: results.length,
      applied: results.filter(r => r.applied).length,
      skipped: results.filter(r => !r.applied).length
    }
  }, "Bulk categorization completed").send(res);
}));

/**
 * POST /api/expenses/train-model
 * Train the categorization model for the user
 */
router.post('/train-model', protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;

  const result = await trainCategorizationModel(userId);

  if (result.success) {
    // Log audit event
    await logAuditEventAsync({
      userId,
      action: 'MODEL_TRAIN',
      resourceType: 'AI_MODEL',
      resourceId: null,
      metadata: {
        modelType: 'expense_categorization',
        trainingDataSize: result.status.trainingDataSize,
        categoriesCount: result.status.categoriesCount
      },
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return new ApiResponse(200, result.status, 'Model trained successfully').send(res);
  } else {
    return next(new AppError(400, result.error || 'Failed to train model'));
  }
}));

/**
 * POST /api/expenses/retrain-model
 * Retrain the model with user corrections
 */
router.post('/retrain-model', protect, asyncHandler(async (req, res, next) => {
  const userId = req.user.id;
  const { corrections } = req.body;

  if (!corrections || !Array.isArray(corrections)) {
    return next(new AppError(400, "corrections array is required"));
  }

  const result = await retrainWithCorrections(userId, corrections);

  if (result.success) {
    // Log audit event
    await logAuditEventAsync({
      userId,
      action: 'MODEL_RETRAIN',
      resourceType: 'AI_MODEL',
      resourceId: null,
      metadata: {
        modelType: 'expense_categorization',
        correctionsCount: corrections.length,
        trainingDataSize: result.status.trainingDataSize
      },
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    return new ApiResponse(200, result.status, 'Model retrained successfully with corrections').send(res);
  } else {
    return next(new AppError(400, result.error || 'Failed to retrain model'));
  }
}));

/**
 * POST /api/expenses/upload-receipt
 * Upload and process receipt image for OCR and auto-categorization
 */
router.post('/upload-receipt', async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if file was uploaded
    if (!req.files || !req.files.receipt) {
      return res.status(400).json({
        error: 'No receipt image uploaded'
      });
    }

    const receiptFile = req.files.receipt;

    // Validate image
    if (!receiptService.validateImage(receiptFile.data)) {
      return res.status(400).json({
        error: 'Invalid image file. Please upload a valid image under 10MB.'
      });
    }

    // Process receipt
    const processedData = await receiptService.processReceipt(receiptFile.data, userId);

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: 'RECEIPT_UPLOAD',
      resourceType: 'RECEIPT',
      resourceId: null,
      metadata: {
        fileName: receiptFile.name,
        fileSize: receiptFile.size,
        extractedAmount: processedData.amount,
        extractedMerchant: processedData.merchant,
        suggestedCategory: processedData.suggestedCategory
      },
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      data: processedData,
      message: 'Receipt processed successfully'
    });
  } catch (error) {
    console.error('Error uploading receipt:', error);

    // Log failed audit event
    await logAuditEventAsync({
      userId: req.user.id,
      action: 'RECEIPT_UPLOAD',
      resourceType: 'RECEIPT',
      resourceId: null,
      metadata: {
        error: error.message
      },
      status: 'failure',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ error: 'Failed to process receipt' });
  }
});

export default router;
import { initializeRecurringExpense, disableRecurring } from "../services/expenseService.js";
import { getJobStatus, runManualExecution } from "../jobs/recurringExecution.js";
import express from "express";
import { body, validationResult } from "express-validator";
import { eq, and, gte, lte, asc, desc, sql, like } from "drizzle-orm";
import db from "../config/db.js";
import { expenses, categories, users, vaultMembers, subscriptions } from "../db/schema.js";
import { protect, checkOwnership } from "../middleware/auth.js";
import { checkVaultAccess } from "../middleware/vaultAuth.js";
import { asyncHandler, ValidationError, NotFoundError, ForbiddenError } from "../middleware/errorHandler.js";
import { parseListQuery } from "../utils/pagination.js";
import { securityInterceptor, auditBulkOperation } from "../middleware/auditMiddleware.js";
import { logAudit, AuditActions, ResourceTypes } from "../services/auditService.js";
import { guardExpenseCreation } from "../middleware/securityGuard.js";
import eventBus from "../events/eventBus.js";

// Side-effects like updateCategoryStats, monitorBudget, matchSubscription 
// are now handled by event listeners in ../listeners/

const router = express.Router();

// Helper to update category stats removed - now handled by categoryListener via 'EXPENSE_CREATED' event

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

  const conditions = [];

  // Default to personal expenses if no vaultId provided
  if (req.query.vaultId) {
    // Check if user is member of the vault
    const [membership] = await db
      .select()
      .from(vaultMembers)
      .where(and(eq(vaultMembers.vaultId, req.query.vaultId), eq(vaultMembers.userId, req.user.id)));

    if (!membership) {
      throw new ForbiddenError('You do not have access to this vault');
    }
    conditions.push(eq(expenses.vaultId, req.query.vaultId));
  } else {
    conditions.push(eq(expenses.userId, req.user.id), sql`${expenses.vaultId} IS NULL`);
  }

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
  guardExpenseCreation(), // Security guard middleware
  securityInterceptor(),
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
        vaultId,
        date,
        paymentMethod,
        location,
        tags,
        isRecurring,
        recurringPattern,
        notes,
        subcategory,
        currency = 'USD',
      } = req.body;

      // Verify category (If personal, must be owned by user. If vault, should we allow shared categories? For now, user's categories are personal)
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

      // Verify vault access if provided
      if (vaultId) {
        const [membership] = await db
          .select()
          .from(vaultMembers)
          .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, req.user.id)));

        if (!membership) {
          return res.status(403).json({ success: false, message: "Access denied to the specified vault" });
        }
      }

      const [newExpense] = await db
        .insert(expenses)
        .values({
          userId: req.user.id,
          amount: amount.toString(),
          description,
          categoryId: category,
          vaultId: vaultId || null,
          date: date ? new Date(date) : new Date(),
          paymentMethod: paymentMethod || "other",
          location,
          tags: tags || [],
          isRecurring: isRecurring || false,
          recurringPattern,
          notes,
          subcategory,
          currency,
        })
        .returning();

      // Side effects are now handled asynchronously via the Event Bus
      eventBus.emit('EXPENSE_CREATED', {
        ...newExpense,
        splitDetails: req.body.splitDetails,
        paidById: req.body.paidById || req.user.id
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
router.put("/:id", protect, checkOwnership("Expense"), securityInterceptor(), async (req, res) => {
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

    // Emit update event
    eventBus.emit('EXPENSE_UPDATED', {
      ...updatedExpense,
      oldCategoryId: oldExpense.categoryId
    });

    // Audit logging handled by securityInterceptor middleware


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
router.delete("/:id", protect, checkOwnership("Expense"), securityInterceptor(), async (req, res) => {
  try {
    const expense = req.resource;
    await db.delete(expenses).where(eq(expenses.id, req.params.id));

    // Emit deletion event
    eventBus.emit('EXPENSE_DELETED', expense);

    // Audit logging handled by securityInterceptor middleware


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
router.post("/import", protect, auditBulkOperation('EXPENSE_IMPORT', 'expense'), async (req, res) => {
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

// @route   GET /api/expenses/recurring/status
// @desc    Get recurring expense job status
// @access  Private
router.get("/recurring/status", protect, async (req, res) => {
  try {
    const status = getJobStatus();
    res.json({
      success: true,
      data: { status },
    });
  } catch (error) {
    console.error("Get recurring status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching recurring job status",
    });
  }
});

// @route   POST /api/expenses/recurring/execute
// @desc    Manually trigger recurring expense execution
// @access  Private (admin only in production)
router.post("/recurring/execute", protect, async (req, res) => {
  try {
    console.log(`Manual recurring execution triggered by user: ${req.user.id}`);
    const results = await runManualExecution();

    // Log the manual execution
    logAudit(req, {
      userId: req.user.id,
      action: 'RECURRING_MANUAL_EXECUTE',
      resourceType: ResourceTypes.EXPENSE,
      metadata: {
        processed: results?.processed || 0,
        created: results?.created || 0,
        failed: results?.failed || 0,
      },
      status: results ? 'success' : 'failure',
    });

    res.json({
      success: true,
      message: "Recurring expense execution completed",
      data: { results },
    });
  } catch (error) {
    console.error("Manual recurring execution error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during recurring expense execution",
    });
  }
});

// @route   PUT /api/expenses/:id/recurring
// @desc    Update recurring settings for an expense
// @access  Private
router.put("/:id/recurring", protect, checkOwnership("Expense"), async (req, res) => {
  try {
    const { isRecurring, recurringPattern } = req.body;
    const expenseId = req.params.id;

    if (isRecurring && recurringPattern) {
      // Enable/update recurring
      await db
        .update(expenses)
        .set({
          isRecurring: true,
          recurringPattern,
          updatedAt: new Date(),
        })
        .where(eq(expenses.id, expenseId));

      // Initialize the next execution date
      const nextDate = await initializeRecurringExpense(expenseId, recurringPattern);

      res.json({
        success: true,
        message: "Recurring settings updated",
        data: { nextExecutionDate: nextDate },
      });
    } else {
      // Disable recurring
      await disableRecurring(expenseId);

      res.json({
        success: true,
        message: "Recurring disabled for this expense",
      });
    }
  } catch (error) {
    console.error("Update recurring error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating recurring settings",
    });
  }
});

// @route   GET /api/expenses/recurring/list
// @desc    Get all recurring expenses for the user
// @access  Private
router.get("/recurring/list", protect, async (req, res) => {
  try {
    const recurringExpenses = await db.query.expenses.findMany({
      where: and(
        eq(expenses.userId, req.user.id),
        eq(expenses.isRecurring, true)
      ),
      orderBy: [asc(expenses.nextExecutionDate)],
      with: {
        category: {
          columns: { name: true, color: true, icon: true },
        },
      },
    });

    res.json({
      success: true,
      data: { expenses: recurringExpenses },
    });
  } catch (error) {
    console.error("Get recurring expenses error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching recurring expenses",
    });
  }
});

/**
 * POST /api/expenses/categorize
 * Bulk categorize expenses using ML
 */
router.post('/categorize', async (req, res) => {
  try {
    const userId = req.user.id;
    const { expenseIds, autoApply = true } = req.body;

    if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
      return res.status(400).json({
        error: 'expenseIds array is required and must not be empty'
      });
    }

    // Limit bulk categorization to prevent abuse
    if (expenseIds.length > 100) {
      return res.status(400).json({
        error: 'Cannot categorize more than 100 expenses at once'
      });
    }

    const results = await bulkCategorizeExpenses(userId, expenseIds);

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.EXPENSE_UPDATE,
      resourceType: ResourceTypes.EXPENSE,
      resourceId: null, // Bulk operation
      metadata: {
        bulkCategorization: true,
        expenseCount: expenseIds.length,
        appliedCount: results.filter(r => r.applied).length,
        autoApply
      },
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      data: {
        results,
        summary: {
          total: results.length,
          applied: results.filter(r => r.applied).length,
          skipped: results.filter(r => !r.applied).length
        }
      }
    });
  } catch (error) {
    console.error('Error in bulk categorization:', error);

    // Log failed audit event
    await logAuditEventAsync({
      userId: req.user.id,
      action: AuditActions.EXPENSE_UPDATE,
      resourceType: ResourceTypes.EXPENSE,
      metadata: {
        bulkCategorization: true,
        error: error.message
      },
      status: 'failure',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ error: 'Failed to categorize expenses' });
  }
});

/**
 * POST /api/expenses/train-model
 * Train the categorization model for the user
 */
router.post('/train-model', async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await trainCategorizationModel(userId);

    if (result.success) {
      // Log audit event
      await logAuditEventAsync({
        userId,
        action: 'MODEL_TRAIN',
        resourceType: 'AI_MODEL',
        resourceId: null,
        metadata: {
          modelType: 'expense_categorization',
          trainingDataSize: result.status.trainingDataSize,
          categoriesCount: result.status.categoriesCount
        },
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        data: result.status,
        message: 'Model trained successfully'
      });
    } else {
      res.status(400).json({
        error: result.error,
        message: 'Failed to train model'
      });
    }
  } catch (error) {
    console.error('Error training model:', error);
    res.status(500).json({ error: 'Failed to train categorization model' });
  }
});

/**
 * POST /api/expenses/retrain-model
 * Retrain the model with user corrections
 */
router.post('/retrain-model', async (req, res) => {
  try {
    const userId = req.user.id;
    const { corrections } = req.body;

    if (!corrections || !Array.isArray(corrections)) {
      return res.status(400).json({
        error: 'corrections array is required'
      });
    }

    const result = await retrainWithCorrections(userId, corrections);

    if (result.success) {
      // Log audit event
      await logAuditEventAsync({
        userId,
        action: 'MODEL_RETRAIN',
        resourceType: 'AI_MODEL',
        resourceId: null,
        metadata: {
          modelType: 'expense_categorization',
          correctionsCount: corrections.length,
          trainingDataSize: result.status.trainingDataSize
        },
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        data: result.status,
        message: 'Model retrained successfully with corrections'
      });
    } else {
      res.status(400).json({
        error: result.error,
        message: 'Failed to retrain model'
      });
    }
  } catch (error) {
    console.error('Error retraining model:', error);
    res.status(500).json({ error: 'Failed to retrain categorization model' });
  }
});

/**
 * POST /api/expenses/upload-receipt
 * Upload and process receipt image for OCR and auto-categorization
 */
router.post('/upload-receipt', async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if file was uploaded
    if (!req.files || !req.files.receipt) {
      return res.status(400).json({
        error: 'No receipt image uploaded'
      });
    }

    const receiptFile = req.files.receipt;

    // Validate image
    if (!receiptService.validateImage(receiptFile.data)) {
      return res.status(400).json({
        error: 'Invalid image file. Please upload a valid image under 10MB.'
      });
    }

    // Process receipt
    const processedData = await receiptService.processReceipt(receiptFile.data, userId);

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: 'RECEIPT_UPLOAD',
      resourceType: 'RECEIPT',
      resourceId: null,
      metadata: {
        fileName: receiptFile.name,
        fileSize: receiptFile.size,
        extractedAmount: processedData.amount,
        extractedMerchant: processedData.merchant,
        suggestedCategory: processedData.suggestedCategory
      },
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      data: processedData,
      message: 'Receipt processed successfully'
    });
  } catch (error) {
    console.error('Error uploading receipt:', error);

    // Log failed audit event
    await logAuditEventAsync({
      userId: req.user.id,
      action: 'RECEIPT_UPLOAD',
      resourceType: 'RECEIPT',
      resourceId: null,
      metadata: {
        error: error.message
      },
      status: 'failure',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ error: 'Failed to process receipt' });
  }
});

export default router;
