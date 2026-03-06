// backend/routes/logRedaction.js
// Issue #650: Fine-Grained Log Redaction Engine API Routes

import express from 'express';
import { body, validationResult, query, param } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { validateTenantAccess, requireTenantPermission } from '../middleware/tenantMiddleware.js';
import {
    createRedactionRule,
    updateRedactionRule,
    deleteRedactionRule,
    listRedactionRules,
    testRedactionRule,
    detokenizeValue,
    REDACTION_TYPES,
    SENSITIVE_FIELD_TYPES
} from '../services/logRedactionService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

/**
 * GET /api/log-redaction/rules
 * Get all redaction rules for the tenant
 */
router.get(
    '/rules',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:view', 'compliance:manage']),
    async (req, res) => {
        try {
            const rules = await listRedactionRules(req.tenantId);

            res.json({
                success: true,
                data: rules,
                count: rules.length
            });

        } catch (error) {
            logger.error('Error listing redaction rules', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to list redaction rules'
            });
        }
    }
);

/**
 * POST /api/log-redaction/rules
 * Create a new redaction rule
 */
router.post(
    '/rules',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:manage', 'compliance:manage']),
    [
        body('fieldPath')
            .trim()
            .notEmpty()
            .withMessage('Field path is required')
            .matches(/^[a-zA-Z_][a-zA-Z0-9_.]*$/)
            .withMessage('Invalid field path format'),
        body('redactionType')
            .isIn(Object.values(REDACTION_TYPES))
            .withMessage('Invalid redaction type'),
        body('fieldType')
            .optional()
            .isIn(Object.values(SENSITIVE_FIELD_TYPES))
            .withMessage('Invalid field type'),
        body('pattern')
            .optional()
            .isString()
            .withMessage('Pattern must be a string'),
        body('priority')
            .optional()
            .isInt({ min: 0, max: 100 })
            .withMessage('Priority must be between 0 and 100'),
        body('description')
            .optional()
            .isLength({ max: 500 })
            .withMessage('Description must be at most 500 characters')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const ruleData = {
                ...req.body,
                createdBy: req.user.id
            };

            const rule = await createRedactionRule(req.tenantId, ruleData);

            res.status(201).json({
                success: true,
                data: rule,
                message: 'Redaction rule created successfully'
            });

        } catch (error) {
            logger.error('Error creating redaction rule', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to create redaction rule'
            });
        }
    }
);

/**
 * PUT /api/log-redaction/rules/:ruleId
 * Update a redaction rule
 */
router.put(
    '/rules/:ruleId',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:manage', 'compliance:manage']),
    [
        param('ruleId')
            .isUUID()
            .withMessage('Invalid rule ID'),
        body('fieldPath')
            .optional()
            .trim()
            .matches(/^[a-zA-Z_][a-zA-Z0-9_.]*$/)
            .withMessage('Invalid field path format'),
        body('redactionType')
            .optional()
            .isIn(Object.values(REDACTION_TYPES))
            .withMessage('Invalid redaction type'),
        body('fieldType')
            .optional()
            .isIn(Object.values(SENSITIVE_FIELD_TYPES))
            .withMessage('Invalid field type'),
        body('priority')
            .optional()
            .isInt({ min: 0, max: 100 })
            .withMessage('Priority must be between 0 and 100')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const { ruleId } = req.params;
            const updates = {
                ...req.body,
                updatedAt: new Date()
            };

            await updateRedactionRule(ruleId, req.tenantId, updates);

            res.json({
                success: true,
                message: 'Redaction rule updated successfully'
            });

        } catch (error) {
            logger.error('Error updating redaction rule', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to update redaction rule'
            });
        }
    }
);

/**
 * DELETE /api/log-redaction/rules/:ruleId
 * Delete a redaction rule
 */
router.delete(
    '/rules/:ruleId',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:manage', 'compliance:manage']),
    [
        param('ruleId')
            .isUUID()
            .withMessage('Invalid rule ID')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const { ruleId } = req.params;
            await deleteRedactionRule(ruleId, req.tenantId);

            res.json({
                success: true,
                message: 'Redaction rule deleted successfully'
            });

        } catch (error) {
            logger.error('Error deleting redaction rule', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to delete redaction rule'
            });
        }
    }
);

/**
 * POST /api/log-redaction/test
 * Test a redaction rule configuration
 */
router.post(
    '/test',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:view', 'compliance:manage']),
    [
        body('fieldPath')
            .trim()
            .notEmpty()
            .withMessage('Field path is required'),
        body('redactionType')
            .isIn(Object.values(REDACTION_TYPES))
            .withMessage('Invalid redaction type'),
        body('fieldType')
            .optional()
            .isIn(Object.values(SENSITIVE_FIELD_TYPES))
            .withMessage('Invalid field type'),
        body('testValue')
            .notEmpty()
            .withMessage('Test value is required'),
        body('pattern')
            .optional()
            .isString()
            .withMessage('Pattern must be a string')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const { testValue, ...ruleData } = req.body;

            const result = await testRedactionRule(req.tenantId, ruleData, testValue);

            res.json({
                success: true,
                data: result
            });

        } catch (error) {
            logger.error('Error testing redaction rule', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to test redaction rule'
            });
        }
    }
);

/**
 * POST /api/log-redaction/detokenize
 * Detokenize a redacted value (for authorized users only)
 */
router.post(
    '/detokenize',
    protect,
    validateTenantAccess,
    requireTenantPermission(['audit:manage', 'compliance:manage']),
    [
        body('token')
            .trim()
            .notEmpty()
            .withMessage('Token is required')
            .matches(/^REDACTED_[a-f0-9\-]+$/)
            .withMessage('Invalid token format')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    errors: errors.array()
                });
            }

            const { token } = req.body;
            const originalValue = await detokenizeValue(token);

            // Log the detokenization for audit
            logger.info('Value detokenized', {
                tenantId: req.tenantId,
                userId: req.user.id,
                tokenPrefix: token.substring(0, 20) + '...'
            });

            res.json({
                success: true,
                data: {
                    originalValue,
                    wasDetokenized: originalValue !== token
                }
            });

        } catch (error) {
            logger.error('Error detokenizing value', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to detokenize value'
            });
        }
    }
);

/**
 * GET /api/log-redaction/types
 * Get available redaction types and field types
 */
router.get(
    '/types',
    protect,
    async (req, res) => {
        res.json({
            success: true,
            data: {
                redactionTypes: REDACTION_TYPES,
                sensitiveFieldTypes: SENSITIVE_FIELD_TYPES
            }
        });
    }
);

export default router;