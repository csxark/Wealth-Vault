import express from 'express';
import { body, param, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import categorizationEngine from '../services/categorizationEngine.js';
import merchantRecognizer from '../services/merchantRecognizer.js';
import db from '../config/db.js';
import { categorizationRules, merchants, expenses } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   POST /api/categorization/suggest
 * @desc    Get category suggestion for a transaction description
 * @access  Private
 */
router.post(
    '/suggest',
    protect,
    [
        body('description').notEmpty().withMessage('Description is required'),
        body('amount').optional().isFloat(),
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const suggestion = await categorizationEngine.categorizeTransaction(req.user.id, req.body);
        res.json({ success: true, data: suggestion });
    })
);

/**
 * @route   POST /api/categorization/rules
 * @desc    Create a new categorization rule
 * @access  Private
 */
router.post(
    '/rules',
    protect,
    [
        body('categoryId').isUUID().withMessage('Valid category ID required'),
        body('conditionType').isIn(['text_match', 'amount_range', 'combined']),
        body('conditionConfig').isObject()
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

        const [rule] = await db.insert(categorizationRules)
            .values({ ...req.body, userId: req.user.id })
            .returning();

        res.status(201).json({ success: true, data: rule });
    })
);

/**
 * @route   GET /api/categorization/rules
 * @desc    Get all active rules for user
 * @access  Private
 */
router.get(
    '/rules',
    protect,
    asyncHandler(async (req, res) => {
        const rules = await db.select().from(categorizationRules).where(eq(categorizationRules.userId, req.user.id));
        res.json({ success: true, data: rules });
    })
);

/**
 * @route   POST /api/categorization/bulk-refresh
 * @desc    Recategorize existing transactions based on new rules/patterns
 * @access  Private
 */
router.post(
    '/bulk-refresh',
    protect,
    asyncHandler(async (req, res) => {
        const results = await categorizationEngine.bulkRecategorize(req.user.id);
        res.json({ success: true, data: results });
    })
);

/**
 * @route   POST /api/categorization/learn
 * @desc    Manual override/confirmation to train the engine
 * @access  Private
 */
router.post(
    '/learn',
    protect,
    [
        body('transactionId').isUUID(),
        body('categoryId').isUUID()
    ],
    asyncHandler(async (req, res) => {
        await categorizationEngine.learn(req.user.id, req.body.transactionId, req.body.categoryId);
        res.json({ success: true, message: 'Engine trained successfully' });
    })
);

/**
 * @route   GET /api/categorization/merchants
 * @desc    Get recognized merchants for user
 * @access  Private
 */
router.get(
    '/merchants',
    protect,
    asyncHandler(async (req, res) => {
        const result = await db.select().from(merchants).where(eq(merchants.userId, req.user.id));
        res.json({ success: true, data: result });
    })
);

/**
 * @route   PUT /api/categorization/merchants/:id
 * @desc    Update merchant defaults
 * @access  Private
 */
router.put(
    '/merchants/:id',
    protect,
    asyncHandler(async (req, res) => {
        const [updated] = await db.update(merchants)
            .set(req.body)
            .where(and(eq(merchants.id, req.params.id), eq(merchants.userId, req.user.id)))
            .returning();
        res.json({ success: true, data: updated });
    })
);

export default router;
