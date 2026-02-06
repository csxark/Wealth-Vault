import express from 'express';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import replayEngine from '../services/replayEngine.js';
import forensicAI from '../services/forensicAI.js';
import db from '../config/db.js';
import { forensicQueries, auditSnapshots, stateDeltas } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/audit/snapshots
 * @desc    Get user's audit snapshots
 * @access  Private
 */
router.get('/snapshots', protect, asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;

  const snapshots = await db
    .select({
      id: auditSnapshots.id,
      snapshotDate: auditSnapshots.snapshotDate,
      totalBalance: auditSnapshots.totalBalance,
      transactionCount: auditSnapshots.transactionCount,
      metadata: auditSnapshots.metadata,
      createdAt: auditSnapshots.createdAt,
    })
    .from(auditSnapshots)
    .where(eq(auditSnapshots.userId, req.user.id))
    .orderBy(desc(auditSnapshots.snapshotDate))
    .limit(parseInt(limit));

  res.success(snapshots, 'Snapshots retrieved successfully');
}));

/**
 * @route   POST /api/audit/replay
 * @desc    Replay financial state at a specific date (Time Machine)
 * @access  Private
 */
router.post('/replay', protect, asyncHandler(async (req, res) => {
  const { targetDate } = req.body;

  if (!targetDate) {
    return res.status(400).json({ success: false, message: 'targetDate is required' });
  }

  const date = new Date(targetDate);
  if (isNaN(date.getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid date format' });
  }

  const result = await replayEngine.replayToDate(req.user.id, date);

  // Save forensic query
  await db.insert(forensicQueries).values({
    userId: req.user.id,
    queryType: 'replay',
    targetDate: date,
    queryParams: { targetDate },
    resultSummary: {
      expensesCount: result.state.expenses?.length || 0,
      goalsCount: result.state.goals?.length || 0,
      categoriesCount: result.state.categories?.length || 0,
    },
    executionTime: result.metadata.executionTime,
    status: 'completed',
    completedAt: new Date(),
  });

  res.success(result, 'State replayed successfully');
}));

/**
 * @route   POST /api/audit/trace/:resourceId
 * @desc    Trace a specific transaction's history
 * @access  Private
 */
router.post('/trace/:resourceId', protect, asyncHandler(async (req, res) => {
  const { resourceId } = req.params;

  const trace = await replayEngine.traceTransaction(req.user.id, resourceId);

  res.success(trace, 'Transaction traced successfully');
}));

/**
 * @route   POST /api/audit/explain/:resourceId
 * @desc    Get AI explanation of a transaction chain
 * @access  Private
 */
router.post('/explain/:resourceId', protect, asyncHandler(async (req, res) => {
  const { resourceId } = req.params;

  const explanation = await forensicAI.explainTransactionChain(req.user.id, resourceId);

  // Save forensic query
  await db.insert(forensicQueries).values({
    userId: req.user.id,
    queryType: 'explain',
    targetResourceId: resourceId,
    queryParams: { resourceId },
    aiExplanation: explanation,
    status: 'completed',
    completedAt: new Date(),
  });

  res.success({ explanation }, 'Explanation generated successfully');
}));

/**
 * @route   POST /api/audit/forensic-report
 * @desc    Generate comprehensive forensic report for a period
 * @access  Private
 */
router.post('/forensic-report', protect, asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid date format' });
  }

  const report = await forensicAI.generateForensicReport(req.user.id, start, end);

  res.success(report, 'Forensic report generated successfully');
}));

/**
 * @route   POST /api/audit/analyze-discrepancy
 * @desc    Analyze balance discrepancy between two dates
 * @access  Private
 */
router.post('/analyze-discrepancy', protect, asyncHandler(async (req, res) => {
  const { date1, date2 } = req.body;

  if (!date1 || !date2) {
    return res.status(400).json({ success: false, message: 'date1 and date2 are required' });
  }

  const d1 = new Date(date1);
  const d2 = new Date(date2);

  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid date format' });
  }

  const analysis = await forensicAI.analyzeBalanceDiscrepancy(req.user.id, d1, d2);

  res.success(analysis, 'Discrepancy analysis completed');
}));

/**
 * @route   GET /api/audit/queries
 * @desc    Get user's forensic query history
 * @access  Private
 */
router.get('/queries', protect, asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;

  const queries = await db
    .select()
    .from(forensicQueries)
    .where(eq(forensicQueries.userId, req.user.id))
    .orderBy(desc(forensicQueries.createdAt))
    .limit(parseInt(limit));

  res.success(queries, 'Forensic queries retrieved successfully');
}));

/**
 * @route   GET /api/audit/deltas
 * @desc    Get recent state deltas for the user
 * @access  Private
 */
router.get('/deltas', protect, asyncHandler(async (req, res) => {
  const { limit = 50, resourceType } = req.query;

  const conditions = [eq(stateDeltas.userId, req.user.id)];
  if (resourceType) {
    conditions.push(eq(stateDeltas.resourceType, resourceType));
  }

  const deltas = await db
    .select()
    .from(stateDeltas)
    .where(and(...conditions))
    .orderBy(desc(stateDeltas.createdAt))
    .limit(parseInt(limit));

  res.success(deltas, 'State deltas retrieved successfully');
}));

/**
 * @route   GET /api/audit/balance-history
 * @desc    Get balance at specific points in time
 * @access  Private
 */
router.get('/balance-history', protect, asyncHandler(async (req, res) => {
  const { dates } = req.query; // Comma-separated dates

  if (!dates) {
    return res.status(400).json({ success: false, message: 'dates parameter is required' });
  }

  const dateArray = dates.split(',').map(d => new Date(d.trim()));
  const balances = [];

  for (const date of dateArray) {
    if (!isNaN(date.getTime())) {
      const balance = await replayEngine.calculateBalanceAtDate(req.user.id, date);
      balances.push({ date, balance });
    }
  }

  res.success(balances, 'Balance history retrieved successfully');
}));

export default router;
