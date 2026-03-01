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
import cacheService from "../services/cacheService.js";
import { routeCache, cacheInvalidation } from "../middleware/cache.js";
import { executeQuery } from "../utils/queryOptimization.js";
import { trackQuery } from "../utils/queryPerformanceTracker.js";
import sagaCoordinator from "../services/sagaCoordinator.js";
import distributedTransactionService from "../services/distributedTransactionService.js";

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
router.get("/", protect, routeCache.list('expenses', cacheService.TTL.SHORT), asyncHandler(async (req, res) => {
  const queryOptions = {
    allowedSortFields: ['date', 'amount', 'createdAt'],
    defaultSortField: 'date',
    allowedFilters: ['category', 'paymentMethod', 'status'],
    maxLimit: 100,
  };

  const { pagination, sorting, search, filters, dateRange } = parseListQuery(req.query, queryOptions);
  
  // Generate cache key
  const cacheKey = cacheService.cacheKeys.expensesList(req.user.id, {
    ...filters,
    ...pagination,
    ...sorting,
    search: search.search,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });
  
  // Try to get from cache
  const cachedResult = await cacheService.get(cacheKey);
  if (cachedResult) {
    return res.paginated(cachedResult.items, cachedResult.pagination, 'Expenses retrieved successfully (cached)');
  }
  
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

  // Execute query with performance tracking
  const [expensesList, countResult] = await executeQuery(async () => {
    return await trackQuery('expenses.list', { userId: req.user.id })(async () => {
      return await Promise.all([
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
    });
  }, 'expenses.list');

  const total = Number(countResult[0]?.count || 0);
  const paginatedData = req.buildPaginatedResponse(expensesList, total);

  // Cache the result
  await cacheService.set(cacheKey, paginatedData, cacheService.TTL.SHORT);

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
  securityGuard, // Security guard middleware
  liquidityGuard, // Predictive liquidity check
  riskInterceptor, // Black-swan protection
  enforceInstitutionalGovernance, // Multi-Sig Resolution protocol
  securityInterceptor(),
  [
    body("amount").isFloat({ min: 0.01 }),
    body("description").trim().isLength({ min: 1, max: 200 }),
    body("category").notEmpty(), // Assuming validation checks ID format if strictly needed
    body("date").optional().isISO8601(),
  ],
  async (req, res) => {
    let txLog = null;
    let operationKey = null;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return res.status(400).json({ success: false, errors: errors.array() });

      const idempotencyKey = req.headers["idempotency-key"];

      if (!idempotencyKey || String(idempotencyKey).trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Idempotency-Key header is required for financial operations",
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
        subcategory,
      } = req.body;

      operationKey = distributedTransactionService.buildOperationKey({
        tenantId: req.user.tenantId || req.user.id,
        userId: req.user.id,
        operation: "expense.create",
        idempotencyKey: String(idempotencyKey).trim(),
      });

      const idempotencyLock = await distributedTransactionService.acquireIdempotencyLock({
        tenantId: req.user.tenantId || req.user.id,
        userId: req.user.id,
        operation: "expense.create",
        operationKey,
        requestPayload: req.body,
        resourceType: "expense",
      });

      if (!idempotencyLock.acquired) {
        if (idempotencyLock.reason === "replay") {
          res.setHeader("Idempotent-Replay", "true");
          return res.status(idempotencyLock.record.responseCode || 200).json(
            idempotencyLock.record.responseBody || {
              success: true,
              message: "Request replayed from idempotency store",
            }
          );
        }

        if (idempotencyLock.reason === "in_progress") {
          return res.status(409).json({
            success: false,
            message: "An operation with this idempotency key is already in progress",
          });
        }

        return res.status(409).json({
          success: false,
          message: "Idempotency key reuse with different payload is not allowed",
        });
      }

      txLog = await distributedTransactionService.startDistributedTransaction({
        tenantId: req.user.tenantId || req.user.id,
        userId: req.user.id,
        transactionType: "financial_expense_create",
        operationKey,
        payload: {
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
        },
        timeoutMs: 30000,
      });

      await distributedTransactionService.markPrepared({ txLogId: txLog.id });

      // Verify category with tracking
      const [categoryDoc] = await trackQuery('expenses.verifyCategory', { userId: req.user.id })(async () => {
        return await db
          .select()
          .from(categories)
          .where(
            and(eq(categories.id, category), eq(categories.userId, req.user.id))
          );
      });

      if (!categoryDoc) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid category" });
      }

      const sagaResult = await trackQuery('expenses.create', { userId: req.user.id })(async () => {
        return await sagaCoordinator.startSaga({
          sagaType: 'financial_expense_operation',
          tenantId: req.user.tenantId || req.user.id,
          payload: {
            tenantId: req.user.tenantId || req.user.id,
            userId: req.user.id,
            amount,
            description,
            categoryId: category,
            date: date ? new Date(date).toISOString() : new Date().toISOString(),
            paymentMethod,
            location,
            tags,
            isRecurring,
            recurringPattern,
            notes,
            subcategory,
            idempotencyKey,
            operationKey,
          },
          executeAsync: false,
          timeoutMs: 25000,
        });
      });

      if (!sagaResult || sagaResult.status !== 'completed') {
        throw new Error(sagaResult?.error || 'Financial operation saga failed');
      }

      const createdExpenseId = sagaResult.stepResults?.[0]?.expenseId;

      if (!createdExpenseId) {
        throw new Error('Saga completed without expense id');
      }

      // Update category stats (async, don't block response necessarily, but good to wait)
      await updateCategoryStats(category);

      const expenseWithCategory = await db.query.expenses.findFirst({
        where: eq(expenses.id, createdExpenseId),
        with: {
          category: { columns: { name: true, color: true, icon: true } },
        },
      });

      await distributedTransactionService.commitDistributedTransaction({
        txLogId: txLog.id,
        result: {
          sagaId: sagaResult.id,
          expenseId: createdExpenseId,
        },
      });

      const responseBody = {
        success: true,
        message: "Expense created successfully",
        data: { expense: expenseWithCategory },
      };

      await distributedTransactionService.completeIdempotency({
        operationKey,
        statusCode: 201,
        responseBody,
        resourceType: "expense",
        resourceId: createdExpenseId,
      });

      // Invalidate caches
      await cacheService.invalidateExpenseCache(req.user.id, req.user.tenantId || req.user.id, createdExpenseId);

      res.status(201).json(responseBody);
    } catch (error) {
      if (txLog?.id) {
        await distributedTransactionService.markFailedTransaction({
          txLogId: txLog.id,
          errorMessage: error.message,
        });
      }

      if (operationKey) {
        await distributedTransactionService.failIdempotency({
          operationKey,
          statusCode: error.message?.toLowerCase().includes('timed out') ? 504 : 500,
          responseBody: {
            success: false,
            message: error.message?.toLowerCase().includes('timed out')
              ? "Financial operation timed out; reconciliation will verify final state"
              : "Server error while creating expense",
          },
          reason: error.message,
        });
      }

      console.error("Create expense error:", error);
      const timeout = error.message?.toLowerCase().includes('timed out');
      res.status(timeout ? 504 : 500).json({
        success: false,
        message: timeout
          ? "Financial operation timed out; reconciliation will verify final state"
          : "Server error while creating expense",
      });
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

    // ─── Feature #460: Tax-Lot Disposal ───
    try {
      const currencyToClose = currency || 'USD';
      const inv = await fxEngine.getOrCreateCurrencyInvestment(req.user.id, currencyToClose, vaultId);
      const usdRate = await currencyService.getExchangeRate(currencyToClose, 'USD');

      await taxLotService.closeLots(req.user.id, {
        investmentId: inv.id,
        unitsSold: amount,
        salePrice: usdRate,
        method: 'HIFO' // Default to HIFO for tax optimization
      });
      logInfo(`[Expenses] Closed currency lots for ${amount} ${currencyToClose}`);
    } catch (lotError) {
      logWarn(`[Expenses] Tax-lot closure failed (non-blocking): ${lotError.message}`);
    }

    // Side effects are now handled asynchronously via the Event Bus
    eventBus.emit('EXPENSE_CREATED', {
      ...newExpense,
      splitDetails: req.body.splitDetails,
      paidById: req.body.paidById || req.user.id
    });

    // Autopilot signal: feed expense total into workflow evaluation
    signalAutopilot(req, 'EXPENSE_CREATED', { amount: parseFloat(amount), categoryId: category, vaultId: vaultId || null });

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

    // Invalidate caches
    await cacheService.invalidateExpenseCache(req.user.id, req.user.tenantId || req.user.id, req.params.id);

    res.json({ success: true, message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Delete expense error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while deleting expense" });
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

    // Generate cache key for stats
    const cacheKey = cacheService.cacheKeys.analytics(req.user.id, 'expenseSummary', `${start.toISOString()}-${end.toISOString()}`);
    
    // Try to get from cache
    const result = await cacheService.cacheQuery(cacheKey, async () => {
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

      return {
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
    }, cacheService.TTL.ANALYTICS);

    res.json({
      success: true,
      data: result,
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
