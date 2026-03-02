// backend/routes/bulkImport.js
// Issue #636: Bulk Expense Import & Auto-Reconciliation Routes

import express from 'express';
import { body, query, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import bulkImportService from '../services/bulkImportService.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/imports/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.csv', '.xlsx', '.xls', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV and Excel files are allowed'));
        }
    }
});

/**
 * POST /api/bulk-import/upload
 * Upload a CSV/Excel file and create import session
 */
router.post(
    '/upload',
    protect,
    upload.single('file'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No file uploaded'
                });
            }

            // Create import session
            const session = await bulkImportService.createImportSession(
                req.user.tenant_id,
                req.user.id,
                {
                    sessionName: req.body.sessionName,
                    importSource: 'csv',
                    fileName: req.file.originalname,
                    fileSize: req.file.size,
                    autoCategorize: req.body.autoCategorize !== 'false',
                    autoMatch: req.body.autoMatch !== 'false',
                    skipDuplicates: req.body.skipDuplicates !== 'false'
                }
            );

            // Read file content
            const fileContent = await fs.readFile(req.file.path, 'utf-8');

            // Parse and create records
            const parseResult = await bulkImportService.parseAndCreateRecords(
                req.user.tenant_id,
                session.id,
                fileContent,
                req.body.mappingId || null
            );

            // Clean up uploaded file
            await fs.unlink(req.file.path);

            res.status(201).json({
                success: true,
                data: {
                    session,
                    parseResult
                },
                message: 'File uploaded and parsed successfully'
            });
        } catch (error) {
            // Clean up file on error
            if (req.file) {
                try {
                    await fs.unlink(req.file.path);
                } catch (unlinkError) {
                    console.error('Error deleting uploaded file:', unlinkError);
                }
            }

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * GET /api/bulk-import/sessions
 * List import sessions
 */
router.get('/sessions', protect, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        // Get sessions (simplified query - full implementation would use proper pagination)
        const sessions = await bulkImportService.getImportHistory(
            req.user.tenant_id,
            limit,
            offset
        );

        res.json({
            success: true,
            data: sessions,
            pagination: {
                limit,
                offset,
                total: sessions.length
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/bulk-import/sessions/:sessionId
 * Get import session details
 */
router.get('/sessions/:sessionId', protect, async (req, res) => {
    try {
        const session = await bulkImportService.getImportSession(
            req.user.tenant_id,
            req.params.sessionId
        );

        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }

        res.json({
            success: true,
            data: session
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/bulk-import/sessions/:sessionId/detect-duplicates
 * Detect duplicate transactions in import session
 */
router.post('/sessions/:sessionId/detect-duplicates', protect, async (req, res) => {
    try {
        const result = await bulkImportService.detectDuplicates(
            req.user.tenant_id,
            req.params.sessionId
        );

        res.json({
            success: true,
            data: result,
            message: `Found ${result.duplicatesFound} duplicate(s)`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/bulk-import/sessions/:sessionId/auto-match
 * Auto-match imported records with existing expenses
 */
router.post(
    '/sessions/:sessionId/auto-match',
    protect,
    [
        body('confidenceThreshold')
            .optional()
            .isFloat({ min: 50, max: 100 })
            .withMessage('Confidence threshold must be between 50 and 100')
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

            const result = await bulkImportService.autoMatchRecords(
                req.user.tenant_id,
                req.params.sessionId,
                req.body.confidenceThreshold || 85
            );

            res.json({
                success: true,
                data: result,
                message: `Auto-matched ${result.matchedCount} transaction(s)`
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * GET /api/bulk-import/sessions/:sessionId/records
 * Get import records for review
 */
router.get(
    '/sessions/:sessionId/records',
    protect,
    [
        query('status')
            .optional()
            .isIn(['pending', 'auto_matched', 'manual_matched', 'rejected', 'duplicate', 'new'])
            .withMessage('Invalid status'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .toInt()
            .withMessage('Limit must be between 1 and 100'),
        query('offset')
            .optional()
            .isInt({ min: 0 })
            .toInt()
            .withMessage('Offset must be non-negative')
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

            const records = await bulkImportService.getImportRecordsForReview(
                req.user.tenant_id,
                req.params.sessionId,
                req.query.status || 'pending',
                parseInt(req.query.limit) || 50,
                parseInt(req.query.offset) || 0
            );

            res.json({
                success: true,
                data: records,
                count: records.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * POST /api/bulk-import/matches/:matchId/review
 * Approve or reject a match
 */
router.post(
    '/matches/:matchId/review',
    protect,
    [
        body('action')
            .notEmpty()
            .withMessage('Action is required')
            .isIn(['approve', 'reject', 'edit', 'merge', 'skip'])
            .withMessage('Invalid action'),
        body('notes')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Notes must be at most 500 characters')
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

            const result = await bulkImportService.reviewMatch(
                req.user.tenant_id,
                req.params.matchId,
                req.body.action,
                req.user.id,
                req.body.notes || null
            );

            res.json({
                success: true,
                data: result,
                message: `Match ${req.body.action}ed successfully`
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * POST /api/bulk-import/sessions/:sessionId/execute
 * Execute import - create expenses from approved records
 */
router.post('/sessions/:sessionId/execute', protect, async (req, res) => {
    try {
        const result = await bulkImportService.executeImport(
            req.user.tenant_id,
            req.params.sessionId,
            req.user.id
        );

        res.json({
            success: true,
            data: result,
            message: 'Import executed successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/bulk-import/detect-format
 * Detect file format from uploaded content
 */
router.post(
    '/detect-format',
    protect,
    upload.single('file'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No file uploaded'
                });
            }

            // Read file content
            const fileContent = await fs.readFile(req.file.path, 'utf-8');

            // Detect format
            const format = await bulkImportService.detectFormat(fileContent);

            // Clean up file
            await fs.unlink(req.file.path);

            res.json({
                success: true,
                data: format
            });
        } catch (error) {
            // Clean up file on error
            if (req.file) {
                try {
                    await fs.unlink(req.file.path);
                } catch (unlinkError) {
                    console.error('Error deleting uploaded file:', unlinkError);
                }
            }

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * GET /api/bulk-import/mappings
 * Get saved import mapping templates
 */
router.get('/mappings', protect, async (req, res) => {
    try {
        const mappings = await bulkImportService.getImportMappings(
            req.user.tenant_id
        );

        res.json({
            success: true,
            data: mappings,
            count: mappings.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/bulk-import/mappings
 * Create a new import mapping template
 */
router.post(
    '/mappings',
    protect,
    [
        body('templateName')
            .trim()
            .notEmpty()
            .withMessage('Template name is required')
            .isLength({ max: 255 })
            .withMessage('Template name must be at most 255 characters'),
        body('columnMappings')
            .notEmpty()
            .withMessage('Column mappings are required')
            .isObject()
            .withMessage('Column mappings must be an object'),
        body('importSource')
            .optional()
            .isIn(['csv', 'excel', 'bank_api', 'manual', 'plaid', 'finicity'])
            .withMessage('Invalid import source')
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

            const mapping = await bulkImportService.createImportMapping(
                req.user.tenant_id,
                req.user.id,
                req.body
            );

            res.status(201).json({
                success: true,
                data: mapping,
                message: 'Import mapping created successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * GET /api/bulk-import/history
 * Get import history
 */
router.get(
    '/history',
    protect,
    [
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .toInt()
            .withMessage('Limit must be between 1 and 100'),
        query('offset')
            .optional()
            .isInt({ min: 0 })
            .toInt()
            .withMessage('Offset must be non-negative')
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

            const history = await bulkImportService.getImportHistory(
                req.user.tenant_id,
                parseInt(req.query.limit) || 20,
                parseInt(req.query.offset) || 0
            );

            res.json({
                success: true,
                data: history,
                count: history.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

/**
 * GET /api/bulk-import/formats
 * Get list of supported formats and sample templates
 */
router.get('/formats', protect, (req, res) => {
    res.json({
        success: true,
        data: {
            supported: [
                {
                    format: 'csv',
                    extension: '.csv',
                    mimeTypes: ['text/csv', 'application/csv'],
                    description: 'Comma-separated values'
                },
                {
                    format: 'excel',
                    extension: '.xlsx',
                    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
                    description: 'Microsoft Excel'
                },
                {
                    format: 'excel_legacy',
                    extension: '.xls',
                    mimeTypes: ['application/vnd.ms-excel'],
                    description: 'Microsoft Excel (legacy)'
                }
            ],
            sampleTemplate: {
                headers: ['Date', 'Amount', 'Description', 'Merchant', 'Category'],
                example: ['2024-01-15', '42.99', 'Grocery shopping', 'Whole Foods', 'Groceries']
            },
            requiredFields: ['Date', 'Amount'],
            optionalFields: ['Description', 'Merchant', 'Category', 'Reference Number', 'Account Name']
        }
    });
});

export default router;
