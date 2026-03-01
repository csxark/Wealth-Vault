import { body, param } from 'express-validator';

/**
 * Categorization Validator
 */

export const validateRule = [
    body('categoryId').isUUID().withMessage('Category must be a valid UUID'),
    body('conditionType').isIn(['text_match', 'amount_range', 'combined']).withMessage('Invalid condition type'),
    body('conditionConfig').isObject().withMessage('Config must be an object'),
    body('conditionConfig.pattern').if(body('conditionType').equals('text_match')).notEmpty().withMessage('Pattern is required for text match'),
    body('priority').optional().isInt({ min: 0, max: 100 }).withMessage('Priority must be 0-100')
];

export const validateMerchant = [
    body('name').notEmpty().withMessage('Merchant name is required'),
    body('defaultCategoryId').optional().isUUID().withMessage('Invalid category ID'),
    body('website').optional().isURL().withMessage('Invalid website URL')
];

export const validateLearnRequest = [
    body('transactionId').isUUID().withMessage('Invalid transaction ID'),
    body('categoryId').isUUID().withMessage('Invalid category ID')
];

/**
 * Helper to ensure user owns the category
 */
export const checkCategoryOwnership = async (req, res, next) => {
    // Logic to verify categoryId belongs to user or is shared
    next();
};
