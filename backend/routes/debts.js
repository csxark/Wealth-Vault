import express from 'express';
import { validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { validateDebt, validateDebtPayment, validatePayoffStrategy, validateDebtId } from '../middleware/debtValidator.js';
import debtEngine from '../services/debtEngine.js';
import payoffOptimizer from '../services/payoffOptimizer.js';
import refinanceScout from '../services/refinanceScout.js';
import db from '../config/db.js';
import { debts } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const router = express.Router();

/**
 * @route   GET /api/debts
 * @desc    Get all active debts for the user
 */
router.get('/', protect, async (req, res) => {
    try {
        const userDebts = await db.query.debts.findMany({
            where: and(eq(debts.userId, req.user.id), eq(debts.isActive, true)),
            orderBy: (debts, { asc }) => [asc(debts.currentBalance)]
        });
        res.success(userDebts);
    } catch (error) {
        res.error(error.message);
    }
});

/**
 * @route   POST /api/debts
 * @desc    Add a new debt
 */
router.post('/', protect, validateDebt, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const [newDebt] = await db.insert(debts).values({
            ...req.body,
            userId: req.user.id,
            apr: req.body.apr.toString(),
            principalAmount: req.body.principalAmount.toString(),
            currentBalance: req.body.currentBalance.toString(),
            minimumPayment: req.body.minimumPayment.toString()
        }).returning();

        res.success(newDebt, 'Debt added successfully', 201);
    } catch (error) {
        res.error(error.message);
    }
});

/**
 * @route   GET /api/debts/summary
 * @desc    Get debt overview and summary metrics
 */
router.get('/summary', protect, async (req, res) => {
    try {
        const summary = await debtEngine.getDebtSummary(req.user.id);
        const freedomDate = await payoffOptimizer.calculateFreedomDate(req.user.id);
        res.success({ ...summary, freedomDate });
    } catch (error) {
        res.error(error.message);
    }
});

/**
 * @route   POST /api/debts/payment
 * @desc    Record a payment against a debt
 */
router.post('/payment', protect, validateDebtPayment, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const { debtId, paymentAmount, paymentDate } = req.body;
        const payment = await debtEngine.recordPayment(req.user.id, debtId, parseFloat(paymentAmount), paymentDate);
        res.success(payment, 'Payment recorded successfully');
    } catch (error) {
        res.error(error.message);
    }
});

/**
 * @route   GET /api/debts/strategy
 * @desc    Get current payoff strategy
 */
router.get('/strategy', protect, async (req, res) => {
    try {
        const strategy = await payoffOptimizer.getActiveStrategy(req.user.id);
        res.success(strategy);
    } catch (error) {
        res.error(error.message);
    }
});

/**
 * @route   POST /api/debts/strategy
 * @desc    Update or change payoff strategy
 */
router.post('/strategy', protect, validatePayoffStrategy, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        const strategy = await payoffOptimizer.updateStrategy(req.user.id, req.body);
        res.success(strategy, 'Payoff strategy updated');
    } catch (error) {
        res.error(error.message);
    }
});

/**
 * @route   GET /api/debts/simulate
 * @desc    Run a payoff simulation with extra payments
 */
router.get('/simulate', protect, async (req, res) => {
    try {
        const { strategy = 'avalanche', extra = 0 } = req.query;
        const simulation = await payoffOptimizer.simulatePayoff(req.user.id, strategy, parseFloat(extra));
        res.success(simulation);
    } catch (error) {
        res.error(error.message);
    }
});

/**
 * @route   POST /api/debts/refinance/scan
 * @desc    Trigger a scan for refinancing opportunities
 */
router.post('/refinance/scan', protect, async (req, res) => {
    try {
        const opportunities = await refinanceScout.scanOpportunities(req.user.id);
        res.success(opportunities, `Found ${opportunities.length} opportunities`);
    } catch (error) {
        res.error(error.message);
    }
});

/**
 * @route   GET /api/debts/refinance/opportunities
 * @desc    Get pending refinance opportunities
 */
router.get('/refinance/opportunities', protect, async (req, res) => {
    try {
        const opportunities = await refinanceScout.getOpportunities(req.user.id);
        res.success(opportunities);
    } catch (error) {
        res.error(error.message);
    }
});

/**
 * @route   DELETE /api/debts/:id
 * @desc    Soft delete (deactivate) a debt
 */
router.delete('/:id', protect, validateDebtId, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
        await db.update(debts)
            .set({ isActive: false, updatedAt: new Date() })
            .where(and(eq(debts.id, req.params.id), eq(debts.userId, req.user.id)));
        res.success(null, 'Debt deactivated successfully');
    } catch (error) {
        res.error(error.message);
    }
});

/**
 * @desc    Get Arbitrage Alpha (Opportunity Cost)
 */
router.get('/arbitrage-alpha', protect, async (req, res) => {
    try {
        const strategy = await payoffOptimizer.generateStrategy(req.user.id);
        res.success(strategy);
    } catch (error) {
        res.error(error.message);
    }
});

/**
 * @desc    Get Refinance ROI (Break-even calculator)
 */
router.get('/refinance/roi', protect, async (req, res) => {
    try {
        const { debtId, monthlyExtra = 0 } = req.query;
        const roi = await payoffOptimizer.calculateOpportunityCost(debtId, parseFloat(monthlyExtra));
        res.success(roi);
    } catch (error) {
        res.error(error.message);
    }
});

export default router;
