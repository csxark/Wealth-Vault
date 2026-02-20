import { body, param } from 'express-validator';

/**
 * History Validator - Validates time-travel and replay requests
 */

export const validateScenarioCreation = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Scenario name is required')
        .isLength({ min: 3, max: 100 })
        .withMessage('Scenario name must be between 3 and 100 characters'),

    body('startDate')
        .isISO8601()
        .withMessage('Valid start date is required')
        .custom((value) => {
            const startDate = new Date(value);
            const now = new Date();
            if (startDate > now) {
                throw new Error('Start date cannot be in the future');
            }
            return true;
        }),

    body('endDate')
        .isISO8601()
        .withMessage('Valid end date is required')
        .custom((value, { req }) => {
            const startDate = new Date(req.body.startDate);
            const endDate = new Date(value);
            const now = new Date();

            if (endDate > now) {
                throw new Error('End date cannot be in the future');
            }

            if (endDate <= startDate) {
                throw new Error('End date must be after start date');
            }

            // Limit to 5 years max
            const maxYears = 5;
            const yearsDiff = (endDate - startDate) / (1000 * 60 * 60 * 24 * 365);
            if (yearsDiff > maxYears) {
                throw new Error(`Date range cannot exceed ${maxYears} years`);
            }

            return true;
        }),

    body('whatIfChanges')
        .isArray({ min: 1 })
        .withMessage('At least one what-if change is required'),

    body('whatIfChanges.*.type')
        .isIn(['investment', 'expense_reduction', 'debt_payoff', 'income_increase'])
        .withMessage('Invalid change type'),

    body('whatIfChanges.*.date')
        .optional()
        .isISO8601()
        .withMessage('Valid date is required for change'),

    body('whatIfChanges.*.amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Amount must be a positive number'),

    body('whatIfChanges.*.asset')
        .optional()
        .trim()
        .isLength({ min: 1, max: 10 })
        .withMessage('Asset symbol must be between 1 and 10 characters')
        .matches(/^[A-Z0-9]+$/)
        .withMessage('Asset symbol must contain only uppercase letters and numbers'),
];

export const validateTimeTravelRequest = [
    body('targetDate')
        .isISO8601()
        .withMessage('Valid target date is required')
        .custom((value) => {
            const targetDate = new Date(value);
            const now = new Date();

            if (targetDate > now) {
                throw new Error('Cannot travel to future dates');
            }

            // Limit to 10 years in the past
            const tenYearsAgo = new Date();
            tenYearsAgo.setFullYear(now.getFullYear() - 10);

            if (targetDate < tenYearsAgo) {
                throw new Error('Cannot travel more than 10 years in the past');
            }

            return true;
        }),
];

export const validateQuickWhatIf = [
    body('startDate')
        .isISO8601()
        .withMessage('Valid start date is required'),

    body('endDate')
        .isISO8601()
        .withMessage('Valid end date is required')
        .custom((value, { req }) => {
            const startDate = new Date(req.body.startDate);
            const endDate = new Date(value);

            if (endDate <= startDate) {
                throw new Error('End date must be after start date');
            }

            // Limit quick analysis to 1 year
            const yearsDiff = (endDate - startDate) / (1000 * 60 * 60 * 24 * 365);
            if (yearsDiff > 1) {
                throw new Error('Quick analysis is limited to 1 year. Create a full scenario for longer periods.');
            }

            return true;
        }),

    body('whatIfChanges')
        .isArray({ min: 1, max: 5 })
        .withMessage('Quick analysis supports 1-5 what-if changes'),
];

export const validateScenarioComparison = [
    body('scenarioIds')
        .isArray({ min: 2, max: 10 })
        .withMessage('Comparison requires 2-10 scenarios'),

    body('scenarioIds.*')
        .isUUID()
        .withMessage('Invalid scenario ID format'),
];

export const validateHistoricalPriceRequest = [
    param('symbol')
        .trim()
        .notEmpty()
        .withMessage('Symbol is required')
        .isLength({ min: 1, max: 10 })
        .withMessage('Symbol must be between 1 and 10 characters')
        .matches(/^[A-Z0-9]+$/)
        .withMessage('Symbol must contain only uppercase letters and numbers'),

    body('startDate')
        .isISO8601()
        .withMessage('Valid start date is required'),

    body('endDate')
        .isISO8601()
        .withMessage('Valid end date is required')
        .custom((value, { req }) => {
            const startDate = new Date(req.body.startDate);
            const endDate = new Date(value);

            if (endDate <= startDate) {
                throw new Error('End date must be after start date');
            }

            return true;
        }),
];

/**
 * Validate investment what-if change
 */
export const validateInvestmentChange = (change) => {
    const errors = [];

    if (!change.asset) {
        errors.push('Investment change requires asset symbol');
    }

    if (!change.amount || parseFloat(change.amount) <= 0) {
        errors.push('Investment change requires positive amount');
    }

    if (!change.date) {
        errors.push('Investment change requires purchase date');
    }

    return errors;
};

/**
 * Validate expense reduction what-if change
 */
export const validateExpenseReductionChange = (change) => {
    const errors = [];

    if (!change.category) {
        errors.push('Expense reduction requires category ID');
    }

    if (!change.reductionPercent || parseFloat(change.reductionPercent) <= 0 || parseFloat(change.reductionPercent) > 100) {
        errors.push('Reduction percent must be between 0 and 100');
    }

    return errors;
};

/**
 * Validate debt payoff what-if change
 */
export const validateDebtPayoffChange = (change) => {
    const errors = [];

    if (!change.debtId) {
        errors.push('Debt payoff requires debt ID');
    }

    if (!change.extraPayment || parseFloat(change.extraPayment) <= 0) {
        errors.push('Extra payment must be positive');
    }

    return errors;
};

/**
 * Validate income increase what-if change
 */
export const validateIncomeIncreaseChange = (change) => {
    const errors = [];

    if (!change.increaseAmount || parseFloat(change.increaseAmount) <= 0) {
        errors.push('Income increase amount must be positive');
    }

    if (!change.startDate) {
        errors.push('Income increase requires start date');
    }

    return errors;
};

/**
 * Comprehensive what-if change validator
 */
export const validateWhatIfChange = (change) => {
    switch (change.type) {
        case 'investment':
            return validateInvestmentChange(change);
        case 'expense_reduction':
            return validateExpenseReductionChange(change);
        case 'debt_payoff':
            return validateDebtPayoffChange(change);
        case 'income_increase':
            return validateIncomeIncreaseChange(change);
        default:
            return ['Invalid change type'];
    }
};
