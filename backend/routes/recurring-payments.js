import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import recurringDetector from '../services/recurringDetector.js';
import billPaymentEngine from '../services/billPaymentEngine.js';
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
    asyncHandler(async (req, res) => {
        const result = await recurringDetector.detectRecurringTransactions(req.user.id);

        res.json({
            success: true,
            data: result,
            message: `Detected ${result.detected} recurring patterns`
        });
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
    asyncHandler(async (req, res) => {
        const { status = 'active' } = req.query;

        const recurring = await recurringDetector.getUserRecurringTransactions(
            req.user.id,
            status
        );

        res.json({
            success: true,
            data: recurring,
            count: recurring.length
        });
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
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
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

        res.status(201).json({
            success: true,
            data: recurring,
            message: 'Recurring transaction created'
        });
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
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const updated = await recurringDetector.updateRecurringTransaction(
            req.params.id,
            req.body
        );

        res.json({
            success: true,
            data: updated,
            message: 'Recurring transaction updated'
        });
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
    asyncHandler(async (req, res) => {
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

        res.json({
            success: true,
            data: cancelled,
            message: 'Recurring transaction cancelled'
        });
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
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const payment = await billPaymentEngine.schedulePayment(req.user.id, req.body);

        res.status(201).json({
            success: true,
            data: payment,
            message: 'Payment scheduled successfully'
        });
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
    asyncHandler(async (req, res) => {
        const { days = 30 } = req.query;

        const payments = await billPaymentEngine.getUpcomingPayments(
            req.user.id,
            parseInt(days)
        );

        res.json({
            success: true,
            data: payments,
            count: payments.length
        });
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
    asyncHandler(async (req, res) => {
        const { limit = 50 } = req.query;

        const payments = await billPaymentEngine.getPaymentHistory(
            req.user.id,
            parseInt(limit)
        );

        res.json({
            success: true,
            data: payments,
            count: payments.length
        });
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
    asyncHandler(async (req, res) => {
        const result = await billPaymentEngine.processAutoPay(req.params.id);

        res.json({
            success: result.success,
            data: result.payment,
            message: result.success ? 'Payment processed successfully' : 'Payment failed'
        });
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
    asyncHandler(async (req, res) => {
        const result = await billPaymentEngine.retryPayment(req.params.id);

        res.json({
            success: result.success,
            data: result.payment,
            message: result.success ? 'Payment retry successful' : 'Payment retry failed'
        });
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
    asyncHandler(async (req, res) => {
        const analytics = await billPaymentEngine.getPaymentAnalytics(req.user.id);

        res.json({
            success: true,
            data: analytics
        });
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
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
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

        res.status(201).json({
            success: true,
            data: subscription,
            message: 'Subscription added'
        });
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
    asyncHandler(async (req, res) => {
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

        res.json({
            success: true,
            data: subscriptions,
            count: subscriptions.length,
            summary: {
                totalMonthly: Math.round(totalMonthly * 100) / 100,
                totalYearly: Math.round(totalYearly * 100) / 100,
                totalAnnualized: Math.round((totalMonthly * 12 + totalYearly) * 100) / 100
            }
        });
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
    asyncHandler(async (req, res) => {
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

        res.json({
            success: true,
            data: updated,
            message: 'Subscription updated'
        });
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
    asyncHandler(async (req, res) => {
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

        res.json({
            success: true,
            data: cancelled,
            message: 'Subscription cancelled'
        });
    })
);

export default router;
