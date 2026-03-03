import express from 'express';
import { validationResult } from 'express-validator';
import { protect } from '../middleware/auth.js';
import { validateDebt, validateDebtPayment, validatePayoffStrategy, validateDebtId } from '../middleware/debtValidator.js';
import debtEngine from '../services/debtEngine.js';
import payoffOptimizer from '../services/payoffOptimizer.js';
import payoffStrategyService from '../services/payoffStrategyService.js';
import debtAmortizationService from '../services/debtAmortizationService.js';
import debtPayoffTimelineService from '../services/debtPayoffTimelineService.js';
import refinanceScout from '../services/refinanceScout.js';
import db from '../config/db.js';
import { eq, and, desc } from 'drizzle-orm';
import arbitrageEngine from '../services/arbitrageEngine.js';
import refinanceService from '../services/refinanceService.js';
import { arbitrageGuard } from '../middleware/arbitrageGuard.js';
import { debts, defaultPredictionScores, debtRestructuringPlans, debtArbitrageLogs, capitalCostSnapshots } from '../db/schema.js';
import { body } from 'express-validator';
import { ApiResponse } from '../utils/ApiResponse.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { signalAutopilot } from '../middleware/triggerInterceptor.js';
import eventBus from '../events/eventBus.js';
import defaultPredictorAI from '../services/defaultPredictorAI.js';
import debtAvalancheSnowballOptimizer from '../services/debtAvalancheSnowballOptimizer.js';
import emergencyFundAdequacyAnalyzer from '../services/emergencyFundAdequacyAnalyzer.js';
import debtConsolidationRecommenderService from '../services/debtConsolidationRecommenderService.js';
import debtWhatIfSimulatorService from '../services/debtWhatIfSimulatorService.js';

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
        // Autopilot signal: high-APR debt can trigger workflows
        signalAutopilot(req, 'DEBT_APR_CHANGE', { debtId: newDebt.id, value: parseFloat(req.body.apr) });
        // Also broadcast for other listeners
        eventBus.emit('DEBT_APR_CHANGE', { userId: req.user.id, debtId: newDebt.id, value: parseFloat(req.body.apr) });
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

/**
 * @route   GET /api/debts/arbitrage/summary
 * @desc    Get AI-driven arbitrage summary and WACC metrics
 */
router.get('/arbitrage/summary', protect, asyncHandler(async (req, res) => {
    const waccMetrics = await arbitrageEngine.calculateWACC(req.user.id);
    const recentSignals = await db.query.debtArbitrageLogs.findMany({
        where: eq(debtArbitrageLogs.userId, req.user.id),
        orderBy: [desc(debtArbitrageLogs.createdAt)],
        limit: 10
    });

    return new ApiResponse(200, {
        waccMetrics,
        recentSignals
    }, "Arbitrage summary generated").send(res);
}));

/**
 * @route   GET /api/debts/refinance/proposals
 * @desc    Get automated refinance recommendations
 */
router.get('/refinance/proposals', protect, asyncHandler(async (req, res) => {
    const proposals = await refinanceService.getBestProposals(req.user.id);
    return new ApiResponse(200, proposals).send(res);
}));

/**
 * @route   POST /api/debts/roi/comparison
 * @desc    Manually compare an external refinance rate
 */
router.post('/roi/comparison', protect, [
    body('debtId').isUUID(),
    body('proposedRate').isNumeric(),
    body('closingCosts').isNumeric()
], asyncHandler(async (req, res) => {
    const { debtId, proposedRate, closingCosts } = req.body;
    const result = await refinanceService.analyzeRefinance(
        req.user.id,
        debtId,
        parseFloat(proposedRate),
        parseFloat(closingCosts)
    );
    return new ApiResponse(200, result).send(res);
}));

/**
 * @route   POST /api/debts/arbitrage/execute
 * @desc    Execute a proposed arbitrage reallocation action
 */
router.post('/arbitrage/execute', protect, arbitrageGuard, [
    body('signalId').isUUID()
], asyncHandler(async (req, res) => {
    const { signalId } = req.body;

    const [signal] = await db.select().from(debtArbitrageLogs).where(and(eq(debtArbitrageLogs.id, signalId), eq(debtArbitrageLogs.userId, req.user.id)));
    if (!signal) return res.status(404).json(new ApiResponse(404, null, "Arbitrage signal not found"));

    // Execution logic would actually trigger transfers here. 
    // For now, we simulation completion.
    await db.update(debtArbitrageLogs).set({ status: 'executed' }).where(eq(debtArbitrageLogs.id, signalId));

    return new ApiResponse(200, null, `Arbitrage action ${signal.actionType} executed successfully (Simulated)`).send(res);
}));

/**
 * @route   GET /api/debts/prediction/risk
 * @desc    Get latest default risk prediction (L3)
 */
router.get('/prediction/risk', protect, asyncHandler(async (req, res) => {
    const risk = await defaultPredictorAI.calculateDefaultRisk(req.user.id);
    return new ApiResponse(200, risk, "Probability of default calculated").send(res);
}));

/**
 * @route   GET /api/debts/prediction/history
 * @desc    Get historical prediction scores for graphing
 */
router.get('/prediction/history', protect, asyncHandler(async (req, res) => {
    const history = await db.query.defaultPredictionScores.findMany({
        where: eq(defaultPredictionScores.userId, req.user.id),
        orderBy: [desc(defaultPredictionScores.predictionDate)],
        limit: 30
    });
    return new ApiResponse(200, history).send(res);
}));

/**
 * @route   POST /api/debts/restructure/draft
 * @desc    Trigger algorithmic restructuring draft
 */
router.post('/restructure/draft', protect, asyncHandler(async (req, res) => {
    const prediction = await defaultPredictorAI.getLatestScore(req.user.id);
    if (!prediction) return res.status(400).json(new ApiResponse(400, null, "Execute risk analysis first"));

    const plan = await debtEngine.draftRestructuringPlan(req.user.id, prediction.id);
    return new ApiResponse(200, plan, "Restructuring plan drafted").send(res);
}));

/**
 * @route   GET /api/debts/restructure/plans
 * @desc    Get all proposed restructuring plans
 */
router.get('/restructure/plans', protect, asyncHandler(async (req, res) => {
    const plans = await db.query.debtRestructuringPlans.findMany({
        where: eq(debtRestructuringPlans.userId, req.user.id),
        orderBy: [desc(debtRestructuringPlans.createdAt)]
    });
    return new ApiResponse(200, plans).send(res);
}));

/**
 * @route   POST /api/debts/restructure/approve/:id
 * @desc    Approve and execute a restructuring plan
 */
router.post('/restructure/approve/:id', protect, asyncHandler(async (req, res) => {
    const [plan] = await db.select().from(debtRestructuringPlans)
        .where(and(eq(debtRestructuringPlans.id, req.params.id), eq(debtRestructuringPlans.userId, req.user.id)));

    if (!plan) return res.status(404).json(new ApiResponse(404, null, "Plan not found"));

    // Execution logic: Update status and notify services
    await db.update(debtRestructuringPlans)
        .set({ status: 'approved', executedAt: new Date(), updatedAt: new Date() })
        .where(eq(debtRestructuringPlans.id, req.params.id));

    return new ApiResponse(200, null, "Plan approved and scheduled for execution").send(res);
}));

// ============================================
// AMORTIZATION SCHEDULES
// ============================================

/**
 * @route   GET /api/debts/:id/amortization
 * @desc    Get amortization schedule for a specific debt
 */
router.get('/:id/amortization', protect, asyncHandler(async (req, res) => {
    const debt = await db.query.debts.findFirst({
        where: and(eq(debts.id, req.params.id), eq(debts.userId, req.user.id))
    });

    if (!debt) {
        return res.status(404).json(new ApiResponse(404, null, 'Debt not found'));
    }

    const schedule = debtAmortizationService.generateAmortizationSchedule(
        parseFloat(debt.currentBalance),
        parseFloat(debt.annualRate),
        parseFloat(debt.monthlyPayment)
    );

    return new ApiResponse(200, {
        debt: { id: debt.id, name: debt.name },
        schedule
    }, 'Amortization schedule generated').send(res);
}));

/**
 * @route   GET /api/debts/:id/amortization/export
 * @desc    Export amortization schedule as CSV
 */
router.get('/:id/amortization/export', protect, asyncHandler(async (req, res) => {
    const debt = await db.query.debts.findFirst({
        where: and(eq(debts.id, req.params.id), eq(debts.userId, req.user.id))
    });

    if (!debt) {
        return res.status(404).json(new ApiResponse(404, null, 'Debt not found'));
    }

    // Generate CSV
    const schedule = debtAmortizationService.generateAmortizationSchedule(
        parseFloat(debt.currentBalance),
        parseFloat(debt.annualRate),
        parseFloat(debt.monthlyPayment)
    );

    const headers = ['Payment #', 'Payment Date', 'Beginning Balance', 'Payment', 'Principal', 'Interest', 'Ending Balance'];
    const rows = schedule.schedule.map(item => [
        item.paymentNumber,
        item.paymentDate.toLocaleDateString(),
        item.beginningBalance,
        item.paymentAmount,
        item.principalAmount,
        item.interestAmount,
        item.endingBalance
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', `attachment; filename="amortization-${debt.id}.csv"`);
    res.send(csv);
}));

// ============================================
// PAYOFF STRATEGIES
// ============================================

/**
 * @route   POST /api/debts/strategies/avalanche
 * @desc    Generate avalanche strategy (highest APR first)
 */
router.post('/strategies/avalanche', protect, asyncHandler(async (req, res) => {
    const { extraMonthlyPayment = 0 } = req.body;
    
    const strategy = await payoffStrategyService.generateAvalancheStrategy(
        req.user.tenantId,
        req.user.id,
        parseFloat(extraMonthlyPayment)
    );

    if (!strategy) {
        return res.status(400).json(new ApiResponse(400, null, 'No active debts found'));
    }

    const saved = await payoffStrategyService.createStrategy(req.user.tenantId, req.user.id, {
        strategyType: 'avalanche',
        name: 'Avalanche Strategy',
        description: strategy.description,
        extraMonthlyPayment: strategy.extraMonthlyPayment,
        priorityOrder: strategy.priorityOrder
    });

    return new ApiResponse(201, saved, 'Avalanche strategy created').send(res);
}));

/**
 * @route   POST /api/debts/strategies/snowball
 * @desc    Generate snowball strategy (smallest balance first)
 */
router.post('/strategies/snowball', protect, asyncHandler(async (req, res) => {
    const { extraMonthlyPayment = 0 } = req.body;
    
    const strategy = await payoffStrategyService.generateSnowballStrategy(
        req.user.tenantId,
        req.user.id,
        parseFloat(extraMonthlyPayment)
    );

    if (!strategy) {
        return res.status(400).json(new ApiResponse(400, null, 'No active debts found'));
    }

    const saved = await payoffStrategyService.createStrategy(req.user.tenantId, req.user.id, {
        strategyType: 'snowball',
        name: 'Snowball Strategy',
        description: strategy.description,
        extraMonthlyPayment: strategy.extraMonthlyPayment,
        priorityOrder: strategy.priorityOrder
    });

    return new ApiResponse(201, saved, 'Snowball strategy created').send(res);
}));

/**
 * @route   POST /api/debts/strategies/hybrid
 * @desc    Generate hybrid strategy (balanced approach)
 */
router.post('/strategies/hybrid', protect, asyncHandler(async (req, res) => {
    const { extraMonthlyPayment = 0 } = req.body;
    
    const strategy = await payoffStrategyService.generateHybridStrategy(
        req.user.tenantId,
        req.user.id,
        parseFloat(extraMonthlyPayment)
    );

    if (!strategy) {
        return res.status(400).json(new ApiResponse(400, null, 'No active debts found'));
    }

    const saved = await payoffStrategyService.createStrategy(req.user.tenantId, req.user.id, {
        strategyType: 'hybrid',
        name: 'Hybrid Strategy',
        description: strategy.description,
        extraMonthlyPayment: strategy.extraMonthlyPayment,
        priorityOrder: strategy.priorityOrder
    });

    return new ApiResponse(201, saved, 'Hybrid strategy created').send(res);
}));

/**
 * @route   GET /api/debts/strategies/recommendations
 * @desc    Get recommended payoff strategy based on debt profile
 */
router.get('/strategies/recommendations', protect, asyncHandler(async (req, res) => {
    const recommendations = await payoffStrategyService.getRecommendations(req.user.tenantId, req.user.id);

    if (!recommendations) {
        return res.status(400).json(new ApiResponse(400, null, 'No active debts found'));
    }

    return new ApiResponse(200, recommendations, 'Strategy recommendations generated').send(res);
}));

/**
 * @route   GET /api/debts/strategies/compare
 * @desc    Compare all active strategies
 */
router.get('/strategies/compare', protect, asyncHandler(async (req, res) => {
    const comparison = await payoffStrategyService.compareStrategies(req.user.tenantId, req.user.id);

    return new ApiResponse(200, comparison, 'Strategy comparison complete').send(res);
}));

// ============================================
// PAYOFF SIMULATIONS
// ============================================

/**
 * @route   POST /api/debts/simulate
 * @desc    Run a payoff simulation with extra payments
 */
router.post('/simulate', protect, asyncHandler(async (req, res) => {
    const { strategyId, monthsToSimulate = 360 } = req.body;

    if (!strategyId) {
        return res.status(400).json(new ApiResponse(400, null, 'strategyId is required'));
    }

    const simulation = await payoffStrategyService.simulateStrategy(
        req.user.tenantId,
        req.user.id,
        strategyId,
        monthsToSimulate
    );

    if (!simulation) {
        return res.status(400).json(new ApiResponse(400, null, 'Simulation failed'));
    }

    return new ApiResponse(200, simulation, 'Payoff simulation completed').send(res);
}));

/**
 * @route   POST /api/debts/what-if/simulate
 * @desc    Simulate payoff what-if scenarios (lump sums, recurring extras, pauses, increases) - Issue #745
 */
router.post('/what-if/simulate', protect, [
    body('monthlyBudget').optional().isNumeric().withMessage('monthlyBudget must be numeric'),
    body('horizonMonths').optional().isInt({ min: 1, max: 600 }).withMessage('horizonMonths must be between 1 and 600'),
    body('scenarios').isArray({ min: 1 }).withMessage('At least one scenario is required'),

    body('scenarios.*.name').optional().isString().withMessage('Scenario name must be a string'),
    body('scenarios.*.monthlyBudget').optional().isNumeric().withMessage('Scenario monthlyBudget must be numeric'),
    body('scenarios.*.horizonMonths').optional().isInt({ min: 1, max: 600 }).withMessage('Scenario horizonMonths must be between 1 and 600'),

    body('scenarios.*.oneTimeLumpSums').optional().isArray().withMessage('oneTimeLumpSums must be an array'),
    body('scenarios.*.oneTimeLumpSums.*.month').optional().isInt({ min: 1, max: 600 }).withMessage('Lump sum month must be 1-600'),
    body('scenarios.*.oneTimeLumpSums.*.amount').optional().isNumeric().withMessage('Lump sum amount must be numeric'),
    body('scenarios.*.oneTimeLumpSums.*.debtId').optional().isUUID().withMessage('Lump sum debtId must be a UUID'),

    body('scenarios.*.recurringExtraPayments').optional().isArray().withMessage('recurringExtraPayments must be an array'),
    body('scenarios.*.recurringExtraPayments.*.startMonth').optional().isInt({ min: 1, max: 600 }).withMessage('Recurring startMonth must be 1-600'),
    body('scenarios.*.recurringExtraPayments.*.endMonth').optional().isInt({ min: 1, max: 600 }).withMessage('Recurring endMonth must be 1-600'),
    body('scenarios.*.recurringExtraPayments.*.amount').optional().isNumeric().withMessage('Recurring amount must be numeric'),
    body('scenarios.*.recurringExtraPayments.*.debtId').optional().isUUID().withMessage('Recurring debtId must be a UUID'),

    body('scenarios.*.paymentPauses').optional().isArray().withMessage('paymentPauses must be an array'),
    body('scenarios.*.paymentPauses.*.startMonth').optional().isInt({ min: 1, max: 600 }).withMessage('Pause startMonth must be 1-600'),
    body('scenarios.*.paymentPauses.*.endMonth').optional().isInt({ min: 1, max: 600 }).withMessage('Pause endMonth must be 1-600'),
    body('scenarios.*.paymentPauses.*.debtId').optional().isUUID().withMessage('Pause debtId must be a UUID'),

    body('scenarios.*.paymentIncreaseSchedules').optional().isArray().withMessage('paymentIncreaseSchedules must be an array'),
    body('scenarios.*.paymentIncreaseSchedules.*.startMonth').optional().isInt({ min: 1, max: 600 }).withMessage('Increase startMonth must be 1-600'),
    body('scenarios.*.paymentIncreaseSchedules.*.incrementAmount').optional().isNumeric().withMessage('Increase incrementAmount must be numeric'),
    body('scenarios.*.paymentIncreaseSchedules.*.frequencyMonths').optional().isInt({ min: 1, max: 120 }).withMessage('Increase frequencyMonths must be 1-120'),
    body('scenarios.*.paymentIncreaseSchedules.*.debtId').optional().isUUID().withMessage('Increase debtId must be a UUID')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json(new ApiResponse(400, { errors: errors.array() }, 'Validation failed'));
    }

    const simulation = await debtWhatIfSimulatorService.simulate(req.user.id, req.body || {});

    return new ApiResponse(
        200,
        simulation,
        'Debt payoff what-if simulation completed'
    ).send(res);
}));

// ============================================
// PREPAYMENT ANALYSIS
// ============================================

/**
 * @route   POST /api/debts/:id/prepayment-analysis
 * @desc    Analyze prepayment opportunities
 */
router.post('/:id/prepayment-analysis', protect, asyncHandler(async (req, res) => {
    const { extraPaymentAmount } = req.body;

    if (!extraPaymentAmount || extraPaymentAmount <= 0) {
        return res.status(400).json(new ApiResponse(400, null, 'extraPaymentAmount must be greater than 0'));
    }

    const analysis = await debtAmortizationService.analyzePrepayment(
        req.user.tenantId,
        req.user.id,
        req.params.id,
        parseFloat(extraPaymentAmount)
    );

    return new ApiResponse(200, analysis, 'Prepayment analysis complete').send(res);
}));

// ============================================
// PAYOFF TIMELINE & FREEDOM DATE
// ============================================

/**
 * @route   GET /api/debts/timeline/all
 * @desc    Get comprehensive payoff timeline for all debts
 */
router.get('/timeline/all', protect, asyncHandler(async (req, res) => {
    const timeline = await debtPayoffTimelineService.generateTimelineForAllDebts(
        req.user.tenantId,
        req.user.id
    );

    return new ApiResponse(200, timeline, 'Payoff timeline generated').send(res);
}));

/**
 * @route   GET /api/debts/:id/timeline
 * @desc    Get detailed timeline for a specific debt
 */
router.get('/:id/timeline', protect, asyncHandler(async (req, res) => {
    const timeline = await debtPayoffTimelineService.generateTimelineForDebt(
        req.user.tenantId,
        req.user.id,
        req.params.id
    );

    return new ApiResponse(200, timeline, 'Debt timeline generated').send(res);
}));

/**
 * @route   GET /api/debts/countdown
 * @desc    Get payoff countdown to financial freedom
 */
router.get('/countdown', protect, asyncHandler(async (req, res) => {
    const countdown = await debtPayoffTimelineService.getPayoffCountdown(
        req.user.tenantId,
        req.user.id
    );

    if (!countdown) {
        return res.status(400).json(new ApiResponse(400, null, 'No active debts found'));
    }

    return new ApiResponse(200, countdown, 'Payoff countdown calculated').send(res);
}));

/**
 * @route   POST /api/debts/project-balance
 * @desc    Project remaining balance at a future date
 */
router.post('/project-balance', protect, asyncHandler(async (req, res) => {
    const { targetDate } = req.body;

    if (!targetDate) {
        return res.status(400).json(new ApiResponse(400, null, 'targetDate is required'));
    }

    const projection = await debtPayoffTimelineService.projectBalanceAtDate(
        req.user.tenantId,
        req.user.id,
        new Date(targetDate)
    );

    if (!projection) {
        return res.status(400).json(new ApiResponse(400, null, 'Projection failed'));
    }

    return new ApiResponse(200, projection, 'Balance projection calculated').send(res);
}));

/**
 * @route   POST /api/debts/optimizer/calculate
 * @desc    Calculate optimal debt payoff strategy (Avalanche vs Snowball vs Hybrid) - Issue #738
 */
router.post('/optimizer/calculate', protect, [
    body('extraMonthlyPayment').optional().isNumeric().withMessage('Extra monthly payment must be a number'),
    body('riskTolerance').optional().isIn(['conservative', 'balanced', 'aggressive']).withMessage('Invalid risk tolerance'),
    body('psychologicalPriority').optional().isIn(['low', 'medium', 'high', 'very_high']).withMessage('Invalid psychological priority')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json(new ApiResponse(400, { errors: errors.array() }, 'Validation failed'));
    }

    const {
        extraMonthlyPayment = 0,
        riskTolerance = 'balanced',
        psychologicalPriority = 'medium'
    } = req.body;

    const result = await debtAvalancheSnowballOptimizer.calculateOptimalStrategy(
        req.user.id,
        parseFloat(extraMonthlyPayment),
        { riskTolerance, psychologicalPriority }
    );

    if (!result.success) {
        return res.status(400).json(new ApiResponse(400, null, result.message));
    }

    return new ApiResponse(
        200,
        result,
        'Debt optimization strategies calculated successfully'
    ).send(res);
}));

/**
 * @route   GET /api/debts/optimizer/compare
 * @desc    Compare specific debt payoff strategies - Issue #738
 */
router.get('/optimizer/compare', protect, asyncHandler(async (req, res) => {
    const {
        extraMonthlyPayment = 0,
        strategies = 'avalanche,snowball,hybrid'
    } = req.query;

    const strategyNames = strategies.split(',').map(s => s.trim());

    const result = await debtAvalancheSnowballOptimizer.compareStrategies(
        req.user.id,
        parseFloat(extraMonthlyPayment),
        strategyNames
    );

    if (!result.success) {
        return res.status(400).json(new ApiResponse(400, null, result.message));
    }

    return new ApiResponse(
        200,
        result,
        'Strategy comparison generated'
    ).send(res);
}));

/**
 * @route   GET /api/debts/optimizer/recommendation
 * @desc    Get personalized debt payoff strategy recommendation - Issue #738
 */
router.get('/optimizer/recommendation', protect, asyncHandler(async (req, res) => {
    const {
        extraMonthlyPayment = 0,
        riskTolerance = 'balanced',
        psychologicalPriority = 'medium'
    } = req.query;

    const result = await debtAvalancheSnowballOptimizer.calculateOptimalStrategy(
        req.user.id,
        parseFloat(extraMonthlyPayment),
        { riskTolerance, psychologicalPriority }
    );

    if (!result.success) {
        return res.status(400).json(new ApiResponse(400, null, result.message));
    }

    // Return only the recommendation portion
    return new ApiResponse(
        200,
        {
            recommendation: result.recommendation,
            debts: result.debts,
            calculatedAt: result.calculatedAt
        },
        'Personalized recommendation generated'
    ).send(res);
}));

/**
 * @route   POST /api/debts/consolidation/recommend
 * @desc    Compare keep-current-debts vs smart consolidation scenarios - Issue #744
 */
router.post('/consolidation/recommend', protect, [
    body('monthlyBudget').optional().isNumeric().withMessage('monthlyBudget must be numeric'),
    body('horizonMonths').optional().isInt({ min: 1, max: 360 }).withMessage('horizonMonths must be between 1 and 360'),
    body('riskAssumptions').optional().isObject().withMessage('riskAssumptions must be an object'),
    body('riskAssumptions.creditRiskTier').optional().isIn(['low', 'medium', 'high', 'very_high']).withMessage('Invalid creditRiskTier'),
    body('riskAssumptions.latePaymentProbability').optional().isFloat({ min: 0, max: 1 }).withMessage('latePaymentProbability must be between 0 and 1'),
    body('debts').optional().isArray().withMessage('debts must be an array'),
    body('debts.*.currentBalance').optional().isNumeric().withMessage('debt currentBalance must be numeric'),
    body('debts.*.minimumPayment').optional().isNumeric().withMessage('debt minimumPayment must be numeric'),
    body('debts.*.apr').optional().isNumeric().withMessage('debt apr must be numeric'),
    body('scenarios').optional().isArray().withMessage('scenarios must be an array'),
    body('scenarios.*.name').optional().isString().withMessage('scenario name must be a string'),
    body('scenarios.*.type').optional().isIn(['personal_loan', 'balance_transfer', 'custom']).withMessage('invalid scenario type'),
    body('scenarios.*.targetDebtIds').optional().isArray().withMessage('targetDebtIds must be an array'),
    body('scenarios.*.loanApr').optional().isNumeric().withMessage('loanApr must be numeric'),
    body('scenarios.*.postPromoApr').optional().isNumeric().withMessage('postPromoApr must be numeric'),
    body('scenarios.*.promoApr').optional().isNumeric().withMessage('promoApr must be numeric'),
    body('scenarios.*.promoMonths').optional().isInt({ min: 0, max: 120 }).withMessage('promoMonths must be between 0 and 120'),
    body('scenarios.*.termMonths').optional().isInt({ min: 1, max: 480 }).withMessage('termMonths must be between 1 and 480'),
    body('scenarios.*.originationFeePct').optional().isFloat({ min: 0, max: 1 }).withMessage('originationFeePct must be between 0 and 1'),
    body('scenarios.*.transferFeePct').optional().isFloat({ min: 0, max: 1 }).withMessage('transferFeePct must be between 0 and 1'),
    body('scenarios.*.originationFeeFixed').optional().isNumeric().withMessage('originationFeeFixed must be numeric'),
    body('scenarios.*.transferFeeFixed').optional().isNumeric().withMessage('transferFeeFixed must be numeric')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json(new ApiResponse(400, { errors: errors.array() }, 'Validation failed'));
    }

    const recommendation = await debtConsolidationRecommenderService.recommend(req.user.id, req.body || {});

    return new ApiResponse(
        200,
        recommendation,
        'Smart debt consolidation recommendation generated'
    ).send(res);
}));

/**
 * @route   POST /api/debts/emergency-fund/analyze
 * @desc    Analyze emergency fund adequacy with dynamic risk-adjusted sizing - Issue #739
 */
router.post('/emergency-fund/analyze', protect, [
    body('monthlyEssentialExpenses').isNumeric().withMessage('monthlyEssentialExpenses must be a number greater than 0'),
    body('currentEmergencyFund').optional().isNumeric().withMessage('currentEmergencyFund must be numeric'),
    body('employmentType').optional().isIn(['salaried', 'hourly', 'contractor', 'self_employed', 'business_owner', 'unemployed', 'retired']).withMessage('Invalid employmentType'),
    body('industryStability').optional().isNumeric().withMessage('industryStability must be numeric between 0 and 100'),
    body('incomeVariability').optional().isNumeric().withMessage('incomeVariability must be numeric between 0 and 100'),
    body('dependentCount').optional().isInt({ min: 0 }).withMessage('dependentCount must be a non-negative integer'),
    body('healthRiskLevel').optional().isIn(['low', 'medium', 'high']).withMessage('Invalid healthRiskLevel'),
    body('monthlyDebtObligations').optional().isNumeric().withMessage('monthlyDebtObligations must be numeric'),
    body('monthlyNetIncome').optional().isNumeric().withMessage('monthlyNetIncome must be numeric'),
    body('insuranceCoverage').optional().isObject().withMessage('insuranceCoverage must be an object'),
    body('insuranceCoverage.health').optional().isNumeric().withMessage('insuranceCoverage.health must be numeric 0-100'),
    body('insuranceCoverage.disability').optional().isNumeric().withMessage('insuranceCoverage.disability must be numeric 0-100'),
    body('insuranceCoverage.home').optional().isNumeric().withMessage('insuranceCoverage.home must be numeric 0-100'),
    body('insuranceCoverage.auto').optional().isNumeric().withMessage('insuranceCoverage.auto must be numeric 0-100'),
    body('insuranceCoverage.life').optional().isNumeric().withMessage('insuranceCoverage.life must be numeric 0-100'),
    body('spendingHistory').optional().isArray().withMessage('spendingHistory must be an array of monthly expense values'),
    body('secondaryIncomeSources').optional().isArray().withMessage('secondaryIncomeSources must be an array'),
    body('previousProfileSignature').optional().isString().withMessage('previousProfileSignature must be a string')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json(new ApiResponse(400, { errors: errors.array() }, 'Validation failed'));
    }

    if (Number(req.body.monthlyEssentialExpenses) <= 0) {
        return res.status(400).json(new ApiResponse(400, null, 'monthlyEssentialExpenses must be greater than 0'));
    }

    const result = emergencyFundAdequacyAnalyzer.analyze(req.body);

    return new ApiResponse(
        200,
        result,
        'Emergency fund adequacy analysis completed'
    ).send(res);
}));

/**
 * @route   POST /api/debts/emergency-fund/recalibrate
 * @desc    Recalculate emergency fund target after profile changes - Issue #739
 */
router.post('/emergency-fund/recalibrate', protect, [
    body('monthlyEssentialExpenses').isNumeric().withMessage('monthlyEssentialExpenses must be a number greater than 0'),
    body('previousProfileSignature').optional().isString().withMessage('previousProfileSignature must be a string')
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json(new ApiResponse(400, { errors: errors.array() }, 'Validation failed'));
    }

    if (Number(req.body.monthlyEssentialExpenses) <= 0) {
        return res.status(400).json(new ApiResponse(400, null, 'monthlyEssentialExpenses must be greater than 0'));
    }

    const result = emergencyFundAdequacyAnalyzer.analyze(req.body);

    return new ApiResponse(
        200,
        {
            ...result,
            recalibrated: true
        },
        'Emergency fund recommendation recalibrated'
    ).send(res);
}));

export default router;
