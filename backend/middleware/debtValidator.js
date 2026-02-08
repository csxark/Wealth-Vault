import { body, param, query } from 'express-validator';

export const validateDebt = [
    body('name').isString().notEmpty().withMessage('Debt name is required'),
    body('debtType').isIn(['credit_card', 'personal_loan', 'mortgage', 'auto_loan', 'student_loan', 'medical', 'other'])
        .withMessage('Invalid debt type'),
    body('principalAmount').isNumeric().withMessage('Principal amount must be a number'),
    body('currentBalance').isNumeric().withMessage('Current balance must be a number'),
    body('apr').isFloat({ min: 0, max: 1 }).withMessage('APR must be between 0 and 1'),
    body('minimumPayment').isNumeric().withMessage('Minimum payment must be a number'),
    body('paymentDueDay').optional().isInt({ min: 1, max: 31 }).withMessage('Payment due day must be between 1 and 31'),
    body('termMonths').optional().isInt({ min: 1 }).withMessage('Term months must be positive'),
    body('startDate').optional().isISO8601().withMessage('Invalid start date'),
    body('notes').optional().isString()
];

export const validateDebtPayment = [
    body('debtId').isUUID().withMessage('Valid debt ID is required'),
    body('paymentAmount').isNumeric().withMessage('Payment amount must be a number'),
    body('paymentDate').optional().isISO8601().withMessage('Invalid payment date'),
    body('paymentMethod').optional().isString()
];

export const validatePayoffStrategy = [
    body('strategyName').isIn(['avalanche', 'snowball', 'custom']).withMessage('Invalid strategy name'),
    body('monthlyExtraPayment').optional().isNumeric().withMessage('Extra payment must be a number'),
    body('customPriorityOrder').optional().isArray().withMessage('Priority order must be an array')
];

export const validateDebtId = [
    param('id').isUUID().withMessage('Invalid debt ID format')
];
