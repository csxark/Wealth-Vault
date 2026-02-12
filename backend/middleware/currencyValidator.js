import { body, query } from 'express-validator';

/**
 * Currency Validator
 */

export const validateCurrencyCode = [
    body('currencyCode')
        .isLength({ min: 3, max: 3 })
        .withMessage('Currency code must be exactly 3 characters (e.g., USD)')
        .isUppercase()
        .withMessage('Currency code must be uppercase')
];

export const validateConversion = [
    body('amount').isFloat({ min: 0 }).withMessage('Amount must be positive'),
    body('from').isLength({ min: 3, max: 3 }).isUppercase(),
    body('to').isLength({ min: 3, max: 3 }).isUppercase()
];

export const validateHedge = [
    body('notionalAmount').isFloat({ min: 0.01 }).withMessage('Notional amount must be greater than zero'),
    body('hedgeType').isIn(['forward', 'option', 'swap']).withMessage('Invalid hedge type'),
    body('expiryDate').optional().isISO8601().withMessage('Invalid expiry date')
];

/**
 * Check if the currency is supported by the system
 */
export const isSupportedCurrency = (req, res, next) => {
    const supported = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD', 'BTC', 'ETH'];
    const { from, to, currencyCode } = req.body;

    const codesToCheck = [from, to, currencyCode].filter(Boolean);

    for (const code of codesToCheck) {
        if (!supported.includes(code)) {
            return res.status(400).json({
                success: false,
                message: `Currency ${code} is not currently supported for real-time tracking.`
            });
        }
    }
    next();
};
