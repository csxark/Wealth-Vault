import express from 'express';
import { body, validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import taxEngine from '../services/taxEngine.js';
import deductionScout from '../services/deductionScout.js';

const router = express.Router();

/**
 * @route   GET /api/tax/profile
 * @desc    Get user's tax profile
 */
router.get('/profile', protect, asyncHandler(async (req, res) => {
  const { taxYear = new Date().getFullYear() } = req.query;
  const profile = await taxEngine.getTaxProfile(req.user.id, parseInt(taxYear));

  if (!profile) {
    return res.status(404).json({ success: false, message: 'Tax profile not found' });
  }

  res.success(profile);
}));

/**
 * @route   POST /api/tax/profile
 * @desc    Create or update tax profile
 */
router.post('/profile', protect, [
  body('taxYear').isInt(),
  body('filingStatus').isIn(['single', 'married_joint', 'married_separate', 'head_of_household']),
  body('annualIncome').optional().isFloat({ gt: 0 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const profile = await taxEngine.upsertTaxProfile(req.user.id, req.body);
  res.success(profile, 'Tax profile updated');
}));

/**
 * @route   GET /api/tax/calculate
 * @desc    Calculate current tax liability
 */
router.get('/calculate', protect, asyncHandler(async (req, res) => {
  const { taxYear = new Date().getFullYear() } = req.query;
  const calculation = await taxEngine.calculateTaxLiability(req.user.id, parseInt(taxYear));
  res.success(calculation);
}));

/**
 * @route   GET /api/tax/deductions
 * @desc    Get all deductions for a tax year
 */
router.get('/deductions', protect, asyncHandler(async (req, res) => {
  const { taxYear = new Date().getFullYear() } = req.query;
  const deductions = await taxEngine.getUserDeductions(req.user.id, parseInt(taxYear));
  res.success(deductions);
}));

/**
 * @route   POST /api/tax/deductions
 * @desc    Add manual deduction
 */
router.post('/deductions', protect, [
  body('taxYear').isInt(),
  body('category').isString(),
  body('amount').isFloat({ gt: 0 }),
  body('description').isString(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const deduction = await taxEngine.addDeduction(req.user.id, req.body);
  res.success(deduction, 'Deduction added');
}));

/**
 * @route   POST /api/tax/deductions/:id/approve
 * @desc    Approve AI-detected deduction
 */
router.post('/deductions/:id/approve', protect, asyncHandler(async (req, res) => {
  const approved = await taxEngine.approveDeduction(req.params.id, req.user.id);
  res.success(approved, 'Deduction approved');
}));

/**
 * @route   POST /api/tax/deductions/:id/reject
 * @desc    Reject AI-detected deduction
 */
router.post('/deductions/:id/reject', protect, asyncHandler(async (req, res) => {
  const rejected = await taxEngine.rejectDeduction(req.params.id);
  res.success(rejected, 'Deduction rejected');
}));

/**
 * @route   POST /api/tax/scan
 * @desc    Scan expenses for deduction opportunities
 */
router.post('/scan', protect, asyncHandler(async (req, res) => {
  const { taxYear = new Date().getFullYear() } = req.body;
  const deductions = await deductionScout.scanExpenses(req.user.id, parseInt(taxYear));
  res.success(deductions, `Found ${deductions.length} potential deductions`);
}));

/**
 * @route   GET /api/tax/suggestions
 * @desc    Get AI deduction suggestions
 */
router.get('/suggestions', protect, asyncHandler(async (req, res) => {
  const { taxYear = new Date().getFullYear() } = req.query;
  const suggestions = await deductionScout.getSuggestions(req.user.id, parseInt(taxYear));
  res.success(suggestions);
}));

/**
 * @route   POST /api/tax/scan-receipt
 * @desc    Analyze receipt text for deductions
 */
router.post('/scan-receipt', protect, [
  body('receiptText').isString(),
  body('taxYear').optional().isInt(),
], asyncHandler(async (req, res) => {
  const { receiptText, taxYear = new Date().getFullYear() } = req.body;
  const deductions = await deductionScout.analyzeReceipt(receiptText, req.user.id, parseInt(taxYear));
  res.success(deductions, 'Receipt analyzed');
}));

/**
 * @route   POST /api/tax/reports/generate
 * @desc    Generate tax report
 */
router.post('/reports/generate', protect, [
  body('taxYear').isInt(),
  body('reportType').optional().isIn(['quarterly', 'annual', 'estimated']),
], asyncHandler(async (req, res) => {
  const { taxYear, reportType } = req.body;
  const report = await taxEngine.generateReport(req.user.id, parseInt(taxYear), reportType);
  res.success(report, 'Tax report generated');
}));

/**
 * @route   GET /api/tax/reports
 * @desc    Get user's tax reports
 */
router.get('/reports', protect, asyncHandler(async (req, res) => {
  const { taxYear } = req.query;
  const reports = await taxEngine.getUserReports(req.user.id, taxYear ? parseInt(taxYear) : null);
  res.success(reports);
}));

/**
 * @route   GET /api/tax/brackets
 * @desc    Get tax brackets for configuration
 */
router.get('/brackets', protect, asyncHandler(async (req, res) => {
  const { country = 'US', taxYear = new Date().getFullYear(), filingStatus = 'single' } = req.query;
  const brackets = await taxEngine.getTaxBrackets(country, parseInt(taxYear), filingStatus);
  res.success(brackets);
}));

export default router;
