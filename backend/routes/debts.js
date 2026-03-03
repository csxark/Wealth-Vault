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
import debtVariableAprOptimizerService from '../services/debtVariableAprOptimizerService.js';
import debtAdherenceRiskScoringService from '../services/debtAdherenceRiskScoringService.js';
import debtPaymentOrchestratorService from '../services/debtPaymentOrchestratorService.js';
import debtEmergencyFundBalancerService from '../services/debtEmergencyFundBalancerService.js';
import debtSequencingOptimizerService from '../services/debtSequencingOptimizerService.js';
import lifeEventDebtStrategyService from '../services/lifeEventDebtStrategyService.js';
import debtNudgeAndMicroPaymentService from '../services/debtNudgeAndMicroPaymentService.js';
import householdDebtOptimizerService from '../services/householdDebtOptimizerService.js';
import delinquencyEarlyWarningService from '../services/delinquencyEarlyWarningService.js';
import taxEfficientDebtCoordinatorService from '../services/taxEfficientDebtCoordinatorService.js';
import dtiRatioOptimizerService from '../services/dtiRatioOptimizerService.js';
import incomeBasedPaymentFlexibilityService from '../services/incomeBasedPaymentFlexibilityService.js';
import creditorNegotiationAssistantService from '../services/creditorNegotiationAssistantService.js';
import paymentAutopilotService from '../services/paymentAutopilotService.js';
import debtConsolidationRoiCalculatorService from '../services/debtConsolidationRoiCalculatorService.js';
import rateArbitrageEngineService from '../services/rateArbitrageEngineService.js';
import taxSmartDebtSequencerService from '../services/taxSmartDebtSequencerService.js';
import debtPaymentDateOptimizerService from '../services/debtPaymentDateOptimizerService.js';
import creditUtilizationSmoothingService from '../services/creditUtilizationSmoothingService.js';
import minimumPaymentShockPredictorService from '../services/minimumPaymentShockPredictorService.js';
import debtRecastVsRefinanceAnalyzerService from '../services/debtRecastVsRefinanceAnalyzerService.js';
import loanPrepaymentPenaltyOptimizerService from '../services/loanPrepaymentPenaltyOptimizerService.js';
import payoffOrderOptimizationEngineService from '../services/payoffOrderOptimizationEngineService.js';
import debtConsolidationLoanAnalyzerService from '../services/debtConsolidationLoanAnalyzerService.js';
import creditInquiryImpactForecasterService from '../services/creditInquiryImpactForecasterService.js';
import incomeBasedStudentLoanRepaymentOptimizerService from '../services/incomeBasedStudentLoanRepaymentOptimizerService.js';
import balanceTransferRateArbitrageEngineService from '../services/balanceTransferRateArbitrageEngineService.js';
import medicalDebtNegotiationOptimizerService from '../services/medicalDebtNegotiationOptimizerService.js';
import creditScoreRecoveryRoadmapService from '../services/creditScoreRecoveryRoadmapService.js';
import promotionalRateShoppingSequencerService from '../services/promotionalRateShoppingSequencerService.js';

import hardshipProgramNegotiationEngineService from '../services/hardshipProgramNegotiationEngineService.js';
import debtToIncomeAutoQualificationSimulatorService from '../services/debtToIncomeAutoQualificationSimulatorService.js';

const router = express.Router();

/**
 * @route   POST /api/debts/promo-rate/sequence
 * @desc    Sequence 0% APR & promotional rate actions for cardholders
 * @access  Protected
 */
router.post(
    '/promo-rate/sequence',
    protect,
    asyncHandler(async (req, res) => {
        const userData = req.body;
router.post(
    '/dti/auto-qualification',
    protect,
    asyncHandler(async (req, res) => {
        const userData = req.body;
        const result = await debtToIncomeAutoQualificationSimulatorService.simulateDTIQualification(userData);
        res.json(new ApiResponse(result));
    })
);
        const result = await promotionalRateShoppingSequencerService.sequencePromotionalRates(userData);
        res.json(new ApiResponse(result));
    })
);

/**
 * @route   POST /api/debts/hardship/negotiation
 * @desc    Assess hardship eligibility and generate negotiation materials
 * @access  Protected
 */
router.post(
    '/hardship/negotiation',
    protect,
    asyncHandler(async (req, res) => {
        const userData = req.body;
        const result = await hardshipProgramNegotiationEngineService.evaluateHardshipPrograms(userData);
        res.json(new ApiResponse(result));
    })
);

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

/**
 * @route   POST /api/debts/variable-apr/optimize
 * @desc    Optimize debt payoff under variable APR scenarios with stress bands
 * @access  Private
 */
router.post('/variable-apr/optimize', protect, [
    body('horizonMonths', 'Horizon months must be between 1 and 600').optional()
        .isNumeric()
        .custom(v => parseInt(v, 10) >= 1 && parseInt(v, 10) <= 600),
    body('strategies', 'Strategies must be an array').optional()
        .isArray({min: 1}),
    body('strategies.*', 'Each strategy must be avalanche, snowball, or hybrid').optional()
        .isIn(['avalanche', 'snowball', 'hybrid']),
    body('rateSchedules', 'Rate schedules must be an object').optional()
        .isObject(),
    body('rateSchedules.*', 'Each rate schedule must be an array').optional()
        .isArray({min: 1}),
    body('rateSchedules.*.*.month', 'Schedule month must be between 1 and 600').optional()
        .isNumeric()
        .custom(v => {
            const month = Number(v);
            return month >= 1 && month <= 600;
        }),
    body('rateSchedules.*.*.apr', 'Schedule APR must be between 0 and 50').optional()
        .isNumeric()
        .custom(v => {
            const apr = Number(v);
            return apr >= 0 && apr <= 50;
        })
], asyncHandler(async (req, res) => {
    // Express-validator check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await debtVariableAprOptimizerService.optimize(req.user.id, req.body);

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Variable APR optimization complete with stress band scenarios'
    ).send(res);
}));

/**
 * @route   POST /api/debts/adherence/score
 * @desc    Score user's behavioral adherence risk for debt plans
 * @access  Private
 */
router.post('/adherence/score', protect, [
    body('lookbackMonths', 'Lookback months must be between 1 and 60').optional()
        .isNumeric()
        .custom(v => parseInt(v, 10) >= 1 && parseInt(v, 10) <= 60),
    body('baseStrategy', 'Base strategy must be avalanche, snowball, or hybrid').optional()
        .isIn(['avalanche', 'snowball', 'hybrid'])
], asyncHandler(async (req, res) => {
    // Express-validator check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await debtAdherenceRiskScoringService.scoreAdherence(req.user.id, req.body);

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Adherence risk scoring complete with stickiness-adjusted recommendations'
    ).send(res);
}));

/**
 * @route   POST /api/debts/strategy/life-events
 * @desc    Recommend debt payoff strategy shifts around life events
 * @access  Private
 */
router.post('/strategy/life-events', protect, [
    body('horizonMonths', 'Horizon months must be between 1 and 120').optional()
        .isNumeric()
        .custom(v => parseInt(v, 10) >= 1 && parseInt(v, 10) <= 120),
    body('monthlyIncome', 'Monthly income must be numeric').optional()
        .isNumeric(),
    body('monthlyExpenses', 'Monthly expenses must be numeric').optional()
        .isNumeric(),
    body('minCashBuffer', 'Minimum cash buffer must be numeric').optional()
        .isNumeric(),
    body('events', 'Events must be an array').optional()
        .isArray(),
    body('events.*.type', 'Event type must be wedding, relocation, layoff-risk, education, baby, home-purchase, career-change, medical, or other').optional()
        .isIn(['wedding', 'relocation', 'layoff-risk', 'education', 'baby', 'home-purchase', 'career-change', 'medical', 'other']),
    body('events.*.date', 'Event date must be a valid ISO8601 date').optional()
        .isISO8601(),
    body('events.*.costMin', 'Event costMin must be numeric and non-negative').optional()
        .isNumeric()
        .custom(v => Number(v) >= 0),
    body('events.*.costMax', 'Event costMax must be numeric and non-negative').optional()
        .isNumeric()
        .custom(v => Number(v) >= 0),
    body('events.*.confidence', 'Event confidence must be between 0 and 1').optional()
        .isNumeric()
        .custom(v => Number(v) >= 0 && Number(v) <= 1),
    body('events.*.incomeImpactPct', 'Event income impact percentage must be between -1 and 1').optional()
        .isNumeric()
        .custom(v => Number(v) >= -1 && Number(v) <= 1)
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await lifeEventDebtStrategyService.recommendStrategyForLifeEvents(req.user.id, req.body);

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Life-event aware debt strategy recommendations generated'
    ).send(res);
}));

/**
 * @route   POST /api/debts/orchestration/orchestrate
 * @desc    Orchestrate optimal debt payment allocation and scheduling
 * @access  Private
 */
router.post('/orchestration/orchestrate', protect, [
    body('monthlyIncome', 'Monthly income must be numeric').optional()
        .isNumeric(),
    body('monthlyExpenses', 'Monthly expenses must be numeric').optional()
        .isNumeric(),
    body('minCashBuffer', 'Minimum cash buffer must be numeric').optional()
        .isNumeric(),
    body('strategy', 'Strategy must be avalanche, snowball, or hybrid').optional()
        .isIn(['avalanche', 'snowball', 'hybrid']),
    body('autoIncreasePercentage', 'Auto-increase percentage must be 0-10').optional()
        .isNumeric()
        .custom(v => parseFloat(v) >= 0 && parseFloat(v) <= 10)
], asyncHandler(async (req, res) => {
    // Express-validator check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await debtPaymentOrchestratorService.orchestratePayments(req.user.id, req.body);

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Debt payment orchestration generated with next-month recommendation'
    ).send(res);
}));

/**
 * @route   POST /api/debts/orchestration/schedule
 * @desc    Setup automated payment schedule with rebalancing
 * @access  Private
 */
router.post('/orchestration/schedule', protect, [
    body('strategy', 'Strategy must be avalanche, snowball, or hybrid').optional()
        .isIn(['avalanche', 'snowball', 'hybrid']),
    body('frequency', 'Frequency must be monthly, bi-weekly, or weekly').optional()
        .isIn(['monthly', 'bi-weekly', 'weekly']),
    body('rebalanceFrequency', 'Rebalance frequency must be monthly or quarterly').optional()
        .isIn(['monthly', 'quarterly']),
    body('autoIncreasePercentage', 'Auto-increase percentage must be 0-10').optional()
        .isNumeric()
        .custom(v => parseFloat(v) >= 0 && parseFloat(v) <= 10)
], asyncHandler(async (req, res) => {
    // Express-validator check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await debtPaymentOrchestratorService.setupPaymentSchedule(req.user.id, req.body);

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Automated payment schedule configured'
    ).send(res);
}));

/**
 * @route   POST /api/debts/nudges/preview
 * @desc    Preview behavioral micro-payment nudge opportunities
 * @access  Private
 */
router.post('/nudges/preview', protect, [
    body('lookbackDays', 'Lookback days must be between 7 and 120').optional()
        .isNumeric()
        .custom(v => parseInt(v, 10) >= 7 && parseInt(v, 10) <= 120),
    body('monthlyIncome', 'Monthly income must be numeric').optional()
        .isNumeric(),
    body('monthlyExpenses', 'Monthly expenses must be numeric').optional()
        .isNumeric(),
    body('monthlyBudget', 'Monthly budget must be numeric').optional()
        .isNumeric(),
    body('minCashBuffer', 'Minimum cash buffer must be numeric').optional()
        .isNumeric(),
    body('thresholdMin', 'Minimum micro-payment threshold must be between 5 and 250').optional()
        .isNumeric()
        .custom(v => Number(v) >= 5 && Number(v) <= 250),
    body('thresholdMax', 'Maximum micro-payment threshold must be between 10 and 500').optional()
        .isNumeric()
        .custom(v => Number(v) >= 10 && Number(v) <= 500),
    body('strategy', 'Strategy must be avalanche, snowball, or hybrid').optional()
        .isIn(['avalanche', 'snowball', 'hybrid'])
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await debtNudgeAndMicroPaymentService.previewNudges(req.user.id, req.body);

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Behavioral nudge preview generated'
    ).send(res);
}));

/**
 * @route   POST /api/debts/nudges/execute
 * @desc    Execute or schedule behavioral micro-payments
 * @access  Private
 */
router.post('/nudges/execute', protect, [
    body('mode', 'Execution mode must be immediate or scheduled').optional()
        .isIn(['immediate', 'scheduled']),
    body('scheduleDate', 'Schedule date must be a valid ISO8601 date').optional()
        .isISO8601(),
    body('lookbackDays', 'Lookback days must be between 7 and 120').optional()
        .isNumeric()
        .custom(v => parseInt(v, 10) >= 7 && parseInt(v, 10) <= 120),
    body('monthlyIncome', 'Monthly income must be numeric').optional()
        .isNumeric(),
    body('monthlyExpenses', 'Monthly expenses must be numeric').optional()
        .isNumeric(),
    body('monthlyBudget', 'Monthly budget must be numeric').optional()
        .isNumeric(),
    body('minCashBuffer', 'Minimum cash buffer must be numeric').optional()
        .isNumeric(),
    body('thresholdMin', 'Minimum micro-payment threshold must be between 5 and 250').optional()
        .isNumeric()
        .custom(v => Number(v) >= 5 && Number(v) <= 250),
    body('thresholdMax', 'Maximum micro-payment threshold must be between 10 and 500').optional()
        .isNumeric()
        .custom(v => Number(v) >= 10 && Number(v) <= 500),
    body('strategy', 'Strategy must be avalanche, snowball, or hybrid').optional()
        .isIn(['avalanche', 'snowball', 'hybrid']),
    body('autoIncreasePercentage', 'Auto-increase percentage must be 0-10').optional()
        .isNumeric()
        .custom(v => parseFloat(v) >= 0 && parseFloat(v) <= 10)
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await debtNudgeAndMicroPaymentService.executeNudges(req.user.id, req.body);

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Behavioral nudge micro-payments executed'
    ).send(res);
}));

/**
 * @route   POST /api/debts/household/optimize
 * @desc    Optimize shared and personal debt payoff at household level
 * @access  Private
 */
router.post('/household/optimize', protect, [
    body('members', 'Members must be a non-empty array').isArray({ min: 1 }),
    body('members.*.id', 'Each member id must be a string').optional().isString(),
    body('members.*.name', 'Each member name must be a string').optional().isString(),
    body('members.*.monthlyIncome', 'Each member monthlyIncome must be numeric').optional().isNumeric(),
    body('members.*.monthlyEssentialExpenses', 'Each member monthlyEssentialExpenses must be numeric').optional().isNumeric(),
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.apr', 'Each debt APR must be numeric between 0 and 100').isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.ownerId', 'Debt ownerId must be a string').optional().isString(),
    body('debts.*.isShared', 'Debt isShared must be boolean').optional().isBoolean(),
    body('debts.*.sharedOwnerIds', 'Debt sharedOwnerIds must be an array').optional().isArray(),
    body('fairnessPreference', 'Fairness preference must be income-proportional, equal-share, or custom-weights').optional()
        .isIn(['income-proportional', 'equal-share', 'custom-weights']),
    body('customWeights', 'customWeights must be an object').optional().isObject(),
    body('sharedMonthlyExpenses', 'Shared monthly expenses must be numeric').optional().isNumeric(),
    body('minCashBuffer', 'Minimum cash buffer must be numeric').optional().isNumeric(),
    body('strategy', 'Strategy must be avalanche, snowball, or hybrid').optional().isIn(['avalanche', 'snowball', 'hybrid'])
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = householdDebtOptimizerService.optimize(req.body);

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Household-level shared debt optimization complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/balance/optimize
 * @desc    Optimize balance between emergency fund and debt payoff
 * @access  Private
 */
router.post('/balance/optimize', protect, [
    body('monthlyIncome', 'Monthly income must be numeric').optional()
        .isNumeric(),
    body('monthlyExpenses', 'Monthly expenses must be numeric').optional()
        .isNumeric(),
    body('horizonMonths', 'Horizon months must be between 1 and 120').optional()
        .isNumeric()
        .custom(v => parseInt(v, 10) >= 1 && parseInt(v, 10) <= 120),
    body('jobType', 'Job type must be stable, moderate, or volatile').optional()
        .isIn(['stable', 'moderate', 'volatile']),
    body('yearsEmployed', 'Years employed must be numeric').optional()
        .isNumeric(),
    body('industryVolatility', 'Industry volatility must be low, moderate, or high').optional()
        .isIn(['low', 'moderate', 'high'])
], asyncHandler(async (req, res) => {
    // Express-validator check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await debtEmergencyFundBalancerService.optimize(req.user.id, req.body);

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Emergency fund and debt payoff balance optimization complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/sequencing/optimize
 * @desc    Optimize debt payoff sequence with constraint handling
 * @access  Private
 */
router.post('/sequencing/optimize', protect, [
    body('horizonMonths', 'Horizon months must be between 1 and 360').optional()
        .isNumeric()
        .custom(v => parseInt(v, 10) >= 1 && parseInt(v, 10) <= 360),
    body('constraints', 'Constraints must be an object').optional()
        .isObject(),
    body('constraints.minimumBalance', 'Minimum balance must be an object').optional()
        .isObject(),
    body('constraints.noTouch', 'No-touch must be an array of debt IDs').optional()
        .isArray(),
    body('constraints.priority', 'Priority must be an array of debt IDs').optional()
        .isArray(),
    body('customSequence', 'Custom sequence must be an array of debt IDs').optional()
        .isArray()
], asyncHandler(async (req, res) => {
    // Express-validator check
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await debtSequencingOptimizerService.optimize(req.user.id, req.body);

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Debt sequencing optimization complete with constraint handling'
    ).send(res);
}));

/**
 * @route   POST /api/debts/delinquency/risk
 * @desc    Assess 90-day delinquency risk and generate intervention playbook
 * @access  Private
 */
router.post('/delinquency/risk', protect, [
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.apr', 'Each debt APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.currentBalance', 'Each debt currentBalance must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.dueDate', 'Each debt dueDate must be ISO8601 date').optional().isISO8601(),
    body('debts.*.creditLimit', 'Each debt creditLimit must be numeric').optional().isNumeric(),
    body('monthlyDisposableIncome', 'Monthly disposable income must be numeric and non-negative').optional()
        .isNumeric()
        .custom(v => Number(v) >= 0),
    body('horizonDays', 'Horizon days must be between 30 and 365').optional()
        .isNumeric()
        .custom(v => Number(v) >= 30 && Number(v) <= 365),
    body('minCashBuffer', 'Minimum cash buffer must be numeric and non-negative').optional()
        .isNumeric()
        .custom(v => Number(v) >= 0)
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await delinquencyEarlyWarningService.assessDelinquencyRisk(
        req.user.id,
        req.body.debts || [],
        req.body.monthlyDisposableIncome || 0,
        {
            horizonDays: req.body.horizonDays,
            minCashBuffer: req.body.minCashBuffer
        }
    );

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Delinquency early-warning assessment complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/tax-efficient/optimize
 * @desc    Co-optimize debt payoff and tax-advantaged savings allocation
 * @access  Private
 */
router.post('/tax-efficient/optimize', protect, [
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.type', 'Each debt type must be valid').optional().isIn(['mortgage', 'student-loan', 'heloc', 'credit-card', 'auto-loan', 'personal-loan', 'medical']),
    body('debts.*.apr', 'Each debt APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.currentBalance', 'Each debt currentBalance must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('monthlySurplus', 'Monthly surplus must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('marginaltaxRate', 'Marginal tax rate must be between 0 and 45%').optional()
        .isNumeric()
        .custom(v => Number(v) >= 0 && Number(v) <= 0.45),
    body('savingsOptions', 'Savings options must be an array').optional().isArray(),
    body('savingsOptions.*.type', 'Each savings type must be valid').optional().isIn(['401k', 'traditional-ira', 'roth-ira', 'hsa', 'none']),
    body('savingsOptions.*.employerMatch', 'Employer match must be numeric').optional().isNumeric(),
    body('savingsOptions.*.matchCap', 'Match cap must be numeric').optional().isNumeric(),
    body('savingsOptions.*.contributionLimit', 'Contribution limit must be numeric').optional().isNumeric(),
    body('savingsOptions.*.fundedBalance', 'Funded balance must be numeric').optional().isNumeric(),
    body('savingsOptions.*.estimatedReturn', 'Estimated return must be numeric').optional().isNumeric()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await taxEfficientDebtCoordinatorService.optimize(req.user.id, req.body);

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Tax-efficient debt and savings optimization complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/dti/optimize
 * @desc    Analyze and optimize debt-to-income ratio with payoff strategies
 * @access  Private
 */
router.post('/dti/optimize', protect, [
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.type', 'Each debt type must be valid').optional().isIn(['mortgage', 'student-loan', 'heloc', 'credit-card', 'auto-loan', 'personal-loan', 'medical']),
    body('debts.*.apr', 'Each debt APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.currentBalance', 'Each debt currentBalance must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.remainingMonths', 'Each debt remainingMonths must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('grossMonthlyIncome', 'Gross monthly income must be numeric and positive').isNumeric().custom(v => Number(v) > 0),
    body('targetDtiPercent', 'Target DTI percent must be between 10 and 50').optional()
        .isNumeric()
        .custom(v => Number(v) >= 10 && Number(v) <= 50),
    body('loanProducts', 'Loan products must be an array').optional().isArray(),
    body('loanProducts.*', 'Each loan product must be valid').optional().isIn(['conventional-mortgage', 'fha-mortgage', 'va-mortgage', 'auto-loan', 'personal-loan', 'refinance']),
    body('projectionMonths', 'Projection months must be an array').optional().isArray()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await dtiRatioOptimizerService.optimize(
        req.user.id,
        req.body.debts || [],
        req.body.grossMonthlyIncome,
        {
            targetDtiPercent: req.body.targetDtiPercent,
            loanProducts: req.body.loanProducts,
            projectionMonths: req.body.projectionMonths
        }
    );

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'DTI ratio optimization analysis complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/income-flexibility/optimize
 * @desc    Generate adaptive payment schedule based on variable income
 * @access  Private
 */
router.post('/income-flexibility/optimize', protect, [
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.type', 'Each debt type must be valid').optional().isIn(['mortgage', 'student-loan', 'heloc', 'credit-card', 'auto-loan', 'personal-loan', 'medical']),
    body('debts.*.apr', 'Each debt APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.currentBalance', 'Each debt currentBalance must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('monthlyExpenses', 'Monthly expenses must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('incomeProfile', 'Income profile must be an object').optional().isObject(),
    body('incomeProfile.base', 'Base income must be numeric and non-negative').optional().isObject(),
    body('incomeProfile.base.amount', 'Base amount must be numeric').optional().isNumeric(),
    body('incomeProfile.bonus', 'Bonus profile must be an object').optional().isObject(),
    body('incomeProfile.bonus.amount', 'Bonus amount must be numeric').optional().isNumeric(),
    body('incomeProfile.bonus.frequencyMonths', 'Bonus frequency must be numeric').optional().isNumeric(),
    body('incomeProfile.bonus.probabilityPercent', 'Probability must be 0-100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('incomeProfile.sidegig', 'Side gig profile must be an object').optional().isObject(),
    body('incomeProfile.sidegig.monthlyAverage', 'Monthly average must be numeric').optional().isNumeric(),
    body('incomeProfile.sidegig.monthlyMin', 'Monthly min must be numeric').optional().isNumeric(),
    body('incomeProfile.sidegig.monthlyMax', 'Monthly max must be numeric').optional().isNumeric(),
    body('incomeProfile.seasonal', 'Seasonal profile must be an object').optional().isObject(),
    body('incomeProfile.seasonal.baseMonthly', 'Base monthly must be numeric').optional().isNumeric(),
    body('incomeProfile.seasonal.peakMonths', 'Peak months must be an array').optional().isArray(),
    body('incomeProfile.seasonal.peakMultiplier', 'Peak multiplier must be numeric').optional().isNumeric(),
    body('incomeProfile.windfalls', 'Windfalls profile must be an object').optional().isObject(),
    body('incomeProfile.windfalls.expectedAnnually', 'Expected annually must be numeric').optional().isNumeric(),
    body('horizonMonths', 'Horizon months must be between 6 and 60').optional()
        .isNumeric()
        .custom(v => Number(v) >= 6 && Number(v) <= 60)
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await incomeBasedPaymentFlexibilityService.optimize(
        req.user.id,
        req.body.debts || [],
        req.body.monthlyExpenses || 0,
        req.body.incomeProfile || {},
        {
            horizonMonths: req.body.horizonMonths
        }
    );

    if (!result.success) {
        return new ApiResponse(400, result, result.message).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Income-based payment flexibility analysis complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/negotiate/suggest
 * @desc    Generate creditor negotiation strategies
 * @access  Private
 */
router.post('/negotiate/suggest', protect, [
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.type', 'Each debt type must be valid').optional().isIn(['mortgage', 'student-loan', 'heloc', 'credit-card', 'auto-loan', 'personal-loan', 'medical']),
    body('debts.*.apr', 'Each debt APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.openedDate', 'Each debt openedDate should be a valid date').optional().isISO8601(),
    body('creditScore', 'Credit score must be numeric between 300 and 850').optional()
        .isNumeric()
        .custom(v => Number(v) >= 300 && Number(v) <= 850),
    body('options', 'Options must be an object').optional().isObject()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await creditorNegotiationAssistantService.optimize(
        req.user.id,
        req.body.debts || [],
        req.body.creditScore || 650,
        req.body.options || {}
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Creditor negotiation strategies generated'
    ).send(res);
}));

/**
 * @route   POST /api/debts/autopilot/configure
 * @desc    Configure smart payment autopilot with dynamic adjustments
 * @access  Private
 */
router.post('/autopilot/configure', protect, [
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.type', 'Each debt type must be valid').optional().isIn(['mortgage', 'student-loan', 'heloc', 'credit-card', 'auto-loan', 'personal-loan', 'medical']),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('configuration', 'Configuration must be an object').optional().isObject(),
    body('configuration.amount', 'Monthly payment amount must be numeric').optional().isNumeric().custom(v => Number(v) >= 0),
    body('configuration.percentage', 'Payment percentage must be numeric 0-100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('configuration.adjustmentEnabled', 'Adjustment enabled must be boolean').optional().isBoolean(),
    body('configuration.accelerationEnabled', 'Acceleration enabled must be boolean').optional().isBoolean(),
    body('currentConditions', 'Current conditions must be an object').optional().isObject(),
    body('currentConditions.monthlyExpenses', 'Monthly expenses must be numeric').optional().isNumeric().custom(v => Number(v) >= 0),
    body('currentConditions.currentIncome', 'Current income must be numeric').optional().isNumeric().custom(v => Number(v) >= 0)
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = await paymentAutopilotService.optimize(
        req.user.id,
        req.body.debts || [],
        req.body.configuration || {},
        req.body.currentConditions || {}
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Payment autopilot configured with smart adjustments'
    ).send(res);
}));

/**
 * @route   POST /api/debts/consolidation/roi
 * @desc    Calculate ROI for debt consolidation scenarios
 * @access  Private
 */
router.post('/consolidation/roi', protect, [
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.type', 'Each debt type must be valid').optional().isIn(['mortgage', 'student-loan', 'heloc', 'credit-card', 'auto-loan', 'personal-loan', 'medical']),
    body('debts.*.apr', 'Each debt APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.isFederalStudentLoan', 'isFederalStudentLoan must be boolean').optional().isBoolean(),
    body('options', 'Options must be an object').optional().isObject(),
    body('options.personalLoan.apr', 'Personal loan APR must be numeric 0-100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('options.personalLoan.termMonths', 'Personal loan termMonths must be between 1 and 600').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 600),
    body('options.personalLoan.originationFeePercent', 'Personal loan origination fee % must be 0-25').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 25),
    body('options.balanceTransfer.apr', 'Balance transfer APR must be numeric 0-100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('options.balanceTransfer.promoApr', 'Balance transfer promo APR must be numeric 0-100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('options.balanceTransfer.promoMonths', 'Balance transfer promo months must be between 0 and 60').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 60),
    body('options.balanceTransfer.transferFeePercent', 'Balance transfer fee % must be 0-10').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 10),
    body('options.heloc.apr', 'HELOC APR must be numeric 0-100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('options.heloc.termMonths', 'HELOC termMonths must be between 1 and 600').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 600),
    body('options.refinance.apr', 'Refinance APR must be numeric 0-100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('options.refinance.termMonths', 'Refinance termMonths must be between 1 and 600').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 600)
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = debtConsolidationRoiCalculatorService.optimize(
        req.user.id,
        req.body.debts || [],
        req.body.options || {}
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Debt consolidation ROI analysis complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/arbitrage/discover
 * @desc    Discover cross-creditor rate arbitrage opportunities
 * @access  Private
 */
router.post('/arbitrage/discover', protect, [
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.type', 'Each debt type must be valid').optional().isIn(['mortgage', 'student-loan', 'heloc', 'credit-card', 'auto-loan', 'personal-loan', 'medical']),
    body('debts.*.apr', 'Each debt APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('eligibleOffers', 'Eligible offers must be an array').optional().isArray(),
    body('eligibleOffers.*.provider', 'Offer provider must be a string').optional().isString(),
    body('eligibleOffers.*.productType', 'Offer productType must be valid').optional().isIn(['balance-transfer', 'personal-loan', 'refinance']),
    body('eligibleOffers.*.apr', 'Offer APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('eligibleOffers.*.promoApr', 'Offer promo APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('eligibleOffers.*.promoMonths', 'Offer promo months must be between 0 and 60').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 60),
    body('eligibleOffers.*.transferFeePercent', 'Transfer fee % must be between 0 and 10').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 10),
    body('eligibleOffers.*.maxTransferAmount', 'Max transfer amount must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('eligibleOffers.*.minCreditScore', 'Min credit score must be between 300 and 850').optional().isNumeric().custom(v => Number(v) >= 300 && Number(v) <= 850),
    body('options', 'Options must be an object').optional().isObject(),
    body('options.creditScore', 'Credit score must be between 300 and 850').optional().isNumeric().custom(v => Number(v) >= 300 && Number(v) <= 850)
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = rateArbitrageEngineService.discover(
        req.user.id,
        req.body.debts || [],
        req.body.eligibleOffers || [],
        req.body.options || {}
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Rate arbitrage opportunities discovered'
    ).send(res);
}));

/**
 * @route   POST /api/debts/tax-optimize/plan
 * @desc    Generate tax-smart debt payoff sequencing plan
 * @access  Private
 */
router.post('/tax-optimize/plan', protect, [
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.type', 'Each debt type must be valid').optional().isIn(['mortgage', 'student-loan', 'heloc', 'credit-card', 'auto-loan', 'personal-loan', 'medical', 'medical', 'other']),
    body('debts.*.apr', 'Each debt APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.monthlyPayment', 'Monthly payment must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.isStudentLoan', 'isStudentLoan must be boolean').optional().isBoolean(),
    body('debts.*.annualInterestDue', 'Annual interest due must be numeric').optional().isNumeric(),
    body('taxProfile', 'Tax profile must be an object').isObject(),
    body('taxProfile.filingStatus', 'Filing status must be valid').optional().isIn(['single', 'married-joint', 'married-sep', 'head-household']),
    body('taxProfile.grossAnnualIncome', 'Gross annual income must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('taxProfile.taxableIncome', 'Taxable income must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('taxProfile.investmentLosses', 'Investment losses must be numeric').optional().isNumeric(),
    body('taxProfile.studentLoanDebtOwnedByUser', 'studentLoanDebtOwnedByUser must be boolean').optional().isBoolean(),
    body('taxProfile.otherDeductions', 'Other deductions must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('taxProfile.estimatedTaxRatePercent', 'Tax rate must be between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('taxProfile.expectedRefundAmount', 'Expected refund must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('taxProfile.refundMonth', 'Refund month must be between 1 and 12').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 12),
    body('taxProfile.historicalRefundTiming', 'Refund timing must be numeric').optional().isNumeric(),
    body('refunds', 'Refunds must be an object').optional().isObject(),
    body('lumpSumPlans', 'Lump sum plans must be an object').optional().isObject()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = taxSmartDebtSequencerService.plan(
        req.body.debts || [],
        req.body.taxProfile || {},
        req.body.refunds || {},
        req.body.lumpSumPlans || {}
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Tax-smart debt payoff plan generated'
    ).send(res);
}));

/**
 * @route   POST /api/debts/payment-dates/optimize
 * @desc    Generate optimized debt payment schedule based on income timing
 * @access  Private
 */
router.post('/payment-dates/optimize', protect, [
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.type', 'Each debt type must be valid').optional().isIn(['mortgage', 'student-loan', 'heloc', 'credit-card', 'auto-loan', 'personal-loan', 'medical']),
    body('debts.*.apr', 'Each debt APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.monthlyPayment', 'Monthly payment must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.dueDate', 'Due date must be between 1 and 31').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 31),
    body('debts.*.statementCloseDate', 'Statement close date must be between 1 and 31').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 31),
    body('debts.*.gracePeriodDays', 'Grace period must be between 0 and 60 days').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 60),
    body('incomeSchedule', 'Income schedule must be an object').isObject(),
    body('incomeSchedule.frequency', 'Frequency must be valid').optional().isIn(['weekly', 'biweekly', 'semimonthly', 'monthly']),
    body('incomeSchedule.paycheckAmount', 'Paycheck amount must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('incomeSchedule.nextPaycheckDate', 'Next paycheck date must be between 1 and 31').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 31),
    body('incomeSchedule.paycheckDates', 'Paycheck dates must be an array').optional().isArray(),
    body('incomeSchedule.paycheckDates.*', 'Each paycheck date must be between 1 and 31').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 31),
    body('incomeSchedule.variableIncome', 'Variable income must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('incomeSchedule.paymentCapacity', 'Payment capacity must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('paymentDateOverrides', 'Payment date overrides must be an object').optional().isObject()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = debtPaymentDateOptimizerService.optimize(
        req.body.debts || [],
        req.body.incomeSchedule || {},
        req.body.paymentDateOverrides || {}
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Optimized payment schedule generated'
    ).send(res);
}));

/**
 * @route   POST /api/debts/utilization/smooth
 * @desc    Generate credit utilization smoothing plan to optimize credit score
 * @access  Private
 */
router.post('/utilization/smooth', protect, [
    body('cards', 'Cards must be a non-empty array').isArray({ min: 1 }),
    body('cards.*.id', 'Each card id must be a string').optional().isString(),
    body('cards.*.name', 'Each card name must be a string').optional().isString(),
    body('cards.*.issuer', 'Each card issuer must be a string').optional().isString(),
    body('cards.*.creditLimit', 'Each card creditLimit must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('cards.*.currentBalance', 'Each card currentBalance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('cards.*.statementCloseDate', 'Statement close date must be between 1 and 31').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 31),
    body('cards.*.daysUntilStatementClose', 'Days until statement close must be between 0 and 30').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 30),
    body('cards.*.recentTransactions', 'Recent transactions must be an array').optional().isArray(),
    body('cards.*.recentTransactions.*.amount', 'Transaction amount must be numeric').optional().isNumeric(),
    body('cards.*.recentTransactions.*.type', 'Transaction type must be valid').optional().isIn(['purchase', 'payment', 'fee', 'interest']),
    body('cards.*.paymentsPending', 'Payments pending must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('cards.*.estimatedMonthlySpend', 'Estimated monthly spend must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('targetUtilizations', 'Target utilizations must be an object').optional().isObject(),
    body('targetUtilizations.excellent', 'Excellent target must be between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('targetUtilizations.veryGood', 'Very good target must be between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('targetUtilizations.good', 'Good target must be between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100)
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = creditUtilizationSmoothingService.smooth(
        req.body.cards || [],
        req.body.targetUtilizations || {}
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Credit utilization smoothing plan generated'
    ).send(res);
}));

/**
 * @route   POST /api/debts/minimum-shock/predict
 * @desc    Predict minimum payment shocks and recommend preventive actions
 * @access  Private
 */
router.post('/minimum-shock/predict', protect, [
    body('debts', 'Debts must be a non-empty array').isArray({ min: 1 }),
    body('debts.*.id', 'Each debt id must be a string').optional().isString(),
    body('debts.*.name', 'Each debt name must be a string').optional().isString(),
    body('debts.*.type', 'Each debt type must be valid').optional().isIn(['credit-card', 'auto-loan', 'student-loan', 'heloc', 'personal-loan', 'mortgage']),
    body('debts.*.balance', 'Each debt balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.apr', 'Each debt APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.minimumPayment', 'Each debt minimumPayment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.monthlyPayment', 'Monthly payment must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.minimumPaymentPercent', 'Minimum payment percent must be between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.gracePeriod', 'Grace period must be between 0 and 12 months').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 12),
    body('debts.*.variableApr', 'Variable APR must be boolean').optional().isBoolean(),
    body('debts.*.aprChangeHistory', 'APR change history must be an array').optional().isArray(),
    body('debts.*.aprChangeHistory.*', 'Each APR change must be numeric').optional().isNumeric(),
    body('debts.*.lastAprChangeDate', 'Last APR change date must be a valid date string').optional().isISO8601(),
    body('debts.*.nextAprReviewDate', 'Next APR review date must be a valid date string').optional().isISO8601(),
    body('debts.*.balanceGrowthRate', 'Balance growth rate must be between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('availableCashFlow', 'Available cash flow must be numeric and positive').isNumeric().custom(v => Number(v) > 0)
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = minimumPaymentShockPredictorService.predict(
        req.body.debts || [],
        req.body.availableCashFlow || 0
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Minimum payment shock prediction complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/recast-refinance/analyze
 * @desc    Analyze and compare recast vs refinance vs acceleration strategies
 * @access  Private
 */
router.post('/recast-refinance/analyze', protect, [
    body('debt', 'Debt must be an object').isObject(),
    body('debt.id', 'Debt id must be a string').optional().isString(),
    body('debt.name', 'Debt name must be a string').optional().isString(),
    body('debt.type', 'Debt type must be valid').optional().isIn(['mortgage', 'auto-loan', 'personal-loan', 'student-loan', 'heloc']),
    body('debt.originalBalance', 'Original balance must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('debt.currentBalance', 'Current balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debt.apr', 'APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debt.monthsRemaining', 'Months remaining must be between 1 and 360').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 360),
    body('debt.monthlyPayment', 'Monthly payment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debt.loanOriginalTerm', 'Loan original term must be between 1 and 360').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 360),
    body('debt.prepaymentPenalty', 'Prepayment penalty must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('debt.lumpSumAmount', 'Lump sum amount must be numeric and positive').isNumeric().custom(v => Number(v) > 0),
    body('refinanceOffers', 'Refinance offers must be an array').optional().isArray(),
    body('refinanceOffers.*.id', 'Offer id must be a string').optional().isString(),
    body('refinanceOffers.*.provider', 'Provider must be a string').optional().isString(),
    body('refinanceOffers.*.apr', 'Offer APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('refinanceOffers.*.termMonths', 'Offer term must be between 1 and 360').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 360),
    body('refinanceOffers.*.originationFeePercent', 'Origination fee % must be between 0 and 10').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 10),
    body('refinanceOffers.*.closingCosts', 'Closing costs must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('preferences', 'Preferences must be an object').optional().isObject(),
    body('preferences.priority', 'Priority must be valid').optional().isIn(['cash-flow', 'speed', 'savings', 'balanced']),
    body('preferences.riskTolerance', 'Risk tolerance must be valid').optional().isIn(['conservative', 'moderate', 'aggressive'])
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = debtRecastVsRefinanceAnalyzerService.analyze(
        req.body.debt || {},
        req.body.refinanceOffers || [],
        req.body.preferences || {}
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Recast vs refinance analysis complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/prepayment-penalty/optimize
 * @desc    Analyze prepayment penalties and optimize acceleration strategy
 * @access  Private
 */
router.post('/prepayment-penalty/optimize', protect, [
    body('debts', 'Debts must be an array').isArray(),
    body('debts.*.id', 'Each debt must have an id').optional().isString(),
    body('debts.*.name', 'Debt name must be a string').optional().isString(),
    body('debts.*.type', 'Debt type must be valid').optional().isIn(['auto-loan', 'mortgage', 'student-loan', 'personal-loan', 'heloc']),
    body('debts.*.balance', 'Balance must be numeric').optional().isNumeric(),
    body('debts.*.currentBalance', 'Current balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.apr', 'APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.monthlyPayment', 'Monthly payment must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.monthsRemaining', 'Months remaining must be between 1 and 360').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 360),
    body('debts.*.hasPrepaymentPenalty', 'Has prepayment penalty must be a boolean').optional().isBoolean(),
    body('debts.*.penaltyType', 'Penalty type must be valid').optional().isIn(['fixed', 'percent-of-balance', 'declining-schedule', 'none']),
    body('debts.*.penaltyAmount', 'Penalty amount must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.penaltyPercent', 'Penalty percent must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.penaltyExpirationMonths', 'Penalty expiration months must be non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.penaltyStartDate', 'Penalty start date must be a valid date string').optional().isISO8601(),
    body('debts.*.penaltyEndDate', 'Penalty end date must be a valid date string').optional().isISO8601(),
    body('debts.*.penaltySchedule', 'Penalty schedule must be an array').optional().isArray(),
    body('debts.*.penaltySchedule.*.month', 'Schedule month must be numeric').optional().isNumeric(),
    body('debts.*.penaltySchedule.*.percent', 'Schedule percent must be numeric').optional().isNumeric(),
    body('debts.*.estimatedInterestSavingsPerMonth', 'Interest savings must be numeric').optional().isNumeric()
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = loanPrepaymentPenaltyOptimizerService.optimize(
        req.body.debts || []
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Prepayment penalty optimization complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/payoff-order/optimize
 * @desc    Analyze and rank optimal debt payoff sequences (Avalanche, Snowball, Hybrid, Custom)
 * @access  Private
 */
router.post('/payoff-order/optimize', protect, [
    body('debts', 'Debts must be an array').isArray(),
    body('debts.*.id', 'Each debt must have an id').optional().isString(),
    body('debts.*.name', 'Debt name must be a string').optional().isString(),
    body('debts.*.type', 'Debt type must be valid').optional().isIn(['auto-loan', 'mortgage', 'student-loan', 'personal-loan', 'heloc', 'credit-card']),
    body('debts.*.balance', 'Balance must be numeric').optional().isNumeric(),
    body('debts.*.currentBalance', 'Current balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.apr', 'APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.minimumPayment', 'Minimum payment must be numeric and positive').isNumeric().custom(v => Number(v) > 0),
    body('debts.*.monthsRemaining', 'Months remaining must be between 1 and 360').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 360),
    body('debts.*.priority', 'Priority must be numeric').optional().isNumeric(),
    body('preferences', 'Preferences must be an object').optional().isObject(),
    body('preferences.minimizeInterest', 'Minimize interest weight must be between 0 and 1').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 1),
    body('preferences.fastestCompletion', 'Fastest completion weight must be between 0 and 1').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 1),
    body('preferences.earlyWins', 'Early wins weight must be between 0 and 1').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 1),
    body('monthlyExtraPayment', 'Monthly extra payment must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0)
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = payoffOrderOptimizationEngineService.optimize(
        req.body.debts || [],
        req.body.preferences || {},
        req.body.monthlyExtraPayment || 0
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Payoff order optimization complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/consolidation-loan/analyze
 * @desc    Analyze consolidation loan offer vs stay-the-course baseline
 * @access  Private
 */
router.post('/consolidation-loan/analyze', protect, [
    body('debts', 'Debts must be an array').isArray(),
    body('debts.*.id', 'Each debt must have an id').optional().isString(),
    body('debts.*.name', 'Debt name must be a string').optional().isString(),
    body('debts.*.type', 'Debt type must be valid').optional().isIn(['auto-loan', 'mortgage', 'student-loan', 'personal-loan', 'heloc', 'credit-card']),
    body('debts.*.balance', 'Balance must be numeric').optional().isNumeric(),
    body('debts.*.currentBalance', 'Current balance must be numeric and non-negative').isNumeric().custom(v => Number(v) >= 0),
    body('debts.*.apr', 'APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('debts.*.minimumPayment', 'Minimum payment must be numeric and positive').isNumeric().custom(v => Number(v) > 0),
    body('debts.*.monthsRemaining', 'Months remaining must be between 1 and 360').optional().isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 360),
    body('consolidationOffer', 'Consolidation offer must be an object').isObject(),
    body('consolidationOffer.apr', 'Offer APR must be numeric between 0 and 100').isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('consolidationOffer.termMonths', 'Offer term must be between 1 and 360').isNumeric().custom(v => Number(v) >= 1 && Number(v) <= 360),
    body('consolidationOffer.originationFeePercent', 'Origination fee % must be between 0 and 10').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 10),
    body('consolidationOffer.closingCosts', 'Closing costs must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('monthlyExtraPayment', 'Monthly extra payment must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0)
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = debtConsolidationLoanAnalyzerService.analyze(
        req.body.debts || [],
        req.body.consolidationOffer || {},
        req.body.monthlyExtraPayment || 0
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Debt consolidation analysis complete'
    ).send(res);
}));

/**
 * @route   POST /api/debts/credit-inquiry/forecast-impact
 * @desc    Forecast credit inquiry impact on credit score and borrowing rates
 * @access  Private
 */
router.post('/credit-inquiry/forecast-impact', protect, [
    body('currentScore', 'Credit score must be between 300 and 850').isNumeric().custom(v => Number(v) >= 300 && Number(v) <= 850),
    body('inquiryCount', 'Inquiry count must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 10),
    body('debtBalance', 'Debt balance must be numeric and non-negative').optional().isNumeric().custom(v => Number(v) >= 0),
    body('currentAPR', 'Current APR must be numeric between 0 and 100').optional().isNumeric().custom(v => Number(v) >= 0 && Number(v) <= 100),
    body('inquiryType', 'Inquiry type must be valid').optional().isIn(['auto', 'mortgage', 'creditcard', 'personal']),
    body('portfolioScenarios', 'Portfolio scenarios must be an array').optional().isArray(),
    body('portfolioScenarios.*.accountType', 'Account type must be valid').optional().isIn(['mortgage', 'auto', 'creditcard'])
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: errors.array()
        });
    }

    const result = creditInquiryImpactForecasterService.forecast(
        req.body.currentScore,
        {
            inquiryCount: req.body.inquiryCount || 0,
            debtBalance: req.body.debtBalance || 0,
            currentAPR: req.body.currentAPR || 0,
            inquiryType: req.body.inquiryType || 'auto',
            portfolioScenarios: req.body.portfolioScenarios || []
        }
    );

    if (result.error) {
        return new ApiResponse(400, result, result.error).send(res);
    }

    return new ApiResponse(
        200,
        result,
        'Credit inquiry impact forecast complete'
    ).send(res);
}));

/**
 * @route   POST /api/credit/recovery-roadmap
 * @desc    Generate personalized credit score recovery roadmap
 * @access  Private
 */
router.post(
    '/recovery-roadmap',
    protect,
    [
        body('currentScore').isInt({ min: 300, max: 850 }).withMessage('Credit score must be between 300-850'),
        body('negativeItems').optional().isArray().withMessage('Negative items must be an array'),
        body('negativeItems.*.type').optional().isIn(['late-payment', 'collection', 'charge-off', 'error', 'bankruptcy', 'inaccuracy']),
        body('negativeItems.*.age').optional().isInt({ min: 0 }).withMessage('Age must be non-negative'),
        body('negativeItems.*.severity').optional().isIn(['low', 'medium', 'high']),
        body('negativeItems.*.amount').optional().isNumeric(),
        body('negativeItems.*.status').optional().isString(),
        body('utilization').optional().isInt({ min: 0, max: 100 }).withMessage('Utilization must be 0-100%'),
        body('inquiries').optional().isInt({ min: 0 }).withMessage('Inquiries must be non-negative'),
        body('creditHistory').optional().isObject(),
        body('creditHistory.accountCount').optional().isInt({ min: 0 }),
        body('creditHistory.ageYears').optional().isNumeric(),
        body('creditHistory.paymentHistory').optional().isString()
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json(new ApiResponse(400, null, errors.array()));
        }
        const { currentScore, negativeItems, utilization, inquiries, creditHistory } = req.body;
        const roadmap = new creditScoreRecoveryRoadmapService({
            currentScore,
            negativeItems,
            utilization,
            inquiries,
            creditHistory
        });
        const profile = roadmap.analyzeProfile();
        const timeline = roadmap.projectRecoveryTimeline();
        const actions = roadmap.rankActions();
        const quickWins = roadmap.identifyQuickWins();
        const eligibility = roadmap.estimateLoanEligibility();
        const plan = roadmap.generateRecoveryPlan();
        return res.json(new ApiResponse(200, {
            profile,
            timeline,
            rankedActions: actions,
            quickWins,
            loanEligibility: eligibility,
            monthlyRecoveryPlan: plan
        }));
    })
);

/**
 * @route   POST /api/debts/medical/optimize-settlement
 * @desc    Optimize medical debt negotiation and settlement strategies
 * @access  Private
 */
router.post(
    '/medical/optimize-settlement',
    protect,
    [
        body('medicalDebts').isArray({ min: 1 }).withMessage('Medical debts array required'),
        body('medicalDebts.*.id').isString().withMessage('Each debt must have an id'),
        body('medicalDebts.*.creditor').isString().withMessage('Each debt must have a creditor'),
        body('medicalDebts.*.amount').isNumeric().withMessage('Each debt must have an amount'),
        body('medicalDebts.*.originalDate').isISO8601().withMessage('Each debt must have a valid originalDate'),
        body('medicalDebts.*.creditorType').optional().isIn(['hospital', 'provider', 'collection-agency']),
        body('userIncome').optional().isNumeric().withMessage('User income must be numeric'),
        body('cashAvailable').optional().isNumeric().withMessage('Cash available must be numeric'),
        body('taxBracket').optional().isNumeric().withMessage('Tax bracket must be numeric')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json(new ApiResponse(400, null, errors.array()));
        }
        const { medicalDebts, userIncome, cashAvailable, taxBracket } = req.body;
        const optimizer = new medicalDebtNegotiationOptimizerService({
            medicalDebts,
            userIncome,
            cashAvailable,
            taxBracket
        });
        const rankedDebts = optimizer.rankDebts();
        const recommendations = rankedDebts.map(debt => ({
            debt,
            settlementOffers: optimizer.modelSettlementOffers(debt),
            negotiationScript: optimizer.generateNegotiationScript(debt),
            scenarios: optimizer.simulateScenarios(debt),
            timing: optimizer.recommendTiming(debt)
        }));
        return res.json(new ApiResponse(200, {
            rankedDebts,
            recommendations,
            totalPotentialSavings: rankedDebts.reduce((sum, d) => sum + d.bestOffer.netSavings, 0)
        }));
    })
);

export default router;

/**
 * @route   POST /api/debts/balance-transfer/optimize
 * @desc    Optimize balance transfer rate arbitrage for credit cardholders
 * @access  Private
 */
router.post(
    '/balance-transfer/optimize',
    protect,
    [
        body('cards').isArray({ min: 1 }).withMessage('Cards array required'),
        body('debts').isArray({ min: 1 }).withMessage('Debts array required'),
        body('transferOffers').isArray({ min: 1 }).withMessage('Transfer offers array required')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json(new ApiResponse(400, null, errors.array()));
        }
        const { cards, debts, transferOffers } = req.body;
        const engine = new balanceTransferRateArbitrageEngineService({ cards, debts, transferOffers });
        const recommendations = engine.recommendTransfers();
        const actionPlan = engine.generateActionPlan();
        const utilizationFlags = engine.flagCreditUtilization();
        const sequentialPlan = engine.simulateSequentialTransfers();
        return res.json(new ApiResponse(200, {
            recommendations,
            actionPlan,
            utilizationFlags,
            sequentialPlan
        }));
    })
);

/**
 * @route   POST /api/debts/student-loans/repayment-optimizer
 * @desc    Optimize student loan repayment plan based on income and scenario
 * @access  Private
 */
router.post(
    '/student-loans/repayment-optimizer',
    protect,
    [
        body('loans').isArray({ min: 1 }).withMessage('Loans array required'),
        body('income').isNumeric().withMessage('Income required'),
        body('familySize').isInt({ min: 1 }).withMessage('Family size required'),
        body('publicServiceMonths').optional().isInt({ min: 0 }),
        body('povertyLine').optional().isNumeric(),
        body('incomeHistory').optional().isArray(),
        body('employmentHistory').optional().isArray()
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json(new ApiResponse(400, null, errors.array()));
        }
        const {
            loans,
            income,
            familySize,
            employmentHistory,
            publicServiceMonths,
            povertyLine,
            incomeHistory
        } = req.body;
        const optimizer = new incomeBasedStudentLoanRepaymentOptimizerService({
            loans,
            income,
            familySize,
            employmentHistory,
            publicServiceMonths,
            povertyLine,
            incomeHistory
        });
        // Default ranking: lowest monthly payment
        const rankedPlans = optimizer.rankPlans('lowestMonthlyPayment');
        return res.json(new ApiResponse(200, rankedPlans));
    })
);
