/**
 * Middleware to validate tax-related inputs
 */

export const validateTaxYear = (req, res, next) => {
    const { taxYear } = req.body || req.query || {};

    if (!taxYear) return next();

    const year = parseInt(taxYear);
    const currentYear = new Date().getFullYear();

    if (year < 2020 || year > currentYear + 1) {
        return res.status(400).json({
            success: false,
            message: `Tax year must be between 2020 and ${currentYear + 1}`
        });
    }

    next();
};

export const validateFiscalYear = (req, res, next) => {
    const { startDate, endDate } = req.body || req.query || {};

    if (!startDate || !endDate) return next();

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
        return res.status(400).json({
            success: false,
            message: 'Start date must be before end date'
        });
    }

    const daysDiff = (end - start) / (1000 * 60 * 60 * 24);

    if (daysDiff > 366) {
        return res.status(400).json({
            success: false,
            message: 'Fiscal period cannot exceed 366 days'
        });
    }

    next();
};

export const validateDeductionCategory = (req, res, next) => {
    const { category } = req.body || {};

    if (!category) return next();

    const validCategories = [
        'business_expense',
        'medical',
        'charitable',
        'mortgage_interest',
        'education',
        'vehicle',
        'home_office',
        'other'
    ];

    if (!validCategories.includes(category)) {
        return res.status(400).json({
            success: false,
            message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
        });
    }

    next();
};

export const validateFilingStatus = (req, res, next) => {
    const { filingStatus } = req.body || {};

    if (!filingStatus) return next();

    const validStatuses = [
        'single',
        'married_joint',
        'married_separate',
        'head_of_household'
    ];

    if (!validStatuses.includes(filingStatus)) {
        return res.status(400).json({
            success: false,
            message: `Invalid filing status. Must be one of: ${validStatuses.join(', ')}`
        });
    }

    next();
};

export default {
    validateTaxYear,
    validateFiscalYear,
    validateDeductionCategory,
    validateFilingStatus
};
