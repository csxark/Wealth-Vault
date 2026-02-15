import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import auditEngine from '../services/auditEngine.js';
import stressSimulator from '../services/stressSimulator.js';
import { db } from '../db/index.js';
import { auditLogs, stressScenarios, anomalyPatterns } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { body, param, validationResult } from 'express-validator';
import asyncHandler from 'express-async-handler';
import { validateAuditAction } from '../middleware/auditValidator.js';

const router = express.Router();

// --- Audit Endpoints ---

/**
 * @desc Trigger a forensic scan
 * @route POST /api/forensic-audit/scan
 */
router.post('/scan', protect, asyncHandler(async (req, res) => {
    const findings = await auditEngine.performForensicScan(req.user.id);
    res.json({
        success: true,
        message: 'Forensic scan completed',
        count: findings.length,
        data: findings
    });
}));

/**
 * @desc Get audit logs
 * @route GET /api/forensic-audit/logs
 */
router.get('/logs', protect, asyncHandler(async (req, res) => {
    const logs = await db.select()
        .from(auditLogs)
        .where(eq(auditLogs.userId, req.user.id))
        .orderBy(desc(auditLogs.createdAt))
        .limit(100);

    res.json({ success: true, data: logs });
}));

// --- Stress Testing Endpoints ---

/**
 * @desc Create a stress test scenario
 * @route POST /api/forensic-audit/scenarios
 */
router.post('/scenarios', protect, [
    body('name').notEmpty().withMessage('Scenario name is required'),
    body('scenarioType').isIn(['market_crash', 'job_loss', 'medical_emergency', 'hyperinflation']),
    body('parameters').isObject().withMessage('Parameters must be an object')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const [newScenario] = await db.insert(stressScenarios).values({
        userId: req.user.id,
        ...req.body
    }).returning();

    res.status(201).json({ success: true, data: newScenario });
}));

/**
 * @desc Run a specific stress simulation
 * @route POST /api/forensic-audit/scenarios/:id/run
 */
router.post('/scenarios/:id/run', protect, validateAuditAction, asyncHandler(async (req, res) => {
    const result = await stressSimulator.runSimulation(req.user.id, req.params.id);
    res.json({ success: true, data: result });
}));

/**
 * @desc Get anomaly patterns
 * @route GET /api/forensic-audit/patterns
 */
router.get('/patterns', protect, asyncHandler(async (req, res) => {
    const patterns = await db.select()
        .from(anomalyPatterns)
        .where(eq(anomalyPatterns.userId, req.user.id));

    res.json({ success: true, data: patterns });
}));

export default router;
