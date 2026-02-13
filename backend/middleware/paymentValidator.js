import { body, param, query } from 'express-validator';

/**
 * Payment Validator Middleware
 * Validates recurring payment and subscription requests
 */

// Validate recurring transaction creation
export const validateRecurringTransaction = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Transaction name is required')
        .isLength({ max: 100 })
        .withMessage('Name must be less than 100 characters'),

    body('amount')
        .isFloat({ min: 0.01, max: 1000000 })
        .withMessage('Amount must be between $0.01 and $1,000,000'),

    body('frequency')
        .isIn(['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'])
        .withMessage('Invalid frequency'),

    body('nextDueDate')
        .isISO8601()
        .withMessage('Valid due date required')
        .custom((value) => {
            const dueDate = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (dueDate < today) {
                throw new Error('Due date cannot be in the past');
            }
            return true;
        }),

    body('categoryId')
        .optional()
        .isUUID()
        .withMessage('Invalid category ID'),

    body('isAutoPayEnabled')
        .optional()
        .isBoolean()
        .withMessage('Auto-pay must be boolean'),
];

// Validate scheduled payment
export const validateScheduledPayment = [
    body('payeeName')
        .trim()
        .notEmpty()
        .withMessage('Payee name is required')
        .isLength({ max: 100 })
        .withMessage('Payee name must be less than 100 characters'),

    body('amount')
        .isFloat({ min: 0.01, max: 1000000 })
        .withMessage('Amount must be between $0.01 and $1,000,000'),

    body('scheduledDate')
        .isISO8601()
        .withMessage('Valid scheduled date required')
        .custom((value) => {
            const scheduledDate = new Date(value);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (scheduledDate < today) {
                throw new Error('Scheduled date cannot be in the past');
            }
            return true;
        }),

    body('dueDate')
        .optional()
        .isISO8601()
        .withMessage('Valid due date required'),

    body('paymentMethod')
        .optional()
        .isIn(['credit_card', 'debit_card', 'bank_account', 'cash', 'check', 'other'])
        .withMessage('Invalid payment method'),

    body('isAutoPay')
        .optional()
        .isBoolean()
        .withMessage('Auto-pay must be boolean'),
];

// Validate subscription
export const validateSubscription = [
    body('serviceName')
        .trim()
        .notEmpty()
        .withMessage('Service name is required')
        .isLength({ max: 100 })
        .withMessage('Service name must be less than 100 characters'),

    body('amount')
        .isFloat({ min: 0.01, max: 100000 })
        .withMessage('Amount must be between $0.01 and $100,000'),

    body('billingCycle')
        .isIn(['weekly', 'monthly', 'quarterly', 'yearly'])
        .withMessage('Invalid billing cycle'),

    body('startDate')
        .isISO8601()
        .withMessage('Valid start date required'),

    body('renewalDate')
        .isISO8601()
        .withMessage('Valid renewal date required')
        .custom((value, { req }) => {
            const renewalDate = new Date(value);
            const startDate = new Date(req.body.startDate);

            if (renewalDate <= startDate) {
                throw new Error('Renewal date must be after start date');
            }
            return true;
        }),

    body('category')
        .optional()
        .isIn(['streaming', 'software', 'utilities', 'fitness', 'education', 'entertainment', 'other'])
        .withMessage('Invalid category'),

    body('autoRenew')
        .optional()
        .isBoolean()
        .withMessage('Auto-renew must be boolean'),
];

// Validate payment ID parameter
export const validatePaymentId = [
    param('id')
        .isUUID()
        .withMessage('Invalid payment ID format'),
];

// Validate query parameters
export const validatePaymentQuery = [
    query('status')
        .optional()
        .isIn(['pending', 'processing', 'completed', 'failed', 'cancelled'])
        .withMessage('Invalid status'),

    query('days')
        .optional()
        .isInt({ min: 1, max: 365 })
        .withMessage('Days must be between 1 and 365'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 500 })
        .withMessage('Limit must be between 1 and 500'),
];

// Validate subscription status
export const validateSubscriptionStatus = [
    query('status')
        .optional()
        .isIn(['active', 'cancelled', 'expired', 'trial'])
        .withMessage('Invalid subscription status'),
];

// Validate recurring transaction status
export const validateRecurringStatus = [
    query('status')
        .optional()
        .isIn(['active', 'paused', 'cancelled', 'completed'])
        .withMessage('Invalid recurring transaction status'),
];

// Custom validator: Check payment amount limits
export const checkPaymentLimits = (req, res, next) => {
    const { amount, isAutoPay } = req.body;

    if (isAutoPay && parseFloat(amount) > 10000) {
        return res.status(400).json({
            success: false,
            message: 'Auto-pay limit is $10,000. Please process manually for larger amounts.'
        });
    }

    next();
};

// Custom validator: Check subscription renewal logic
export const validateSubscriptionRenewal = (req, res, next) => {
    const { billingCycle, renewalDate, startDate } = req.body;

    if (!billingCycle || !renewalDate || !startDate) {
        return next();
    }

    const start = new Date(startDate);
    const renewal = new Date(renewalDate);
    const diffDays = Math.ceil((renewal - start) / (1000 * 60 * 60 * 24));

    const expectedDays = {
        weekly: 7,
        monthly: 30,
        quarterly: 90,
        yearly: 365
    };

    const tolerance = billingCycle === 'monthly' ? 5 : 10;
    const expected = expectedDays[billingCycle];

    if (Math.abs(diffDays - expected) > tolerance) {
        return res.status(400).json({
            success: false,
            message: `Renewal date doesn't match billing cycle. Expected ~${expected} days for ${billingCycle} billing.`
        });
    }

    next();
};

// Custom validator: Prevent duplicate recurring transactions
export const checkDuplicateRecurring = async (req, res, next) => {
    // This would query the database to check for duplicates
    // Placeholder for now
    next();
};

// Custom validator: Validate payment method for auto-pay
export const validateAutoPayMethod = (req, res, next) => {
    const { isAutoPay, paymentMethod } = req.body;

    if (isAutoPay && !paymentMethod) {
        return res.status(400).json({
            success: false,
            message: 'Payment method is required for auto-pay'
        });
    }

    if (isAutoPay && paymentMethod === 'cash') {
        return res.status(400).json({
            success: false,
            message: 'Cash payments cannot be automated'
        });
    }

    next();
};

// Custom validator: Check payment date logic
export const validatePaymentDates = (req, res, next) => {
    const { scheduledDate, dueDate } = req.body;

    if (scheduledDate && dueDate) {
        const scheduled = new Date(scheduledDate);
        const due = new Date(dueDate);

        if (scheduled > due) {
            return res.status(400).json({
                success: false,
                message: 'Scheduled date cannot be after due date'
            });
        }

        // Warn if scheduling too close to due date
        const daysDiff = Math.ceil((due - scheduled) / (1000 * 60 * 60 * 24));
        if (daysDiff < 1) {
            req.warning = 'Payment is scheduled very close to due date';
        }
    }

    next();
};

// Custom validator: Validate frequency changes
export const validateFrequencyChange = (req, res, next) => {
    const { frequency } = req.body;

    if (frequency) {
        const validFrequencies = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'];

        if (!validFrequencies.includes(frequency)) {
            return res.status(400).json({
                success: false,
                message: `Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`
            });
        }
    }

    next();
};

// Custom validator: Check subscription trial period
export const validateTrialPeriod = (req, res, next) => {
    const { trialEndDate, startDate } = req.body;

    if (trialEndDate) {
        const trial = new Date(trialEndDate);
        const start = new Date(startDate);

        if (trial <= start) {
            return res.status(400).json({
                success: false,
                message: 'Trial end date must be after start date'
            });
        }

        const trialDays = Math.ceil((trial - start) / (1000 * 60 * 60 * 24));
        if (trialDays > 365) {
            return res.status(400).json({
                success: false,
                message: 'Trial period cannot exceed 365 days'
            });
        }
    }

    next();
};
