import { body, param } from 'express-validator';

/**
 * Settlement Guard - Validates settlement-related requests
 */

export const validateSettlementCreation = [
    body('title')
        .notEmpty()
        .withMessage('Title is required')
        .isLength({ max: 200 })
        .withMessage('Title must not exceed 200 characters'),

    body('totalAmount')
        .isFloat({ min: 0.01 })
        .withMessage('Total amount must be greater than 0'),

    body('splitType')
        .isIn(['equal', 'percentage', 'custom', 'weighted'])
        .withMessage('Invalid split type'),

    body('participants')
        .isArray({ min: 1 })
        .withMessage('At least one participant is required'),

    body('participants.*.userId')
        .notEmpty()
        .withMessage('Each participant must have a userId'),

    body('dueDate')
        .optional()
        .isISO8601()
        .withMessage('Due date must be a valid date')
        .custom((value) => {
            const dueDate = new Date(value);
            const now = new Date();
            if (dueDate < now) {
                throw new Error('Due date cannot be in the past');
            }
            return true;
        }),

    body('currency')
        .optional()
        .isIn(['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD'])
        .withMessage('Invalid currency'),
];

export const validatePaymentRecord = [
    body('amount')
        .isFloat({ min: 0.01 })
        .withMessage('Payment amount must be greater than 0'),

    body('paymentMethod')
        .optional()
        .isIn(['cash', 'card', 'bank_transfer', 'venmo', 'paypal', 'zelle', 'other'])
        .withMessage('Invalid payment method'),

    body('paymentReference')
        .optional()
        .isString()
        .isLength({ max: 100 })
        .withMessage('Payment reference must not exceed 100 characters'),

    body('notes')
        .optional()
        .isString()
        .isLength({ max: 500 })
        .withMessage('Notes must not exceed 500 characters'),
];

export const validateSettlementAccess = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // In production, verify user is part of the settlement
        // For now, allow access
        next();
    } catch (error) {
        res.status(403).json({
            success: false,
            message: 'Access denied to this settlement'
        });
    }
};

/**
 * Validate split rule for percentage split
 */
export const validatePercentageSplit = (participants) => {
    const totalPercentage = participants.reduce((sum, p) =>
        sum + (p.percentage || 0), 0
    );

    if (Math.abs(totalPercentage - 100) > 0.01) {
        throw new Error(`Percentages must sum to 100% (got ${totalPercentage}%)`);
    }

    return true;
};

/**
 * Validate split rule for custom split
 */
export const validateCustomSplit = (totalAmount, participants) => {
    const totalCustom = participants.reduce((sum, p) =>
        sum + (p.amount || 0), 0
    );

    if (Math.abs(totalCustom - totalAmount) > 0.01) {
        throw new Error(`Custom amounts must sum to total (got ${totalCustom}, expected ${totalAmount})`);
    }

    return true;
};

/**
 * Validate participant list
 */
export const validateParticipants = (participants) => {
    if (!participants || participants.length === 0) {
        throw new Error('At least one participant is required');
    }

    const userIds = new Set();
    for (const participant of participants) {
        if (!participant.userId) {
            throw new Error('Each participant must have a userId');
        }

        if (userIds.has(participant.userId)) {
            throw new Error('Duplicate participants are not allowed');
        }

        userIds.add(participant.userId);
    }

    return true;
};

/**
 * Validate payment amount against transaction
 */
export const validatePaymentAmount = (amount, transaction) => {
    const amountRemaining = parseFloat(transaction.amountRemaining);

    if (amount > amountRemaining) {
        throw new Error(`Payment amount (${amount}) exceeds remaining amount (${amountRemaining})`);
    }

    if (amount <= 0) {
        throw new Error('Payment amount must be greater than 0');
    }

    return true;
};

/**
 * Check if user can cancel settlement
 */
export const canCancelSettlement = (settlement, userId) => {
    if (settlement.creatorId !== userId) {
        throw new Error('Only the creator can cancel a settlement');
    }

    if (settlement.status === 'completed') {
        throw new Error('Cannot cancel a completed settlement');
    }

    if (settlement.status === 'cancelled') {
        throw new Error('Settlement is already cancelled');
    }

    return true;
};

/**
 * Validate settlement status transition
 */
export const validateStatusTransition = (currentStatus, newStatus) => {
    const validTransitions = {
        'pending': ['partial', 'completed', 'cancelled'],
        'partial': ['completed', 'cancelled'],
        'completed': [],
        'cancelled': []
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
        throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }

    return true;
};

/**
 * Validate recurring settlement configuration
 */
export const validateRecurringSettings = [
    body('isRecurring')
        .optional()
        .isBoolean()
        .withMessage('isRecurring must be a boolean'),

    body('recurringFrequency')
        .if(body('isRecurring').equals(true))
        .isIn(['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'])
        .withMessage('Invalid recurring frequency'),
];

/**
 * Validate split rule based on type
 */
export const validateSplitRuleByType = (splitType, participants, totalAmount) => {
    switch (splitType) {
        case 'percentage':
            return validatePercentageSplit(participants);
        case 'custom':
            return validateCustomSplit(totalAmount, participants);
        case 'equal':
        case 'weighted':
            return validateParticipants(participants);
        default:
            throw new Error(`Unsupported split type: ${splitType}`);
    }
};

/**
 * Check settlement limits
 */
export const checkSettlementLimits = (totalAmount, participantCount) => {
    const MAX_AMOUNT = 1000000; // $1M
    const MAX_PARTICIPANTS = 50;

    if (totalAmount > MAX_AMOUNT) {
        throw new Error(`Settlement amount cannot exceed ${MAX_AMOUNT}`);
    }

    if (participantCount > MAX_PARTICIPANTS) {
        throw new Error(`Cannot have more than ${MAX_PARTICIPANTS} participants`);
    }

    return true;
};

/**
 * Validate itemized split
 */
export const validateItemizedSplit = [
    body('items')
        .isArray()
        .withMessage('Items must be an array'),

    body('items.*.userId')
        .notEmpty()
        .withMessage('Each item must have a userId'),

    body('items.*.amount')
        .isFloat({ min: 0.01 })
        .withMessage('Each item amount must be greater than 0'),

    body('items.*.description')
        .optional()
        .isString()
        .isLength({ max: 200 })
        .withMessage('Item description must not exceed 200 characters'),

    body('sharedItems')
        .optional()
        .isArray()
        .withMessage('Shared items must be an array'),

    body('sharedItems.*.amount')
        .optional()
        .isFloat({ min: 0.01 })
        .withMessage('Shared item amount must be greater than 0'),
];

/**
 * Middleware to enforce rate limiting on settlement creation
 */
export const settlementRateLimit = (req, res, next) => {
    // In production, implement actual rate limiting
    // For now, allow all requests
    next();
};
