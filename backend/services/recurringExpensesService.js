import cron from 'node-cron';
import { eq, and, lte, gte, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { recurringExpenses, expenses, categories } from '../db/schema.js';
import notificationService from './notificationService.js';

class RecurringExpensesService {
  constructor() {
    this.cronJob = null;
    this.isRunning = false;
  }

  /**
   * Calculate next due date based on frequency and interval
   */
  calculateNextDueDate(startDate, frequency, interval = 1, lastGeneratedDate = null) {
    const baseDate = lastGeneratedDate ? new Date(lastGeneratedDate) : new Date(startDate);
    const nextDate = new Date(baseDate);

    switch (frequency) {
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
        throw new Error(`Invalid frequency: ${frequency}`);
    }

    return nextDate;
  }

  /**
   * Create a new recurring expense pattern
   */
  async createRecurringExpense(data) {
    try {
      const {
        userId,
        categoryId,
        name,
        description,
        amount,
        currency = 'USD',
        frequency,
        interval = 1,
        startDate,
        endDate,
        paymentMethod = 'other',
        tags = [],
        notes
      } = data;

      // Calculate next due date
      const nextDueDate = this.calculateNextDueDate(startDate, frequency, interval);

      const [newRecurringExpense] = await db
        .insert(recurringExpenses)
        .values({
          userId,
          categoryId,
          name,
          description,
          amount: amount.toString(),
          currency,
          frequency,
          interval,
          startDate: new Date(startDate),
          endDate: endDate ? new Date(endDate) : null,
          nextDueDate,
          paymentMethod,
          tags,
          notes,
          metadata: {
            totalGenerated: 0,
            lastAmount: amount.toString(),
            createdBy: 'user'
          }
        })
        .returning();

      return newRecurringExpense;
    } catch (error) {
      console.error('Error creating recurring expense:', error);
      throw error;
    }
  }

  /**
   * Update a recurring expense pattern
   */
  async updateRecurringExpense(id, userId, updates) {
    try {
      const updateData = { ...updates, updatedAt: new Date() };

      // Recalculate next due date if frequency, interval, or start date changed
      if (updates.frequency || updates.interval || updates.startDate) {
        const existing = await this.getRecurringExpenseById(id, userId);
        if (existing) {
          const frequency = updates.frequency || existing.frequency;
          const interval = updates.interval || existing.interval;
          const startDate = updates.startDate || existing.startDate;
          updateData.nextDueDate = this.calculateNextDueDate(
            startDate,
            frequency,
            interval,
            existing.lastGeneratedDate
          );
        }
      }

      if (updateData.amount) {
        updateData.amount = updateData.amount.toString();
      }

      const [updated] = await db
        .update(recurringExpenses)
        .set(updateData)
        .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)))
        .returning();

      return updated;
    } catch (error) {
      console.error('Error updating recurring expense:', error);
      throw error;
    }
  }

  /**
   * Get recurring expense by ID
   */
  async getRecurringExpenseById(id, userId) {
    try {
      const result = await db.query.recurringExpenses.findFirst({
        where: and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          }
        }
      });
      return result;
    } catch (error) {
      console.error('Error getting recurring expense:', error);
      throw error;
    }
  }

  /**
   * Get all recurring expenses for a user
   */
  async getRecurringExpenses(userId, filters = {}) {
    try {
      const { isActive = true, categoryId } = filters;

      const conditions = [eq(recurringExpenses.userId, userId)];

      if (isActive !== undefined) {
        conditions.push(eq(recurringExpenses.isActive, isActive));
      }

      if (categoryId) {
        conditions.push(eq(recurringExpenses.categoryId, categoryId));
      }

      const result = await db.query.recurringExpenses.findMany({
        where: and(...conditions),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          }
        },
        orderBy: [recurringExpenses.nextDueDate]
      });

      return result;
    } catch (error) {
      console.error('Error getting recurring expenses:', error);
      throw error;
    }
  }

  /**
   * Delete a recurring expense pattern
   */
  async deleteRecurringExpense(id, userId) {
    try {
      await db
        .delete(recurringExpenses)
        .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.userId, userId)));
    } catch (error) {
      console.error('Error deleting recurring expense:', error);
      throw error;
    }
  }

  /**
   * Generate expenses for due recurring patterns
   */
  async generateDueExpenses() {
    try {
      const now = new Date();

      // Find all active recurring expenses that are due
      const dueRecurringExpenses = await db.query.recurringExpenses.findMany({
        where: and(
          eq(recurringExpenses.isActive, true),
          eq(recurringExpenses.isPaused, false),
          lte(recurringExpenses.nextDueDate, now),
          sql`${recurringExpenses.endDate} IS NULL OR ${recurringExpenses.endDate} >= ${now}`
        ),
        with: {
          user: {
            columns: { currency: true }
          }
        }
      });

      const generatedExpenses = [];

      for (const recurring of dueRecurringExpenses) {
        try {
          // Create the expense
          const [newExpense] = await db
            .insert(expenses)
            .values({
              userId: recurring.userId,
              categoryId: recurring.categoryId,
              amount: recurring.amount,
              currency: recurring.currency,
              description: recurring.description,
              date: recurring.nextDueDate,
              paymentMethod: recurring.paymentMethod,
              tags: recurring.tags,
              isRecurring: true,
              recurringPattern: {
                parentId: recurring.id,
                frequency: recurring.frequency,
                interval: recurring.interval
              },
              notes: recurring.notes,
              metadata: {
                createdBy: 'system',
                lastModified: null,
                version: 1,
                flags: ['auto-generated']
              }
            })
            .returning();

          // Update the recurring expense
          const nextDueDate = this.calculateNextDueDate(
            recurring.startDate,
            recurring.frequency,
            recurring.interval,
            recurring.nextDueDate
          );

          await db
            .update(recurringExpenses)
            .set({
              nextDueDate,
              lastGeneratedDate: recurring.nextDueDate,
              metadata: {
                ...recurring.metadata,
                totalGenerated: (recurring.metadata?.totalGenerated || 0) + 1,
                lastAmount: recurring.amount
              },
              updatedAt: new Date()
            })
            .where(eq(recurringExpenses.id, recurring.id));

          generatedExpenses.push(newExpense);

          // Send notification
          await this.notifyUpcomingExpense(recurring, nextDueDate);

        } catch (error) {
          console.error(`Error generating expense for recurring ID ${recurring.id}:`, error);
        }
      }

      return generatedExpenses;
    } catch (error) {
      console.error('Error generating due expenses:', error);
      throw error;
    }
  }

  /**
   * Send notification for upcoming expense
   */
  async notifyUpcomingExpense(recurringExpense, nextDueDate) {
    try {
      // Check if notification should be sent (e.g., 3 days before)
      const daysBefore = 3;
      const notificationDate = new Date(nextDueDate);
      notificationDate.setDate(notificationDate.getDate() - daysBefore);

      const now = new Date();
      if (now >= notificationDate && now < nextDueDate) {
        await notificationService.sendNotification({
          userId: recurringExpense.userId,
          type: 'upcoming_recurring_expense',
          title: 'Upcoming Recurring Expense',
          message: `${recurringExpense.name} of ${recurringExpense.currency} ${recurringExpense.amount} is due on ${nextDueDate.toLocaleDateString()}`,
          data: {
            recurringExpenseId: recurringExpense.id,
            amount: recurringExpense.amount,
            dueDate: nextDueDate
          }
        });
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  /**
   * Start the cron job for generating recurring expenses
   */
  startCronJob() {
    if (this.cronJob) {
      this.cronJob.destroy();
    }

    // Run daily at midnight
    this.cronJob = cron.schedule('0 0 * * *', async () => {
      if (this.isRunning) return;

      this.isRunning = true;
      try {
        console.log('Running recurring expenses generation...');
        const generated = await this.generateDueExpenses();
        console.log(`Generated ${generated.length} recurring expenses`);
      } catch (error) {
        console.error('Error in recurring expenses cron job:', error);
      } finally {
        this.isRunning = false;
      }
    });

    console.log('Recurring expenses cron job started');
  }

  /**
   * Stop the cron job
   */
  stopCronJob() {
    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
      console.log('Recurring expenses cron job stopped');
    }
  }

  /**
   * Manually trigger expense generation (for testing)
   */
  async triggerGeneration() {
    if (this.isRunning) {
      throw new Error('Generation already running');
    }

    this.isRunning = true;
    try {
      const generated = await this.generateDueExpenses();
      return generated;
    } finally {
      this.isRunning = false;
    }
  }
}

export default new RecurringExpensesService();
