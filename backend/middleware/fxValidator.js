
import { body, validationResult } from 'express-validator';

/**
 * Validates currency conversion requests
 */
export const validateConversion = [
    body('sourceCurrency').isLength({ min: 3, max: 3 }).withMessage('Source currency must be a 3-letter ISO code'),
    body('targetCurrency').isLength({ min: 3, max: 3 }).withMessage('Target currency must be a 3-letter ISO code'),
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
    (req, res, next) => {
        const { sourceCurrency, targetCurrency } = req.body;

        if (sourceCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
            return res.status(400).json({
                success: false,
                message: "Self-currency conversion is not permitted."
            });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        next();
    }
];

/**
 * Validates wallet creation
 */
export const validateWallet = [
    body('currency').isLength({ min: 3, max: 3 }).withMessage('Currency must be a 3-letter ISO code'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        next();
    }
];
