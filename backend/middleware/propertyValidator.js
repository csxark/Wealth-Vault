import { body, param } from 'express-validator';

export const validateProperty = [
    body('address')
        .notEmpty().withMessage('Property address is required')
        .isLength({ min: 5 }).withMessage('Address seems too short'),
    body('propertyType')
        .isIn(['residential', 'commercial', 'industrial', 'land'])
        .withMessage('Invalid property type'),
    body('purchasePrice')
        .isFloat({ gt: 0 }).withMessage('Purchase price must be a positive number'),
    body('units')
        .optional()
        .isInt({ min: 1 }).withMessage('Units must be at least 1')
];

export const validateLease = [
    body('tenantName').notEmpty().withMessage('Tenant name is required'),
    body('leaseStart').isISO8601().withMessage('Valid lease start date is required'),
    body('leaseEnd').isISO8601().withMessage('Valid lease end date is required'),
    body('monthlyRent').isFloat({ gt: 0 }).withMessage('Monthly rent must be positive'),
    body('propertyId').isUUID().withMessage('Valid Property ID is required')
];

export const validateMaintenance = [
    body('taskName').notEmpty().withMessage('Task name is required'),
    body('category').isIn(['repair', 'renovation', 'routine', 'emergency']),
    body('cost').optional().isFloat({ min: 0 })
];
