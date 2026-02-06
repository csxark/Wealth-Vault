import { body, validationResult } from 'express-validator';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'BTC', 'ETH'];

export const validateCurrencySupport = [
    body('currency').optional().isIn(SUPPORTED_CURRENCIES).withMessage('Currency not supported'),
    body('sourceCurrency').optional().isIn(SUPPORTED_CURRENCIES).withMessage('Source currency not supported'),
    body('targetCurrency').optional().isIn(SUPPORTED_CURRENCIES).withMessage('Target currency not supported'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

export const checkCurrencyFormat = (currency) => {
    return SUPPORTED_CURRENCIES.includes(currency);
};
