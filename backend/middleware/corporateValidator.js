
import { body, param, validationResult } from 'express-validator';
import db from '../config/db.js';
import { corporateEntities } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Validates that the entity belongs to the requesting user
 */
export const validateEntityOwnership = async (req, res, next) => {
    const entityId = req.params.entityId || req.body.entityId;
    if (!entityId) return next();

    const [entity] = await db.select().from(corporateEntities).where(
        and(
            eq(corporateEntities.id, entityId),
            eq(corporateEntities.userId, req.user.id)
        )
    );

    if (!entity) {
        return res.status(403).json({ success: false, message: "Entity not found or access denied" });
    }

    req.entity = entity;
    next();
};

/**
 * Validation rules for entity creation
 */
export const createEntityValidator = [
    body('name').notEmpty().withMessage('Business name is required'),
    body('legalForm').isIn(['LLC', 'S-Corp', 'C-Corp', 'Trust', 'Holding']).withMessage('Invalid legal form'),
    body('taxId').matches(/^\d{2}-\d{7}$/).withMessage('Tax ID must be in EIN format (XX-XXXXXXX)').optional({ checkFalsy: true }),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        next();
    }
];

/**
 * Validation rules for payroll processing
 */
export const payrollValidator = [
    body('periodStart').isISO8601().withMessage('Invalid start date'),
    body('periodEnd').isISO8601().withMessage('Invalid end date'),
    body('totalGross').isNumeric().withMessage('Total gross must be a number'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        next();
    }
];
