import express from 'express';
import { eq, and, desc, asc, gte, lte, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { expenses, categories, users } from '../db/schema.js';
import { authenticateToken } from '../middleware/auth.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from '../services/auditService.js';
import budgetEngine from '../services/budgetEngine.js';
import { initializeRecurringExpense, disableRecurring, processRoundUpAfterExpenseCreation } from '../services/expenseService.js';
import { getJobStatus, runManualExecution } from '../jobs/recurringExecution.js';
import savingsService from '../services/savingsService.js';
import financialHealthService from '../services/financialHealthService.js';
import receiptService from '../services/receiptService.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/expenses
 * Get all expenses for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 20,
      category,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      sortBy = 'date',
      sortOrder = 'desc',
      search
    } = req.query;

    const offset = (page - 1) * limit;

    // Build where conditions
    let whereConditions = [eq(expenses.userId, userId)];

    if (category) {
      whereConditions.push(eq(expenses.categoryId, category));
    }

    if (startDate) {
      whereConditions.push(gte(expenses.date, new Date(startDate)));
    }

    if (endDate) {
      whereConditions.push(lte(expenses.date, new Date(endDate)));
    }

    if (minAmount) {
      whereConditions.push(gte(expenses.amount, minAmount));
    }

    if (maxAmount) {
      whereConditions.push(lte(expenses.amount, maxAmount));
    }

    if (search) {
      whereConditions.push(sql`${expenses.description} ILIKE ${`%${search}%`}`);
    }

    // Build order by
    const orderBy = sortOrder === 'asc' ? asc(expenses[sortBy]) : desc(expenses[sortBy]);

    // Get expenses with category information
    const expensesList = await db
      .select({
        id: expenses.id,
        amount: expenses.amount,
        currency: expenses.currency,
        description: expenses.description,
        date: expenses.date,
        paymentMethod: expenses.paymentMethod,
        location: expenses.location,
        tags: expenses.tags,
        isRecurring: expenses.isRecurring,
        recurringPattern: expenses.recurringPattern,
        nextExecutionDate: expenses.nextExecutionDate,
        status: expenses.status,
        notes: expenses.notes,
        category: {
          id: categories.id,
          name: categories.name,
          color: categories.color,
          icon: categories.icon
        },
        createdAt: expenses.createdAt,
        updatedAt: expenses.updatedAt
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(and(...whereConditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const totalCount = await db
      .select({ count: sql`count(*)` })
      .from(expenses)
      .where(and(...whereConditions));

    res.json({
      data: expensesList,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(totalCount[0].count),
        pages: Math.ceil(totalCount[0].count / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

/**
 * POST /api/expenses
 * Create a new expense
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      categoryId,
      amount,
      currency,
      description,
      date,
      paymentMethod,
      location,
      tags,
      isRecurring,
      recurringPattern,
      notes
    } = req.body;

    // Validate required fields
    if (!categoryId || !amount || !description) {
      return res.status(400).json({
        error: 'Missing required fields: categoryId, amount, description'
      });
    }

    // Create the expense
    const [newExpense] = await db
      .insert(expenses)
      .values({
        userId,
        categoryId,
        amount: parseFloat(amount),
        currency: currency || 'USD',
        description,
        date: date ? new Date(date) : new Date(),
        paymentMethod: paymentMethod || 'cash',
        location,
        tags: tags || [],
        isRecurring: isRecurring || false,
        recurringPattern,
        status: 'completed',
        notes
      })
      .returning();

    // Initialize recurring expense if needed
    if (isRecurring && recurringPattern) {
      await initializeRecurringExpense(newExpense.id, recurringPattern);
    }

    // Process round-up savings
    const roundUpRecord = await processRoundUpAfterExpenseCreation(newExpense);

    // Update budget if applicable
    await budgetEngine.processExpense(newExpense);

    // Recalculate financial health score
    try {
      await financialHealthService.recalculateAndSaveScore(userId);
    } catch (scoreError) {
      console.error('Error recalculating financial health score after expense creation:', scoreError);
      // Don't fail the expense creation if score calculation fails
    }

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.EXPENSE_CREATE,
      resourceType: ResourceTypes.EXPENSE,
      resourceId: newExpense.id,
      metadata: {
        amount: newExpense.amount,
        description: newExpense.description,
        categoryId: newExpense.categoryId,
        roundUpProcessed: !!roundUpRecord
      },
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      data: newExpense,
      roundUp: roundUpRecord
    });
  } catch (error) {
    console.error('Error creating expense:', error);

    // Log failed audit event
    await logAuditEventAsync({
      userId: req.user.id,
      action: AuditActions.EXPENSE_CREATE,
      resourceType: ResourceTypes.EXPENSE,
      metadata: {
        amount: req.body.amount,
        description: req.body.description,
        error: error.message
      },
      status: 'failure',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({ error: 'Failed to create expense' });
  }
});

/**
 * GET /api/expenses/:id
 * Get a specific expense by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const expenseId = req.params.id;

    const expenseList = await db
      .select({
        id: expenses.id,
        amount: expenses.amount,
        currency: expenses.currency,
        description: expenses.description,
        date: expenses.date,
        paymentMethod: expenses.paymentMethod,
        location: expenses.location,
        tags: expenses.tags,
        isRecurring: expenses.isRecurring,
        recurringPattern: expenses.recurringPattern,
        nextExecutionDate: expenses.nextExecutionDate,
        status: expenses.status,
        notes: expenses.notes,
        category: {
          id: categories.id,
          name: categories.name,
          color: categories.color,
          icon: categories.icon
        },
        createdAt: expenses.createdAt,
        updatedAt: expenses.updatedAt
      })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId)))
      .limit(1);

    if (expenseList.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json({ data: expenseList[0] });
  } catch (error) {
    console.error('Error fetching expense:', error);
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
});

/**
 * PUT /api/expenses/:id
 * Update an expense
 */
router.put('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const expenseId = req.params.id;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.userId;
    delete updates.createdAt;

    // Convert amount to number if provided
    if (updates.amount) {
      updates.amount = parseFloat(updates.amount);
    }

    // Convert date if provided
    if (updates.date) {
      updates.date = new Date(updates.date);
    }

    updates.updatedAt = new Date();

    // Handle recurring expense updates
    if (updates.isRecurring === false) {
      await disableRecurring(expenseId);
    } else if (updates.recurringPattern) {
      await initializeRecurringExpense(expenseId, updates.recurringPattern);
    }

    const [updatedExpense] = await db
      .update(expenses)
      .set(updates)
      .where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId)))
      .returning();

    if (!updatedExpense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.EXPENSE_UPDATE,
      resourceType: ResourceTypes.EXPENSE,
      resourceId: expenseId,
      metadata: updates,
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ data: updatedExpense });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

/**
 * DELETE /api/expenses/:id
 * Delete an expense
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id;
    const expenseId = req.params.id;

    // Get expense details before deletion for audit
    const expenseToDelete = await db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId)))
      .limit(1);

    if (expenseToDelete.length === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    // Delete the expense
    await db
      .delete(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.userId, userId)));

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.EXPENSE_DELETE,
      resourceType: ResourceTypes.EXPENSE,
      resourceId: expenseId,
      metadata: {
        amount: expenseToDelete[0].amount,
        description: expenseToDelete[0].description
      },
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

/**
 * GET /api/expenses/recurring/status
 * Get status of recurring expense processing
 */
router.get('/recurring/status', async (req, res) => {
  try {
    const status = await getJobStatus();
    res.json({ data: status });
  } catch (error) {
    console.error('Error getting recurring job status:', error);
    res.status(500).json({ error: 'Failed to get job status' });
  }
});

/**
 * POST /api/expenses/recurring/execute
 * Manually trigger recurring expense execution
 */
router.post('/recurring/execute', async (req, res) => {
  try {
    const result = await runManualExecution();
    res.json({ data: result });
  } catch (error) {
    console.error('Error executing recurring expenses:', error);
    res.status(500).json({ error: 'Failed to execute recurring expenses' });
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
