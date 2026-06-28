/**
 * WebSocket Integration Example
 * 
 * Shows how to integrate WebSocket events into existing routes
 * Copy patterns from here into your actual route handlers
 */

import express from 'express';
import { eq, and } from 'drizzle-orm';
import { protect } from '../middleware/auth.js';
import { validateTenantAccess } from '../middleware/tenantMiddleware.js';
import db from '../config/db.js';
import { expenses, categories } from '../db/schema.js';
import { v4 as uuidv4 } from 'uuid';
import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger.js';

/**
 * Integration Points:
 * - Import event handlers
 * - Call event methods when CRUD operations complete
 * - Pass broadcast and polling functions to routes
 */

export function createExpenseRoutesWithEvents(broadcast, eventHandlers, polling) {
  const router = express.Router({ mergeParams: true });

  /**
   * POST /api/tenants/:tenantId/expenses
   * Create expense and broadcast event
   */
  router.post(
    '/',
    protect,
    validateTenantAccess,
    [
      body('amount').isFloat({ min: 0 }),
      body('description').notEmpty(),
      body('date').optional().isISO8601()
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { amount, description, categoryId, date } = req.body;
        const { tenant, user } = req;

        // Create expense in database
        const expenseId = uuidv4();
        const [newExpense] = await db
          .insert(expenses)
          .values({
            id: expenseId,
            tenantId: tenant.id,
            userId: user.id,
            amount,
            description,
            categoryId: categoryId || null,
            date: new Date(date),
            currency: user.currency || 'USD'
          })
          .returning();

        logger.info('Expense created', {
          expenseId: newExpense.id,
          tenantId: tenant.id
        });

        // ✅ EMIT EVENT (Real-time notification)
        eventHandlers.expenseEvents.onExpenseCreated(newExpense);

        // ✅ STORE FOR POLLING (WebSocket fallback)
        polling.storeEventForPolling(
          tenant.id,
          user.id,
          'expense:created',
          {
            id: newExpense.id,
            amount: parseFloat(newExpense.amount),
            description: newExpense.description
          }
        );

        return res.status(201).json({
          success: true,
          message: 'Expense created successfully',
          data: newExpense
        });
      } catch (error) {
        logger.error('Error creating expense:', error);

        // ✅ EMIT ERROR EVENT
        eventHandlers.errorEvents.onErrorOccurred(
          req.tenant.id,
          req.user.id,
          'Failed to create expense',
          'EXPENSE_CREATE_ERROR'
        );

        return res.status(500).json({
          success: false,
          message: 'Error creating expense'
        });
      }
    }
  );

  /**
   * PUT /api/tenants/:tenantId/expenses/:id
   * Update expense and broadcast event
   */
  router.put(
    '/:id',
    protect,
    validateTenantAccess,
    [
      body('amount').optional().isFloat({ min: 0 }),
      body('description').optional().notEmpty(),
      body('categoryId').optional().isUUID()
    ],
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { id } = req.params;
        const { amount, description, categoryId, date } = req.body;
        const { tenant, user } = req;

        // Verify ownership
        const [expense] = await db
          .select()
          .from(expenses)
          .where(
            and(
              eq(expenses.id, id),
              eq(expenses.tenantId, tenant.id),
              eq(expenses.userId, user.id)
            )
          );

        if (!expense) {
          return res.status(404).json({ success: false, message: 'Expense not found' });
        }

        // Track what changed
        const changes = {};
        if (amount !== undefined) changes.amount = parseFloat(amount);
        if (description !== undefined) changes.description = description;
        if (categoryId !== undefined) changes.categoryId = categoryId;
        if (date !== undefined) changes.date = new Date(date);

        // Update in database
        const [updated] = await db
          .update(expenses)
          .set({ ...changes, updatedAt: new Date() })
          .where(eq(expenses.id, id))
          .returning();

        logger.info('Expense updated', {
          expenseId: id,
          tenantId: tenant.id,
          changedFields: Object.keys(changes)
        });

        // ✅ EMIT EVENT
        eventHandlers.expenseEvents.onExpenseUpdated(id, tenant.id, changes);

        // ✅ STORE FOR POLLING
        polling.storeEventForPolling(
          tenant.id,
          user.id,
          'expense:updated',
          { id, changes }
        );

        return res.status(200).json({
          success: true,
          message: 'Expense updated successfully',
          data: updated
        });
      } catch (error) {
        logger.error('Error updating expense:', error);

        eventHandlers.errorEvents.onErrorOccurred(
          req.tenant.id,
          req.user.id,
          'Failed to update expense',
          'EXPENSE_UPDATE_ERROR'
        );

        return res.status(500).json({
          success: false,
          message: 'Error updating expense'
        });
      }
    }
  );

  /**
   * DELETE /api/tenants/:tenantId/expenses/:id
   * Delete expense and broadcast event
   */
  router.delete(
    '/:id',
    protect,
    validateTenantAccess,
    async (req, res) => {
      try {
        const { id } = req.params;
        const { tenant, user } = req;

        // Verify ownership
        const [expense] = await db
          .select()
          .from(expenses)
          .where(
            and(
              eq(expenses.id, id),
              eq(expenses.tenantId, tenant.id),
              eq(expenses.userId, user.id)
            )
          );

        if (!expense) {
          return res.status(404).json({ success: false, message: 'Expense not found' });
        }

        // Delete from database
        await db.delete(expenses).where(eq(expenses.id, id));

        logger.info('Expense deleted', {
          expenseId: id,
          tenantId: tenant.id
        });

        // ✅ EMIT EVENT
        eventHandlers.expenseEvents.onExpenseDeleted(expense);

        // ✅ STORE FOR POLLING
        polling.storeEventForPolling(
          tenant.id,
          user.id,
          'expense:deleted',
          { id, amount: expense.amount }
        );

        return res.status(200).json({
          success: true,
          message: 'Expense deleted successfully'
        });
      } catch (error) {
        logger.error('Error deleting expense:', error);

        eventHandlers.errorEvents.onErrorOccurred(
          req.tenant.id,
          req.user.id,
          'Failed to delete expense',
          'EXPENSE_DELETE_ERROR'
        );

        return res.status(500).json({
          success: false,
          message: 'Error deleting expense'
        });
      }
    }
  );

  /**
   * POST /api/tenants/:tenantId/expenses/bulk-delete
   * Delete multiple and broadcast
   */
  router.post(
    '/bulk-delete',
    protect,
    validateTenantAccess,
    [body('ids').isArray({ min: 1 })],
    async (req, res) => {
      try {
        const { ids } = req.body;
        const { tenant, user } = req;

        // Delete
        await db
          .delete(expenses)
          .where(
            and(
              // @ts-ignore
              inArray(expenses.id, ids),
              eq(expenses.tenantId, tenant.id),
              eq(expenses.userId, user.id)
            )
          );

        logger.info('Expenses bulk deleted', {
          tenantId: tenant.id,
          count: ids.length
        });

        // ✅ EMIT EVENT
        eventHandlers.expenseEvents.onExpensesBulkDeleted(tenant.id, ids.length);

        // ✅ STORE FOR POLLING
        polling.storeEventForPolling(
          tenant.id,
          user.id,
          'expenses:bulk-deleted',
          { count: ids.length }
        );

        return res.status(200).json({
          success: true,
          message: `${ids.length} expenses deleted`
        });
      } catch (error) {
        logger.error('Error bulk deleting expenses:', error);

        eventHandlers.errorEvents.onErrorOccurred(
          req.tenant.id,
          req.user.id,
          'Failed to bulk delete expenses',
          'EXPENSE_BULK_DELETE_ERROR'
        );

        return res.status(500).json({
          success: false,
          message: 'Error deleting expenses'
        });
      }
    }
  );

  return router;
}

/**
 * Pattern Summary:
 * 
 * 1. After successful CRUD operation:
 *    eventHandlers.expenseEvents.onExpenseCreated(newExpense)
 * 
 * 2. Store event for polling clients:
 *    polling.storeEventForPolling(tenantId, userId, eventType, payload)
 * 
 * 3. On error, emit error event:
 *    eventHandlers.errorEvents.onErrorOccurred(tenantId, userId, message, code)
 * 
 * 4. Always pass broadcast and polling to route handler
 * 
 * 5. Events are sent to:
 *    - WebSocket clients in real-time
 *    - Polling clients on next poll request
 */

export default createExpenseRoutesWithEvents;
