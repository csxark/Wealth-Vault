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
import voiceService from '../services/voiceService.js';

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
/ * * 
   *   P O S T   / a p i / e x p e n s e s / v o i c e 
   *   P r o c e s s   v o i c e   i n p u t   a n d   c r e a t e   e x p e n s e 
   * / 
 r o u t e r . p o s t ( " / v o i c e " ,   a s y n c   ( r e q ,   r e s )   = >   { 
     t r y   { 
         c o n s t   u s e r I d   =   r e q . u s e r . i d ; 
         c o n s t   {   t r a n s c r i p t ,   a u d i o F i l e   }   =   r e q . b o d y ; 
 
         i f   ( ! t r a n s c r i p t   & &   ! a u d i o F i l e )   { 
             r e t u r n   r e s . s t a t u s ( 4 0 0 ) . j s o n ( { 
                 e r r o r :   " E i t h e r   t r a n s c r i p t   o r   a u d i o F i l e   i s   r e q u i r e d " 
             } ) ; 
         } 
 
         l e t   p r o c e s s e d T r a n s c r i p t   =   t r a n s c r i p t ; 
         l e t   t e m p F i l e P a t h   =   n u l l ; 
 
         / /   I f   a u d i o   f i l e   i s   p r o v i d e d ,   t r a n s c r i b e   i t 
         i f   ( a u d i o F i l e )   { 
             t r y   { 
                 / /   S t o r e   t h e   a u d i o   f i l e   t e m p o r a r i l y 
                 t e m p F i l e P a t h   =   a w a i t   v o i c e S e r v i c e . s t o r e V o i c e R e c o r d i n g ( 
                     B u f f e r . f r o m ( a u d i o F i l e ,   " b a s e 6 4 " ) , 
                     " v o i c e _ i n p u t . w e b m " 
                 ) ; 
 
                 / /   T r a n s c r i b e   t h e   a u d i o 
                 p r o c e s s e d T r a n s c r i p t   =   a w a i t   v o i c e S e r v i c e . t r a n s c r i b e A u d i o ( t e m p F i l e P a t h ) ; 
             }   c a t c h   ( t r a n s c r i p t i o n E r r o r )   { 
                 c o n s o l e . e r r o r ( " T r a n s c r i p t i o n   e r r o r : " ,   t r a n s c r i p t i o n E r r o r ) ; 
                 r e t u r n   r e s . s t a t u s ( 4 0 0 ) . j s o n ( { 
                     e r r o r :   " F a i l e d   t o   t r a n s c r i b e   a u d i o .   P l e a s e   t r y   a g a i n   o r   p r o v i d e   t e x t   i n p u t . " 
                 } ) ; 
             } 
         } 
 
         / /   P r o c e s s   t h e   t r a n s c r i p t   w i t h   N L P 
         c o n s t   v o i c e R e s u l t   =   a w a i t   v o i c e S e r v i c e . p r o c e s s V o i c e E x p e n s e ( p r o c e s s e d T r a n s c r i p t ,   u s e r I d ) ; 
 
         i f   ( ! v o i c e R e s u l t . s u c c e s s )   { 
             / /   C l e a n   u p   t e m p   f i l e   i f   i t   e x i s t s 
             i f   ( t e m p F i l e P a t h )   { 
                 a w a i t   v o i c e S e r v i c e . d e l e t e V o i c e R e c o r d i n g ( t e m p F i l e P a t h ) ; 
             } 
 
             r e t u r n   r e s . s t a t u s ( 4 0 0 ) . j s o n ( { 
                 e r r o r :   " C o u l d   n o t   e x t r a c t   e x p e n s e   i n f o r m a t i o n   f r o m   v o i c e   i n p u t " , 
                 d e t a i l s :   v o i c e R e s u l t . e r r o r 
             } ) ; 
         } 
 
         c o n s t   e x t r a c t e d D a t a   =   v o i c e R e s u l t . d a t a ; 
 
         / /   V a l i d a t e   t h a t   w e   h a v e   m i n i m u m   r e q u i r e d   d a t a 
         i f   ( ! e x t r a c t e d D a t a . a m o u n t   | |   ! e x t r a c t e d D a t a . d e s c r i p t i o n )   { 
             / /   C l e a n   u p   t e m p   f i l e   i f   i t   e x i s t s 
             i f   ( t e m p F i l e P a t h )   { 
                 a w a i t   v o i c e S e r v i c e . d e l e t e V o i c e R e c o r d i n g ( t e m p F i l e P a t h ) ; 
             } 
 
             r e t u r n   r e s . s t a t u s ( 4 0 0 ) . j s o n ( { 
                 e r r o r :   " C o u l d   n o t   e x t r a c t   r e q u i r e d   e x p e n s e   i n f o r m a t i o n   ( a m o u n t   a n d   d e s c r i p t i o n )   f r o m   v o i c e   i n p u t " 
             } ) ; 
         } 
 
         / /   G e t   d e f a u l t   c a t e g o r y   I D   ( a s s u m i n g   " s a f e "   c a t e g o r y   e x i s t s ) 
         c o n s t   d e f a u l t C a t e g o r y   =   a w a i t   d b 
             . s e l e c t ( ) 
             . f r o m ( c a t e g o r i e s ) 
             . w h e r e ( s q l ` L O W E R ( $ { c a t e g o r i e s . n a m e } )   =   " s a f e   s p e n d i n g " ` ) 
             . l i m i t ( 1 ) ; 
 
         i f   ( d e f a u l t C a t e g o r y . l e n g t h   = = =   0 )   { 
             / /   C l e a n   u p   t e m p   f i l e   i f   i t   e x i s t s 
             i f   ( t e m p F i l e P a t h )   { 
                 a w a i t   v o i c e S e r v i c e . d e l e t e V o i c e R e c o r d i n g ( t e m p F i l e P a t h ) ; 
             } 
 
             r e t u r n   r e s . s t a t u s ( 5 0 0 ) . j s o n ( { 
                 e r r o r :   " D e f a u l t   c a t e g o r y   n o t   f o u n d .   P l e a s e   e n s u r e   c a t e g o r i e s   a r e   s e t   u p . " 
             } ) ; 
         } 
 
         / /   M a p   c a t e g o r y   s t r i n g   t o   c a t e g o r y   I D 
         l e t   c a t e g o r y I d   =   d e f a u l t C a t e g o r y [ 0 ] . i d ; 
         i f   ( e x t r a c t e d D a t a . c a t e g o r y )   { 
             c o n s t   c a t e g o r y M a p   =   { 
                 " s a f e " :   " s a f e   s p e n d i n g " , 
                 " i m p u l s i v e " :   " i m p u l s i v e   s p e n d i n g " , 
                 " a n x i o u s " :   " a n x i o u s   s p e n d i n g " 
             } ; 
 
             c o n s t   c a t e g o r y N a m e   =   c a t e g o r y M a p [ e x t r a c t e d D a t a . c a t e g o r y . t o L o w e r C a s e ( ) ] ; 
             i f   ( c a t e g o r y N a m e )   { 
                 c o n s t   c a t e g o r y R e s u l t   =   a w a i t   d b 
                     . s e l e c t ( ) 
                     . f r o m ( c a t e g o r i e s ) 
                     . w h e r e ( s q l ` L O W E R ( $ { c a t e g o r i e s . n a m e } )   =   $ { c a t e g o r y N a m e . t o L o w e r C a s e ( ) } ` ) 
                     . l i m i t ( 1 ) ; 
 
                 i f   ( c a t e g o r y R e s u l t . l e n g t h   >   0 )   { 
                     c a t e g o r y I d   =   c a t e g o r y R e s u l t [ 0 ] . i d ; 
                 } 
             } 
         } 
 
         / /   C r e a t e   t h e   e x p e n s e 
         c o n s t   [ n e w E x p e n s e ]   =   a w a i t   d b 
             . i n s e r t ( e x p e n s e s ) 
             . v a l u e s ( { 
                 u s e r I d , 
                 c a t e g o r y I d , 
                 a m o u n t :   e x t r a c t e d D a t a . a m o u n t , 
                 c u r r e n c y :   " I N R " ,   / /   D e f a u l t   t o   I N R ,   c o u l d   b e   m a d e   c o n f i g u r a b l e 
                 d e s c r i p t i o n :   e x t r a c t e d D a t a . d e s c r i p t i o n , 
                 d a t e :   e x t r a c t e d D a t a . d a t e   ?   n e w   D a t e ( e x t r a c t e d D a t a . d a t e )   :   n e w   D a t e ( ) , 
                 p a y m e n t M e t h o d :   e x t r a c t e d D a t a . p a y m e n t M e t h o d   | |   " c a r d " , 
                 l o c a t i o n :   e x t r a c t e d D a t a . l o c a t i o n   ?   {   n a m e :   e x t r a c t e d D a t a . l o c a t i o n   }   :   n u l l , 
                 t a g s :   e x t r a c t e d D a t a . t a g s   | |   [ ] , 
                 i s R e c u r r i n g :   f a l s e ,   / /   V o i c e   e x p e n s e s   a r e   t y p i c a l l y   o n e - t i m e 
                 s t a t u s :   " c o m p l e t e d " , 
                 n o t e s :   ` V o i c e   i n p u t :   $ { p r o c e s s e d T r a n s c r i p t } ` 
             } ) 
             . r e t u r n i n g ( ) ; 
 
         / /   C l e a n   u p   t e m p   f i l e 
         i f   ( t e m p F i l e P a t h )   { 
             a w a i t   v o i c e S e r v i c e . d e l e t e V o i c e R e c o r d i n g ( t e m p F i l e P a t h ) ; 
         } 
 
         / /   P r o c e s s   r o u n d - u p   s a v i n g s 
         c o n s t   r o u n d U p R e c o r d   =   a w a i t   p r o c e s s R o u n d U p A f t e r E x p e n s e C r e a t i o n ( n e w E x p e n s e ) ; 
 
         / /   U p d a t e   b u d g e t   i f   a p p l i c a b l e 
         a w a i t   b u d g e t E n g i n e . p r o c e s s E x p e n s e ( n e w E x p e n s e ) ; 
 
         / /   R e c a l c u l a t e   f i n a n c i a l   h e a l t h   s c o r e 
         t r y   { 
             a w a i t   f i n a n c i a l H e a l t h S e r v i c e . r e c a l c u l a t e A n d S a v e S c o r e ( u s e r I d ) ; 
         }   c a t c h   ( s c o r e E r r o r )   { 
             c o n s o l e . e r r o r ( " E r r o r   r e c a l c u l a t i n g   f i n a n c i a l   h e a l t h   s c o r e   a f t e r   v o i c e   e x p e n s e   c r e a t i o n : " ,   s c o r e E r r o r ) ; 
         } 
 
         / /   L o g   a u d i t   e v e n t 
         a w a i t   l o g A u d i t E v e n t A s y n c ( { 
             u s e r I d , 
             a c t i o n :   A u d i t A c t i o n s . E X P E N S E _ C R E A T E , 
             r e s o u r c e T y p e :   R e s o u r c e T y p e s . E X P E N S E , 
             r e s o u r c e I d :   n e w E x p e n s e . i d , 
             m e t a d a t a :   { 
                 a m o u n t :   n e w E x p e n s e . a m o u n t , 
                 d e s c r i p t i o n :   n e w E x p e n s e . d e s c r i p t i o n , 
                 c a t e g o r y I d :   n e w E x p e n s e . c a t e g o r y I d , 
                 v o i c e P r o c e s s e d :   t r u e , 
                 t r a n s c r i p t :   p r o c e s s e d T r a n s c r i p t , 
                 r o u n d U p P r o c e s s e d :   ! ! r o u n d U p R e c o r d 
             } , 
             s t a t u s :   " s u c c e s s " , 
             i p A d d r e s s :   r e q . i p , 
             u s e r A g e n t :   r e q . g e t ( " U s e r - A g e n t " ) 
         } ) ; 
 
         r e s . s t a t u s ( 2 0 1 ) . j s o n ( { 
             d a t a :   n e w E x p e n s e , 
             v o i c e D a t a :   { 
                 t r a n s c r i p t :   p r o c e s s e d T r a n s c r i p t , 
                 e x t r a c t e d D a t a :   e x t r a c t e d D a t a 
             } , 
             r o u n d U p :   r o u n d U p R e c o r d , 
             m e s s a g e :   " E x p e n s e   c r e a t e d   s u c c e s s f u l l y   f r o m   v o i c e   i n p u t " 
         } ) ; 
     }   c a t c h   ( e r r o r )   { 
         c o n s o l e . e r r o r ( " E r r o r   p r o c e s s i n g   v o i c e   e x p e n s e : " ,   e r r o r ) ; 
 
         / /   L o g   f a i l e d   a u d i t   e v e n t 
         a w a i t   l o g A u d i t E v e n t A s y n c ( { 
             u s e r I d :   r e q . u s e r . i d , 
             a c t i o n :   A u d i t A c t i o n s . E X P E N S E _ C R E A T E , 
             r e s o u r c e T y p e :   R e s o u r c e T y p e s . E X P E N S E , 
             m e t a d a t a :   { 
                 v o i c e P r o c e s s e d :   t r u e , 
                 e r r o r :   e r r o r . m e s s a g e 
             } , 
             s t a t u s :   " f a i l u r e " , 
             i p A d d r e s s :   r e q . i p , 
             u s e r A g e n t :   r e q . g e t ( " U s e r - A g e n t " ) 
         } ) ; 
 
         r e s . s t a t u s ( 5 0 0 ) . j s o n ( {   e r r o r :   " F a i l e d   t o   p r o c e s s   v o i c e   e x p e n s e "   } ) ; 
     } 
 } ) ; 
 
 e x p o r t   d e f a u l t   r o u t e r ;  
 