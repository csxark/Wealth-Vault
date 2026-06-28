import express from 'express';
import { validationResult, body, param, query } from 'express-validator';
import { protect, checkOwnership } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import smartCategorizationEngine from '../services/smartCategorizationEngine.js';
import merchantRecognizer from '../services/merchantRecognizer.js';
import categoryRuleEngine from '../services/categoryRuleEngine.js';
import receiptOCRService from '../services/receiptOCRService.js';
import db from '../config/db.js';
import { expenses, merchants, categorizationRules, merchantRatings, ocrResults } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import multer from 'multer';
import path from 'path';

/**
 * Smart Categorization API Routes
 * Issue #639: Smart Expense Categorization & Merchant Recognition
 */

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// ============================================================================
// SMART CATEGORIZATION ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/smart-categorization/categorize/{expenseId}:
 *   post:
 *     summary: Auto-categorize a single expense
 *     tags: [Smart Categorization]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema:
 *           type: string
 *         description: Expense ID to categorize
 *     responses:
 *       200:
 *         description: Categorization suggestion
 */
router.post(
    '/categorize/:expenseId',
    protect,
    param('expenseId').isUUID(),
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const result = await smartCategorizationEngine.categorizeExpense(
            req.params.expenseId,
            req.userId
        );

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/categorize-batch:
 *   post:
 *     summary: Auto-categorize multiple expenses
 *     tags: [Smart Categorization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               expenseIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Batch categorization results
 */
router.post(
    '/categorize-batch',
    protect,
    body('expenseIds').isArray({ min: 1, max: 100 }),
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const result = await smartCategorizationEngine.batchCategorize(
            req.userId,
            req.body.expenseIds
        );

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/suggestions/{expenseId}:
 *   get:
 *     summary: Get categorization suggestions for an expense
 *     tags: [Smart Categorization]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: expenseId
 *         required: true
 *         schema:
 *           type: string
 */
router.get(
    '/suggestions/:expenseId',
    protect,
    param('expenseId').isUUID(),
    asyncHandler(async (req, res) => {
        const result = await smartCategorizationEngine.categorizeExpense(
            req.params.expenseId,
            req.userId
        );

        res.json({
            success: true,
            suggestions: result.allSuggestions,
            topSuggestion: result.topSuggestion,
            confidence: result.confidence
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/correct-category:
 *   post:
 *     summary: Record user correction for training
 *     tags: [Smart Categorization]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/correct-category',
    protect,
    body('expenseId').isUUID(),
    body('correctedCategoryId').isUUID(),
    body('feedback').optional().isString(),
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const correction = await smartCategorizationEngine.recordCorrection(
            req.body.expenseId,
            req.userId,
            req.body.correctedCategoryId,
            req.body.originalCategoryId,
            req.body.feedback
        );

        res.json({
            success: true,
            data: correction
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/stats:
 *   get:
 *     summary: Get categorization statistics
 *     tags: [Smart Categorization]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: daysBack
 *         schema:
 *           type: integer
 *           default: 30
 */
router.get(
    '/stats',
    protect,
    query('daysBack').optional().isInt({ min: 1, max: 365 }),
    asyncHandler(async (req, res) => {
        const daysBack = parseInt(req.query.daysBack) || 30;
        const stats = await smartCategorizationEngine.getCategorizationStats(
            req.userId,
            daysBack
        );

        res.json({
            success: true,
            data: stats
        });
    })
);

// ============================================================================
// MERCHANT MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/smart-categorization/merchants:
 *   get:
 *     summary: Get user's merchants
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/merchants',
    protect,
    asyncHandler(async (req, res) => {
        const userMerchants = await db.query.merchants.findMany({
            where: eq(merchants.userId, req.userId),
            limit: 100
        });

        const enriched = await Promise.all(
            userMerchants.map(m => merchantRecognizer.enrichMerchantData(m))
        );

        res.json({
            success: true,
            data: enriched
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/merchants/recognize:
 *   post:
 *     summary: Recognize merchant from description
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/merchants/recognize',
    protect,
    body('description').notEmpty(),
    body('amount').optional().isFloat({ min: 0 }),
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const merchant = await merchantRecognizer.recognize(
            req.userId,
            req.body.description,
            parseFloat(req.body.amount)
        );

        res.json({
            success: true,
            data: merchant
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/merchants/autocomplete:
 *   get:
 *     summary: Autocomplete merchant search
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 */
router.get(
    '/merchants/autocomplete',
    protect,
    query('q').notEmpty(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const suggestions = await merchantRecognizer.suggestMerchants(
            req.userId,
            req.query.q,
            parseInt(req.query.limit) || 10
        );

        res.json({
            success: true,
            data: suggestions
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/merchants/{merchantId}/rate:
 *   post:
 *     summary: Rate a merchant
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/merchants/:merchantId/rate',
    protect,
    param('merchantId').isUUID(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('review').optional().isString(),
    body('feedbackType').optional().isIn(['positive', 'negative', 'neutral']),
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const rating = await merchantRecognizer.rateMerchant(
            req.params.merchantId,
            req.userId,
            req.body.rating,
            req.body.review,
            req.body.feedbackType
        );

        res.json({
            success: true,
            data: rating
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/merchants/{merchantId}/details:
 *   get:
 *     summary: Get merchant profile details
 *     tags: [Merchants]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/merchants/:merchantId/details',
    protect,
    param('merchantId').isUUID(),
    asyncHandler(async (req, res) => {
        const merchant = await db.query.merchants.findFirst({
            where: and(
                eq(merchants.id, req.params.merchantId),
                eq(merchants.userId, req.userId)
            ),
            with: {
                defaultCategory: true
            }
        });

        if (!merchant) {
            return res.status(404).json({ error: 'Merchant not found' });
        }

        const enriched = await merchantRecognizer.enrichMerchantData(merchant);

        res.json({
            success: true,
            data: enriched
        });
    })
);

// ============================================================================
// CATEGORY RULES ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/smart-categorization/rules:
 *   get:
 *     summary: Get user's categorization rules
 *     tags: [Category Rules]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/rules',
    protect,
    asyncHandler(async (req, res) => {
        const rules = await categoryRuleEngine.getRulesForUser(req.userId);

        res.json({
            success: true,
            data: rules
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/rules:
 *   post:
 *     summary: Create a new categorization rule
 *     tags: [Category Rules]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/rules',
    protect,
    body('categoryId').isUUID(),
    body('conditionType').isIn(['text_match', 'amount_range', 'date_range', 'combined']),
    body('conditionConfig').isObject(),
    body('notes').optional().isString(),
    body('priority').optional().isInt(),
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const rule = await categoryRuleEngine.createRule(req.userId, req.body);

        res.json({
            success: true,
            data: rule
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/rules/{ruleId}:
 *   put:
 *     summary: Update a categorization rule
 *     tags: [Category Rules]
 *     security:
 *       - bearerAuth: []
 */
router.put(
    '/rules/:ruleId',
    protect,
    param('ruleId').isUUID(),
    asyncHandler(async (req, res) => {
        const updated = await categoryRuleEngine.updateRule(
            req.userId,
            req.params.ruleId,
            req.body
        );

        res.json({
            success: true,
            data: updated
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/rules/{ruleId}:
 *   delete:
 *     summary: Delete a categorization rule
 *     tags: [Category Rules]
 *     security:
 *       - bearerAuth: []
 */
router.delete(
    '/rules/:ruleId',
    protect,
    param('ruleId').isUUID(),
    asyncHandler(async (req, res) => {
        const result = await categoryRuleEngine.deleteRule(req.userId, req.params.ruleId);

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/rules/{ruleId}/test:
 *   post:
 *     summary: Test a rule against an expense
 *     tags: [Category Rules]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/rules/:ruleId/test',
    protect,
    param('ruleId').isUUID(),
    body('expenseId').isUUID(),
    asyncHandler(async (req, res) => {
        const result = await categoryRuleEngine.testRule(
            req.userId,
            req.params.ruleId,
            req.body.expenseId
        );

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/rules/{ruleId}/test-recent:
 *   post:
 *     summary: Test rule against recent expenses
 *     tags: [Category Rules]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/rules/:ruleId/test-recent',
    protect,
    param('ruleId').isUUID(),
    asyncHandler(async (req, res) => {
        const result = await categoryRuleEngine.testRuleOnRecentExpenses(
            req.userId,
            req.params.ruleId
        );

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/rules/templates/available:
 *   get:
 *     summary: Get available rule templates
 *     tags: [Category Rules]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/rules/templates/available',
    protect,
    asyncHandler(async (req, res) => {
        const templates = [
            { key: 'subscription', name: 'Subscription Service', conditionType: 'text_match' },
            { key: 'groceries', name: 'Grocery Store', conditionType: 'text_match' },
            { key: 'dining', name: 'Restaurant/Dining', conditionType: 'text_match' },
            { key: 'transportation', name: 'Transportation', conditionType: 'text_match' },
            { key: 'smallPurchases', name: 'Small Purchases', conditionType: 'amount_range' },
            { key: 'largePurchases', name: 'Large Purchases', conditionType: 'amount_range' },
            { key: 'venmo', name: 'Friend Payments (Venmo)', conditionType: 'text_match' }
        ];

        res.json({
            success: true,
            data: templates
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/rules/templates/{templateKey}:
 *   post:
 *     summary: Create rule from template
 *     tags: [Category Rules]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/rules/templates/:templateKey',
    protect,
    param('templateKey').notEmpty(),
    body('categoryId').isUUID(),
    body('notes').optional().isString(),
    asyncHandler(async (req, res) => {
        const rule = await categoryRuleEngine.createRuleFromTemplate(
            req.userId,
            req.params.templateKey,
            req.body.categoryId,
            req.body.notes
        );

        res.json({
            success: true,
            data: rule
        });
    })
);

// ============================================================================
// RECEIPT OCR ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/smart-categorization/receipts/upload:
 *   post:
 *     summary: Upload and process receipt image
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               receipt:
 *                 type: string
 *                 format: binary
 *               expenseId:
 *                 type: string
 */
router.post(
    '/receipts/upload',
    protect,
    upload.single('receipt'),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const result = await receiptOCRService.processReceipt(
            req.userId,
            req.file.buffer,
            req.file.originalname,
            req.body.expenseId
        );

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/receipts/{ocrResultId}:
 *   get:
 *     summary: Get OCR result
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 */
router.get(
    '/receipts/:ocrResultId',
    protect,
    param('ocrResultId').isUUID(),
    asyncHandler(async (req, res) => {
        const result = await receiptOCRService.getOCRResult(req.params.ocrResultId);

        if (!result) {
            return res.status(404).json({ error: 'OCR result not found' });
        }

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/receipts/{ocrResultId}/validate:
 *   post:
 *     summary: Update receipt validation status
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 */
router.post(
    '/receipts/:ocrResultId/validate',
    protect,
    param('ocrResultId').isUUID(),
    body('status').isIn(['valid', 'invalid', 'requires_review']),
    body('notes').optional().isString(),
    asyncHandler(async (req, res) => {
        const result = await receiptOCRService.updateValidationStatus(
            req.params.ocrResultId,
            req.body.status,
            req.body.notes
        );

        res.json({
            success: true,
            data: result
        });
    })
);

/**
 * @swagger
 * /api/smart-categorization/receipts/{ocrResultId}/correct:
 *   put:
 *     summary: Correct OCR extraction data
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 */
router.put(
    '/receipts/:ocrResultId/correct',
    protect,
    param('ocrResultId').isUUID(),
    body('merchant').optional().isString(),
    body('amount').optional().isFloat(),
    body('date').optional().isISO8601(),
    body('description').optional().isString(),
    asyncHandler(async (req, res) => {
        const result = await receiptOCRService.correctOCRData(
            req.params.ocrResultId,
            req.body
        );

        res.json({
            success: true,
            data: result
        });
    })
);

export default router;
