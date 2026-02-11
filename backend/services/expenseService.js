import { eq, and, lte, isNotNull } from 'drizzle-orm';
import db from '../config/db.js';
import { expenses } from '../db/schema.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from './auditService.js';
import savingsService from './savingsService.js';
import categorizationService from './categorizationService.js';
import financialHealthService from './financialHealthService.js';

/**
 * Recurring Transaction Execution Service
 * Handles the automatic cloning of recurring expenses based on their patterns
 */

/**
 * Calculate the next execution date based on the recurring pattern
 * @param {Date} fromDate - The date to calculate from
 * @param {Object} pattern - The recurring pattern { frequency, interval, endDate }
 * @returns {Date|null} - The next execution date or null if pattern has ended
 */
export const calculateNextExecutionDate = (fromDate, pattern) => {
  if (!pattern || !pattern.frequency) {
    return null;
  }

  const { frequency, interval = 1, endDate } = pattern;
  const nextDate = new Date(fromDate);

  switch (frequency.toLowerCase()) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + interval);
      break;
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + (7 * interval));
      break;
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + interval);
      break;
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + interval);
      break;
    default:
      return null;
  }

  // Check if the pattern has an end date and if we've passed it
  if (endDate && nextDate > new Date(endDate)) {
    return null;
  }

  return nextDate;
};

/**
 * Get all recurring expenses that are due for execution
 * @returns {Promise<Array>} - Array of due recurring expenses
 */
export const getDueRecurringExpenses = async () => {
  const now = new Date();
  
  try {
    const dueExpenses = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.isRecurring, true),
          isNotNull(expenses.nextExecutionDate),
          lte(expenses.nextExecutionDate, now)
        )
      );

    return dueExpenses;
  } catch (error) {
    console.error('Error fetching due recurring expenses:', error);
    throw error;
  }
};

/**
 * Clone a recurring expense to create a new transaction
 * @param {Object} sourceExpense - The original recurring expense
 * @returns {Promise<Object>} - The newly created expense
 */
export const cloneRecurringExpense = async (sourceExpense) => {
  const now = new Date();

  try {
    // Create a new expense based on the source
    const [newExpense] = await db
      .insert(expenses)
      .values({
        userId: sourceExpense.userId,
        categoryId: sourceExpense.categoryId,
        amount: sourceExpense.amount,
        currency: sourceExpense.currency,
        description: sourceExpense.description,
        subcategory: sourceExpense.subcategory,
        date: now, // Use current date for the new transaction
        paymentMethod: sourceExpense.paymentMethod,
        location: sourceExpense.location,
        tags: sourceExpense.tags,
        isRecurring: false, // Cloned expenses are not recurring themselves
        recurringSourceId: sourceExpense.id, // Link back to the source
        notes: sourceExpense.notes ? `[Auto-generated] ${sourceExpense.notes}` : '[Auto-generated from recurring transaction]',
        status: 'completed',
        metadata: {
          createdBy: 'recurring_job',
          sourceExpenseId: sourceExpense.id,
          generatedAt: now.toISOString(),
          version: 1,
          flags: ['auto-generated']
        },
      })
      .returning();

    // Calculate the next execution date for the source expense
    const nextExecDate = calculateNextExecutionDate(now, sourceExpense.recurringPattern);

    // Update the source expense with the new execution date and last executed timestamp
    await db
      .update(expenses)
      .set({
        lastExecutedDate: now,
        nextExecutionDate: nextExecDate,
        updatedAt: now,
      })
      .where(eq(expenses.id, sourceExpense.id));

    // Log the audit event
    logAuditEventAsync({
      userId: sourceExpense.userId,
      action: AuditActions.EXPENSE_CREATE,
      resourceType: ResourceTypes.EXPENSE,
      resourceId: newExpense.id,
      metadata: {
        source: 'recurring_job',
        sourceExpenseId: sourceExpense.id,
        amount: sourceExpense.amount,
        description: sourceExpense.description,
      },
      status: 'success',
      ipAddress: 'system',
      userAgent: 'RecurringTransactionJob',
    });

    return newExpense;
  } catch (error) {
    console.error(`Error cloning recurring expense ${sourceExpense.id}:`, error);
    throw error;
  }
};

/**
 * Process all due recurring expenses
 * This is the main function called by the scheduled job
 * @returns {Promise<Object>} - Execution results
 */
export const processRecurringExpenses = async () => {
  const startTime = Date.now();
  const results = {
    processed: 0,
    created: 0,
    failed: 0,
    errors: [],
    duration: 0,
  };

  try {
    const dueExpenses = await getDueRecurringExpenses();
    results.processed = dueExpenses.length;

    console.log(`[RecurringJob] Found ${dueExpenses.length} due recurring expenses`);

    for (const expense of dueExpenses) {
      try {
        await cloneRecurringExpense(expense);
        results.created++;
        console.log(`[RecurringJob] Created expense from recurring source: ${expense.id}`);
      } catch (error) {
        results.failed++;
        results.errors.push({
          expenseId: expense.id,
          error: error.message,
        });
        console.error(`[RecurringJob] Failed to process expense ${expense.id}:`, error.message);
      }
    }

    results.duration = Date.now() - startTime;
    console.log(`[RecurringJob] Completed - Created: ${results.created}, Failed: ${results.failed}, Duration: ${results.duration}ms`);

    return results;
  } catch (error) {
    results.duration = Date.now() - startTime;
    console.error('[RecurringJob] Critical error during execution:', error);
    throw error;
  }
};

/**
 * Initialize the next execution date for a recurring expense
 * Called when creating or updating a recurring expense
 * @param {string} expenseId - The expense ID
 * @param {Object} recurringPattern - The recurring pattern
 * @param {Date} startDate - The start date for the recurrence
 * @returns {Promise<Date>} - The calculated next execution date
 */
export const initializeRecurringExpense = async (expenseId, recurringPattern, startDate = new Date()) => {
  const nextExecDate = calculateNextExecutionDate(startDate, recurringPattern);

  if (nextExecDate) {
    await db
      .update(expenses)
      .set({
        nextExecutionDate: nextExecDate,
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, expenseId));
  }

  return nextExecDate;
};

/**
 * Disable recurring for an expense
 * @param {string} expenseId - The expense ID
 * @returns {Promise<void>}
 */
export const disableRecurring = async (expenseId) => {
  await db
    .update(expenses)
    .set({
      isRecurring: false,
      nextExecutionDate: null,
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, expenseId));
};

/**
 * Process round-up savings after expense creation
 * @param {Object} expense - The created expense object
 * @returns {Promise<Object|null>} - Round-up record if processed, null otherwise
 */
export const processRoundUpAfterExpenseCreation = async (expense) => {
  try {
    // Process round-up using savings service
    const roundUpRecord = await savingsService.processRoundUp(expense);

    if (roundUpRecord) {
      console.log(`[RoundUp] Processed round-up for expense ${expense.id}: ${roundUpRecord.roundUpAmount} ${expense.currency}`);
    }

    return roundUpRecord;
  } catch (error) {
    console.error(`[RoundUp] Error processing round-up for expense ${expense.id}:`, error);
    // Don't throw error to avoid breaking expense creation
    return null;
  }
};

/**
 * Auto-categorize a single expense using ML
 * @param {Object} expense - The expense object
 * @returns {Promise<Object>} - Categorization result
 */
export const autoCategorizeExpense = async (expense) => {
  try {
    const prediction = await categorizationService.predictCategory(expense);

    if (prediction.categoryId && prediction.confidence > 0.5) {
      // Update expense with predicted category
      await db
        .update(expenses)
        .set({
          categoryId: prediction.categoryId,
          updatedAt: new Date()
        })
        .where(eq(expenses.id, expense.id));

      // Log audit event
      await logAuditEventAsync({
        userId: expense.userId,
        action: AuditActions.EXPENSE_UPDATE,
        resourceType: ResourceTypes.EXPENSE,
        resourceId: expense.id,
        metadata: {
          autoCategorized: true,
          predictedCategory: prediction.categoryName,
          confidence: prediction.confidence
        },
        status: 'success',
        ipAddress: 'system',
        userAgent: 'ExpenseService'
      });

      return {
        expenseId: expense.id,
        predictedCategory: prediction.categoryName,
        confidence: prediction.confidence,
        applied: true
      };
    }

    return {
      expenseId: expense.id,
      predictedCategory: prediction.categoryName,
      confidence: prediction.confidence,
      applied: false
    };

  } catch (error) {
    console.error(`Error auto-categorizing expense ${expense.id}:`, error);
    return {
      expenseId: expense.id,
      applied: false,
      error: error.message
    };
  }
};

/**
 * Bulk categorize expenses using ML
 * @param {string} userId - User ID
 * @param {Array} expenseIds - Array of expense IDs to categorize
 * @returns {Promise<Array>} - Array of categorization results
 */
export const bulkCategorizeExpenses = async (userId, expenseIds) => {
  try {
    return await categorizationService.bulkCategorize(userId, expenseIds);
  } catch (error) {
    console.error('Error in bulk categorization:', error);
    throw error;
  }
};

/**
 * Train categorization model for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Training result
 */
export const trainCategorizationModel = async (userId) => {
  try {
    await categorizationService.trainModel(userId);
    return {
      success: true,
      status: categorizationService.getModelStatus()
    };
  } catch (error) {
    console.error('Error training categorization model:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Retrain model with user corrections
 * @param {string} userId - User ID
 * @param {Array} corrections - Array of correction objects {expenseId, correctCategoryId}
 * @returns {Promise<Object>} - Retraining result
 */
export const retrainWithCorrections = async (userId, corrections) => {
  try {
    await categorizationService.retrainWithCorrections(userId, corrections);
    return {
      success: true,
      status: categorizationService.getModelStatus()
    };
  } catch (error) {
    console.error('Error retraining with corrections:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

export default {
  calculateNextExecutionDate,
  getDueRecurringExpenses,
  cloneRecurringExpense,
  processRecurringExpenses,
  initializeRecurringExpense,
  disableRecurring,
};
