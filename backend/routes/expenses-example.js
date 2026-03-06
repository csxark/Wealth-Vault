/**
 * Example: Tenant-Isolated Expenses Route
 * 
 * This shows the proper way to implement all expense endpoints with
 * multi-tenancy support. Use this as a template for updating other routes.
 */

import express from 'express';
import { eq, and, desc, like } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import {
  validateTenantAccess,
  requireTenantRole
} from '../middleware/tenantMiddleware.js';
import db from '../config/db.js';
import { expenses, categories } from '../db/schema.js';
import { logger } from '../utils/logger.js';

const router = express.Router({ mergeParams: true });

// Validation errors handler
const handleValidationErrors = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return {
      hasError: true,
      status: 400,
      response: {
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      }
    };
  }
  return { hasError: false };
};

// ============== GET EXPENSES ==============

/**
 * GET /api/tenants/:tenantId/expenses
 * Get all expenses for a tenant with pagination and filtering
 */
router.get(
  '/',
  protect,
  validateTenantAccess,
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('category').optional().isUUID(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('search').optional().isString().trim()
  ],
  async (req, res) => {
    try {
      const validation = handleValidationErrors(req, res);
      if (validation.hasError) {
        return res.status(validation.status).json(validation.response);
      }

      const {
        page = 1,
        limit = 20,
        category,
        startDate,
        endDate,
        search
      } = req.query;

      const offset = (page - 1) * limit;

      // Build WHERE clause with tenant isolation
      let whereConditions = [eq(expenses.tenantId, req.tenant.id)];

      // Optional filters
      if (category) {
        whereConditions.push(eq(expenses.categoryId, category));
      }

      if (startDate) {
        whereConditions.push(
          // @ts-ignore - Simple date comparison
          expenses.date >= new Date(startDate)
        );
      }

      if (endDate) {
        whereConditions.push(
          // @ts-ignore
          expenses.date <= new Date(endDate)
        );
      }

      if (search) {
        whereConditions.push(
          like(expenses.description, `%${search}%`)
        );
      }

      // Fetch expenses
      const expensesList = await db
        .select()
        .from(expenses)
        .where(and(...whereConditions))
        .orderBy(desc(expenses.date))
        .limit(limit)
        .offset(offset);

      // Get total count for pagination
      const [{ count }] = await db
        .select({ count: count(expenses.id) })
        .from(expenses)
        .where(and(...whereConditions));

      logger.info('Expenses fetched', {
        tenantId: req.tenant.id,
        userId: req.user.id,
        count: expensesList.length
      });

      return res.status(200).json({
        success: true,
        data: expensesList,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Error fetching expenses:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching expenses'
      });
    }
  }
);

// ============== GET SINGLE EXPENSE ==============

/**
 * GET /api/tenants/:tenantId/expenses/:id
 * Get a single expense
 * NOTE: Only owner or users with permission can view
 */
router.get(
  '/:id',
  protect,
  validateTenantAccess,
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const validation = handleValidationErrors(req, res);
      if (validation.hasError) {
        return res.status(validation.status).json(validation.response);
      }

      // CRITICAL: Include tenantId in query to prevent cross-tenant access
      const [expense] = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.id, req.params.id),
            eq(expenses.tenantId, req.tenant.id) // Tenant isolation check
          )
        );

      if (!expense) {
        return res.status(404).json({
          success: false,
          message: 'Expense not found'
        });
      }

      logger.info('Expense fetched', {
        expenseId: req.params.id,
        tenantId: req.tenant.id,
        userId: req.user.id
      });

      return res.status(200).json({
        success: true,
        data: expense
      });
    } catch (error) {
      logger.error('Error fetching expense:', error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching expense'
      });
    }
  }
);

// ============== CREATE EXPENSE ==============

/**
 * POST /api/tenants/:tenantId/expenses
 * Create a new expense
 */
router.post(
  '/',
  protect,
  validateTenantAccess,
  [
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be positive'),
    body('description').notEmpty().withMessage('Description is required'),
    body('categoryId').optional().isUUID().withMessage('Invalid category ID'),
    body('date').optional().isISO8601().withMessage('Invalid date format'),
    body('paymentMethod').optional().isString(),
    body('tags').optional().isArray()
  ],
  async (req, res) => {
    try {
      const validation = handleValidationErrors(req, res);
      if (validation.hasError) {
        return res.status(validation.status).json(validation.response);
      }

      const {
        amount,
        description,
        categoryId,
        date = new Date(),
        paymentMethod = 'other',
        tags = [],
        notes = ''
      } = req.body;

      // Verify category belongs to tenant (if provided)
      if (categoryId) {
        const [category] = await db
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.id, categoryId),
              eq(categories.tenantId, req.tenant.id) // Verify category ownership
            )
          );

        if (!category) {
          return res.status(400).json({
            success: false,
            message: 'Category not found or does not belong to your workspace'
          });
        }
      }

      // Create expense with tenant context
      const expenseId = uuidv4();
      const [newExpense] = await db
        .insert(expenses)
        .values({
          id: expenseId,
          tenantId: req.tenant.id, // CRITICAL: Always set tenant
          userId: req.user.id,
          amount,
          description,
          categoryId: categoryId || null,
          date: new Date(date),
          paymentMethod,
          tags,
          notes,
          currency: req.user.currency || 'USD'
        })
        .returning();

      logger.info('Expense created', {
        expenseId: newExpense.id,
        tenantId: req.tenant.id,
        userId: req.user.id,
        amount
      });

      return res.status(201).json({
        success: true,
        message: 'Expense created successfully',
        data: newExpense
      });
    } catch (error) {
      logger.error('Error creating expense:', error);
      return res.status(500).json({
        success: false,
        message: 'Error creating expense'
      });
    }
  }
);

// ============== UPDATE EXPENSE ==============

/**
 * PUT /api/tenants/:tenantId/expenses/:id
 * Update an expense
 * Only the creator can update (or admin with permission)
 */
router.put(
  '/:id',
  protect,
  validateTenantAccess,
  [
    param('id').isUUID(),
    body('amount').optional().isFloat({ min: 0 }),
    body('description').optional().notEmpty(),
    body('categoryId').optional().isUUID(),
    body('date').optional().isISO8601(),
    body('paymentMethod').optional().isString(),
    body('tags').optional().isArray()
  ],
  async (req, res) => {
    try {
      const validation = handleValidationErrors(req, res);
      if (validation.hasError) {
        return res.status(validation.status).json(validation.response);
      }

      const { id } = req.params;
      const updateData = req.body;

      // CRITICAL: Verify expense belongs to tenant AND user
      const [expense] = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.id, id),
            eq(expenses.tenantId, req.tenant.id), // Tenant check
            eq(expenses.userId, req.user.id) // Ownership check
          )
        );

      if (!expense) {
        return res.status(404).json({
          success: false,
          message: 'Expense not found or you do not have permission to edit it'
        });
      }

      // Verify category if updating
      if (updateData.categoryId) {
        const [category] = await db
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.id, updateData.categoryId),
              eq(categories.tenantId, req.tenant.id)
            )
          );

        if (!category) {
          return res.status(400).json({
            success: false,
            message: 'Category not found or does not belong to your workspace'
          });
        }
      }

      // Update expense
      const [updated] = await db
        .update(expenses)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(expenses.id, id))
        .returning();

      logger.info('Expense updated', {
        expenseId: id,
        tenantId: req.tenant.id,
        userId: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Expense updated successfully',
        data: updated
      });
    } catch (error) {
      logger.error('Error updating expense:', error);
      return res.status(500).json({
        success: false,
        message: 'Error updating expense'
      });
    }
  }
);

// ============== DELETE EXPENSE ==============

/**
 * DELETE /api/tenants/:tenantId/expenses/:id
 * Delete an expense
 */
router.delete(
  '/:id',
  protect,
  validateTenantAccess,
  [param('id').isUUID()],
  async (req, res) => {
    try {
      const validation = handleValidationErrors(req, res);
      if (validation.hasError) {
        return res.status(validation.status).json(validation.response);
      }

      const { id } = req.params;

      // CRITICAL: Verify ownership before deletion
      const [expense] = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.id, id),
            eq(expenses.tenantId, req.tenant.id),
            eq(expenses.userId, req.user.id)
          )
        );

      if (!expense) {
        return res.status(404).json({
          success: false,
          message: 'Expense not found or you do not have permission to delete it'
        });
      }

      // Delete
      await db.delete(expenses).where(eq(expenses.id, id));

      logger.info('Expense deleted', {
        expenseId: id,
        tenantId: req.tenant.id,
        userId: req.user.id
      });

      return res.status(200).json({
        success: true,
        message: 'Expense deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting expense:', error);
      return res.status(500).json({
        success: false,
        message: 'Error deleting expense'
      });
    }
  }
);

// ============== BULK DELETE ==============

/**
 * POST /api/tenants/:tenantId/expenses/bulk-delete
 * Delete multiple expenses at once
 */
router.post(
  '/bulk-delete',
  protect,
  validateTenantAccess,
  [
    body('ids')
      .isArray({ min: 1 })
      .withMessage('IDs must be a non-empty array'),
    body('ids.*').isUUID().withMessage('Invalid expense ID format')
  ],
  async (req, res) => {
    try {
      const validation = handleValidationErrors(req, res);
      if (validation.hasError) {
        return res.status(validation.status).json(validation.response);
      }

      const { ids } = req.body;

      // Verify all expenses belong to tenant and user
      const expensesToDelete = await db
        .select()
        .from(expenses)
        .where(
          and(
            // @ts-ignore
            inArray(expenses.id, ids),
            eq(expenses.tenantId, req.tenant.id),
            eq(expenses.userId, req.user.id)
          )
        );

      if (expensesToDelete.length !== ids.length) {
        return res.status(403).json({
          success: false,
          message: 'Some expenses do not belong to you or were not found'
        });
      }

      // Delete all verified expenses
      await db
        .delete(expenses)
        .where(
          and(
            // @ts-ignore
            inArray(expenses.id, ids),
            eq(expenses.tenantId, req.tenant.id)
          )
        );

      logger.info('Expenses bulk deleted', {
        tenantId: req.tenant.id,
        userId: req.user.id,
        count: ids.length
      });

      return res.status(200).json({
        success: true,
        message: `${ids.length} expenses deleted successfully`
      });
    } catch (error) {
      logger.error('Error bulk deleting expenses:', error);
      return res.status(500).json({
        success: false,
        message: 'Error deleting expenses'
      });
    }
  }
);

// ============== STATISTICS ==============

/**
 * GET /api/tenants/:tenantId/expenses/stats
 * Get expense statistics for the tenant
 */
router.get(
  '/stats',
  protect,
  validateTenantAccess,
  async (req, res) => {
    try {
      // Get expenses for tenant
      const tenantExpenses = await db
        .select()
        .from(expenses)
        .where(eq(expenses.tenantId, req.tenant.id));

      // Calculate stats
      const total = tenantExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const count = tenantExpenses.length;
      const average = count > 0 ? total / count : 0;

      return res.status(200).json({
        success: true,
        data: {
          totalAmount: parseFloat(total.toFixed(2)),
          count,
          average: parseFloat(average.toFixed(2)),
          currency: req.user.currency || 'USD'
        }
      });
    } catch (error) {
      logger.error('Error getting expense stats:', error);
      return res.status(500).json({
        success: false,
        message: 'Error getting statistics'
      });
    }
  }
);

export default router;
