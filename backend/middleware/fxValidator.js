import { body, validationResult } from 'express-validator';

export const validateWalletCreation = [
    body('currency')
        .isString()
        .isLength({ min: 3, max: 3 })
        .withMessage('Currency must be a 3-letter ISO code')
        .toUpperCase(),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        next();
    }
];

export const validateConversion = [
    body('sourceCurrency')
        .isString()
        .isLength({ min: 3, max: 3 })
        .withMessage('Source currency must be a 3-letter ISO code')
        .toUpperCase(),
    body('targetCurrency')
        .isString()
        .isLength({ min: 3, max: 3 })
        .withMessage('Target currency must be a 3-letter ISO code')
        .toUpperCase(),
    body('amount')
        .isFloat({ gt: 0 })
        .withMessage('Amount must be greater than 0'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        // Anti-fraud check: Prevent same currency conversion
        if (req.body.sourceCurrency === req.body.targetCurrency) {
            return res.status(400).json({
                success: false,
                message: 'Source and target currency cannot be the same'
            });
        }

        next();
    }
];
