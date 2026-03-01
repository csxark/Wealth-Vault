import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import recurringDetector from '../services/recurringDetector.js';
import billPaymentEngine from '../services/billPaymentEngine.js';
import { AppError } from '../utils/AppError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import db from '../config/db.js';
import { recurringTransactions, scheduledPayments, subscriptionTracking } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

const router = express.Router();

// ============================================================================
// RECURRING TRANSACTIONS
// ============================================================================

/**
 * @route   POST /api/recurring-payments/detect
 * @desc    Detect recurring transactions for user
 * @access  Private
 */
router.post(
    '/detect',
    protect,
    asyncHandler(async (req, res, next) => {
        const result = await recurringDetector.detectRecurringTransactions(req.user.id);

        return new ApiResponse(200, result, `Detected ${result.detected} recurring patterns`).send(res);
    })
);

/**
 * @route   GET /api/recurring-payments/recurring
 * @desc    Get user's recurring transactions
 * @access  Private
 */
router.get(
    '/recurring',
    protect,
    [query('status').optional().isIn(['active', 'paused', 'cancelled', 'completed'])],
    asyncHandler(async (req, res, next) => {
        const { status = 'active' } = req.query;

        const recurring = await recurringDetector.getUserRecurringTransactions(
            req.user.id,
            status
        );

        return new ApiResponse(200, recurring, "Recurring transactions retrieved successfully").send(res);
    })
);

/**
 * @route   POST /api/recurring-payments/recurring
 * @desc    Create manual recurring transaction
 * @access  Private
 */
router.post(
    '/recurring',
    protect,
    [
        body('name').notEmpty().withMessage('Name is required'),
        body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
        body('frequency').isIn(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']),
        body('nextDueDate').isISO8601().withMessage('Valid due date required')
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const {
            name,
            merchantName,
            amount,
            frequency,
            nextDueDate,
            categoryId,
            paymentMethod,
            isAutoPayEnabled = false,
            notes
        } = req.body;

        const [recurring] = await db.insert(recurringTransactions)
            .values({
                userId: req.user.id,
                categoryId,
                name,
                merchantName: merchantName || name,
                amount: amount.toString(),
                frequency,
                nextDueDate: new Date(nextDueDate),
                paymentMethod,
                isAutoPayEnabled,
                notes,
                detectionMethod: 'manual',
                confidence: 1.0
            })
            .returning();

        return new ApiResponse(201, recurring, 'Recurring transaction created successfully').send(res);
    })
);

/**
 * @route   PUT /api/recurring-payments/recurring/:id
 * @desc    Update recurring transaction
 * @access  Private
 */
router.put(
    '/recurring/:id',
    protect,
    [param('id').isUUID()],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const updated = await recurringDetector.updateRecurringTransaction(
            req.params.id,
            req.body
        );

        if (!updated) {
            return next(new AppError(404, 'Recurring transaction not found'));
        }

        return new ApiResponse(200, updated, 'Recurring transaction updated successfully').send(res);
    })
);

/**
 * @route   DELETE /api/recurring-payments/recurring/:id
 * @desc    Cancel recurring transaction
 * @access  Private
 */
router.delete(
    '/recurring/:id',
    protect,
    [param('id').isUUID()],
    asyncHandler(async (req, res, next) => {
        const [cancelled] = await db.update(recurringTransactions)
            .set({
                status: 'cancelled',
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(recurringTransactions.id, req.params.id),
                    eq(recurringTransactions.userId, req.user.id)
                )
            )
            .returning();

        if (!cancelled) {
            return next(new AppError(404, 'Recurring transaction not found'));
        }

        return new ApiResponse(200, cancelled, 'Recurring transaction cancelled successfully').send(res);
    })
);

// ============================================================================
// SCHEDULED PAYMENTS
// ============================================================================

/**
 * @route   POST /api/recurring-payments/schedule
 * @desc    Schedule a payment
 * @access  Private
 */
router.post(
    '/schedule',
    protect,
    [
        body('payeeName').notEmpty().withMessage('Payee name is required'),
        body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
        body('scheduledDate').isISO8601().withMessage('Valid scheduled date required')
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const payment = await billPaymentEngine.schedulePayment(req.user.id, req.body);

        return new ApiResponse(201, payment, 'Payment scheduled successfully').send(res);
    })
);

/**
 * @route   GET /api/recurring-payments/upcoming
 * @desc    Get upcoming payments
 * @access  Private
 */
router.get(
    '/upcoming',
    protect,
    [query('days').optional().isInt({ min: 1, max: 365 })],
    asyncHandler(async (req, res, next) => {
        const { days = 30 } = req.query;

        const payments = await billPaymentEngine.getUpcomingPayments(
            req.user.id,
            parseInt(days)
        );

        return new ApiResponse(200, payments, "Upcoming payments retrieved successfully").send(res);
    })
);

/**
 * @route   GET /api/recurring-payments/history
 * @desc    Get payment history
 * @access  Private
 */
router.get(
    '/history',
    protect,
    [query('limit').optional().isInt({ min: 1, max: 500 })],
    asyncHandler(async (req, res, next) => {
        const { limit = 50 } = req.query;

        const payments = await billPaymentEngine.getPaymentHistory(
            req.user.id,
            parseInt(limit)
        );

        return new ApiResponse(200, payments, "Payment history retrieved successfully").send(res);
    })
);

/**
 * @route   POST /api/recurring-payments/pay/:id
 * @desc    Execute auto-payment
 * @access  Private
 */
router.post(
    '/pay/:id',
    protect,
    [param('id').isUUID()],
    asyncHandler(async (req, res, next) => {
        const result = await billPaymentEngine.processAutoPay(req.params.id);

        if (!result.success) {
            return next(new AppError(400, result.message || 'Payment failed'));
        }

        return new ApiResponse(200, result.payment, 'Payment processed successfully').send(res);
    })
);

/**
 * @route   POST /api/recurring-payments/retry/:id
 * @desc    Retry failed payment
 * @access  Private
 */
router.post(
    '/retry/:id',
    protect,
    [param('id').isUUID()],
    asyncHandler(async (req, res, next) => {
        const result = await billPaymentEngine.retryPayment(req.params.id);

        if (!result.success) {
            return next(new AppError(400, result.message || 'Payment retry failed'));
        }

        return new ApiResponse(200, result.payment, 'Payment retry successful').send(res);
    })
);

/**
 * @route   DELETE /api/recurring-payments/cancel/:id
 * @desc    Cancel scheduled payment
 * @access  Private
 */
router.delete(
    '/cancel/:id',
    protect,
    [param('id').isUUID()],
    asyncHandler(async (req, res) => {
        const cancelled = await billPaymentEngine.cancelPayment(req.params.id);

        res.json({
            success: true,
            data: cancelled,
            message: 'Payment cancelled'
        });
    })
);

/**
 * @route   GET /api/recurring-payments/analytics
 * @desc    Get payment analytics
 * @access  Private
 */
router.get(
    '/analytics',
    protect,
    asyncHandler(async (req, res, next) => {
        const analytics = await billPaymentEngine.getPaymentAnalytics(req.user.id);

        return new ApiResponse(200, analytics, "Payment analytics retrieved successfully").send(res);
    })
);

// ============================================================================
// SUBSCRIPTIONS
// ============================================================================

/**
 * @route   POST /api/recurring-payments/subscriptions
 * @desc    Add subscription
 * @access  Private
 */
router.post(
    '/subscriptions',
    protect,
    [
        body('serviceName').notEmpty().withMessage('Service name is required'),
        body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be positive'),
        body('billingCycle').isIn(['monthly', 'yearly']),
        body('startDate').isISO8601(),
        body('renewalDate').isISO8601()
    ],
    asyncHandler(async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return next(new AppError(400, 'Validation failed', errors.array()));
        }

        const {
            serviceName,
            category,
            amount,
            billingCycle,
            startDate,
            renewalDate,
            paymentMethod,
            website,
            notes
        } = req.body;

        const [subscription] = await db.insert(subscriptionTracking)
            .values({
                userId: req.user.id,
                serviceName,
                category,
                amount: amount.toString(),
                billingCycle,
                startDate: new Date(startDate),
                renewalDate: new Date(renewalDate),
                paymentMethod,
                website,
                notes
            })
            .returning();

        return new ApiResponse(201, subscription, 'Subscription added successfully').send(res);
    })
);

/**
 * @route   GET /api/recurring-payments/subscriptions
 * @desc    Get user subscriptions
 * @access  Private
 */
router.get(
    '/subscriptions',
    protect,
    [query('status').optional().isIn(['active', 'cancelled', 'expired', 'trial'])],
    asyncHandler(async (req, res, next) => {
        const { status = 'active' } = req.query;

        const subscriptions = await db.select()
            .from(subscriptionTracking)
            .where(
                and(
                    eq(subscriptionTracking.userId, req.user.id),
                    eq(subscriptionTracking.status, status)
                )
            )
            .orderBy(desc(subscriptionTracking.renewalDate));

        const totalMonthly = subscriptions
            .filter(s => s.billingCycle === 'monthly')
            .reduce((sum, s) => sum + parseFloat(s.amount), 0);

        const totalYearly = subscriptions
            .filter(s => s.billingCycle === 'yearly')
            .reduce((sum, s) => sum + parseFloat(s.amount), 0);

        return new ApiResponse(200, {
            subscriptions,
            summary: {
                totalMonthly: Math.round(totalMonthly * 100) / 100,
                totalYearly: Math.round(totalYearly * 100) / 100,
                totalAnnualized: Math.round((totalMonthly * 12 + totalYearly) * 100) / 100
            }
        }, "Subscriptions retrieved successfully").send(res);
    })
);

/**
 * @route   PUT /api/recurring-payments/subscriptions/:id
 * @desc    Update subscription
 * @access  Private
 */
router.put(
    '/subscriptions/:id',
    protect,
    [param('id').isUUID()],
    asyncHandler(async (req, res, next) => {
        const [updated] = await db.update(subscriptionTracking)
            .set({
                ...req.body,
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(subscriptionTracking.id, req.params.id),
                    eq(subscriptionTracking.userId, req.user.id)
                )
            )
            .returning();

        if (!updated) {
            return next(new AppError(404, 'Subscription not found'));
        }

        return new ApiResponse(200, updated, 'Subscription updated successfully').send(res);
    })
);

/**
 * @route   DELETE /api/recurring-payments/subscriptions/:id
 * @desc    Cancel subscription
 * @access  Private
 */
router.delete(
    '/subscriptions/:id',
    protect,
    [param('id').isUUID()],
    asyncHandler(async (req, res, next) => {
        const [cancelled] = await db.update(subscriptionTracking)
            .set({
                status: 'cancelled',
                cancellationDate: new Date(),
                updatedAt: new Date()
            })
            .where(
                and(
                    eq(subscriptionTracking.id, req.params.id),
                    eq(subscriptionTracking.userId, req.user.id)
                )
            )
            .returning();

        if (!cancelled) {
            return next(new AppError(404, 'Subscription not found'));
        }

        return new ApiResponse(200, cancelled, 'Subscription cancelled successfully').send(res);
    })
);

export default router;
