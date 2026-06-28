/**
 * Private Debt Routes
 * API endpoints for Bayesian private debt default prediction, YaR simulation,
 * collateral management, and debt evaluation
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as bayesianEngine from '../services/bayesianInferenceEngine.js';
import * as yarService from '../services/yieldAtRiskService.js';
import * as debtEvaluator from '../services/privateDebtEvaluator.js';
import * as collateralOrchestrator from '../services/collateralCallOrchestrator.js';
import * as amortizationService from '../services/debtAmortizationService.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/** ======================
 *  BAYESIAN PARAMETERS
 *  ======================*/

/**
 * POST /api/private-debt/bayesian/initialize
 * Initialize Bayesian parameters for a debt
 */
router.post('/bayesian/initialize', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId, borrowerCreditSpread, borrowerLeverageRatio, borrowerInterestCoverageRatio } = req.body;

        if (!debtId) {
            return res.status(400).json({ error: 'debtId is required' });
        }

        const params = await bayesianEngine.initializeBayesianParams(userId, debtId, {
            borrowerCreditSpread,
            borrowerLeverageRatio,
            borrowerInterestCoverageRatio
        });

        res.json({
            success: true,
            message: 'Bayesian parameters initialized',
            data: params
        });
    } catch (error) {
        console.error('Error initializing Bayesian parameters:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/private-debt/bayesian/:debtId
 * Get Bayesian parameters for a debt
 */
router.get('/bayesian/:debtId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId } = req.params;

        const params = await bayesianEngine.getBayesianParams(userId, parseInt(debtId));

        if (!params) {
            return res.status(404).json({ error: 'Bayesian parameters not found' });
        }

        res.json({
            success: true,
            data: params
        });
    } catch (error) {
        console.error('Error fetching Bayesian parameters:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/private-debt/bayesian/:debtId/payment-event
 * Record a payment event (updates posterior)
 */
router.post('/bayesian/:debtId/payment-event', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId } = req.params;
        const { paymentType, expectedDays, actualDays } = req.body;

        if (!paymentType || !['on_time', 'late', 'missed'].includes(paymentType)) {
            return res.status(400).json({ error: 'Invalid paymentType (on_time, late, missed)' });
        }

        const updated = await bayesianEngine.recordPaymentEvent(userId, parseInt(debtId), {
            paymentType,
            expectedDays,
            actualDays
        });

        res.json({
            success: true,
            message: 'Payment event recorded, Bayesian parameters updated',
            data: updated
        });
    } catch (error) {
        console.error('Error recording payment event:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/private-debt/bayesian/:debtId/update-macro
 * Update with macro factors (Fed rate, GDP)
 */
router.post('/bayesian/:debtId/update-macro', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId } = req.params;

        const updated = await bayesianEngine.updateWithMacroFactors(userId, parseInt(debtId));

        res.json({
            success: true,
            message: 'Macro factor adjustments applied',
            data: updated
        });
    } catch (error) {
        console.error('Error updating macro factors:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/private-debt/bayesian/all
 * Get all debts with Bayesian parameters
 */
router.get('/bayesian/all', async (req, res) => {
    try {
        const userId = req.user.id;

        const debts = await bayesianEngine.getAllDebtsWithBayesianParams(userId);

        res.json({
            success: true,
            count: debts.length,
            data: debts
        });
    } catch (error) {
        console.error('Error fetching all Bayesian debts:', error);
        res.status(500).json({ error: error.message });
    }
});

/** ======================
 *  YIELD-AT-RISK (YaR)
 *  ======================*/

/**
 * POST /api/private-debt/simulations/yar
 * Run Yield-at-Risk simulation
 */
router.post('/simulations/yar', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtIds, horizonMonths, iterations, macroScenario, includeCorrelation } = req.body;

        if (!debtIds || !Array.isArray(debtIds) || debtIds.length === 0) {
            return res.status(400).json({ error: 'debtIds array is required' });
        }

        const results = await yarService.calculateYieldAtRisk(userId, debtIds, {
            horizonMonths,
            iterations,
            macroScenario,
            includeCorrelation
        });

        res.json({
            success: true,
            message: 'YaR simulation completed',
            data: results
        });
    } catch (error) {
        console.error('Error running YaR simulation:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/private-debt/simulations/:simulationId
 * Get simulation results by ID
 */
router.get('/simulations/:simulationId', async (req, res) => {
    try {
        const userId = req.user.id;
        const { simulationId } = req.params;

        const results = await yarService.getSimulationResults(userId, parseInt(simulationId));

        if (!results) {
            return res.status(404).json({ error: 'Simulation not found' });
        }

        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error fetching simulation results:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/private-debt/simulations
 * List all simulations
 */
router.get('/simulations', async (req, res) => {
    try {
        const userId = req.user.id;
        const { simulationType } = req.query;

        const simulations = await yarService.listSimulations(userId, { simulationType });

        res.json({
            success: true,
            count: simulations.length,
            data: simulations
        });
    } catch (error) {
        console.error('Error listing simulations:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/private-debt/stress-test
 * Run stress test across all macro scenarios
 */
router.post('/stress-test', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtIds, horizonMonths, iterations } = req.body;

        if (!debtIds || !Array.isArray(debtIds) || debtIds.length === 0) {
            return res.status(400).json({ error: 'debtIds array is required' });
        }

        const results = await yarService.runStressTest(userId, debtIds, {
            horizonMonths,
            iterations
        });

        res.json({
            success: true,
            message: 'Stress test completed',
            data: results
        });
    } catch (error) {
        console.error('Error running stress test:', error);
        res.status(500).json({ error: error.message });
    }
});

/** ======================
 *  DEBT EVALUATION
 *  ======================*/

/**
 * GET /api/private-debt/:debtId/evaluate
 * Comprehensive debt evaluation
 */
router.get('/:debtId/evaluate', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId } = req.params;

        const evaluation = await debtEvaluator.evaluatePrivateDebt(userId, parseInt(debtId));

        res.json({
            success: true,
            data: evaluation
        });
    } catch (error) {
        console.error('Error evaluating debt:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/private-debt/:debtId/pik-accrue
 * Accrue PIK interest
 */
router.post('/:debtId/pik-accrue', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId } = req.params;
        const { periodEndDate } = req.body;

        const result = await debtEvaluator.accruePIKInterest(
            userId,
            parseInt(debtId),
            periodEndDate ? new Date(periodEndDate) : new Date()
        );

        res.json({
            success: true,
            message: 'PIK interest accrued',
            data: result
        });
    } catch (error) {
        console.error('Error accruing PIK interest:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/private-debt/:debtId/conversion-eligibility
 * Evaluate debt-to-equity conversion eligibility
 */
router.get('/:debtId/conversion-eligibility', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId } = req.params;

        const eligibility = await debtEvaluator.evaluateDebtToEquityConversion(userId, parseInt(debtId));

        res.json({
            success: true,
            data: eligibility
        });
    } catch (error) {
        console.error('Error evaluating conversion eligibility:', error);
        res.status(500).json({ error: error.message });
    }
});

/** ======================
 *  COLLATERAL MANAGEMENT
 *  ======================*/

/**
 * GET /api/private-debt/collateral/status
 * Get collateral status for all positions
 */
router.get('/collateral/status', async (req, res) => {
    try {
        const userId = req.user.id;

        const status = await collateralOrchestrator.checkAllCollateralPositions(userId);

        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Error checking collateral status:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/private-debt/collateral/attention
 * Get positions requiring attention
 */
router.get('/collateral/attention', async (req, res) => {
    try {
        const userId = req.user.id;

        const positions = await collateralOrchestrator.getPositionsRequiringAttention(userId);

        res.json({
            success: true,
            count: positions.length,
            data: positions
        });
    } catch (error) {
        console.error('Error fetching positions requiring attention:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/private-debt/collateral/:positionId/satisfy-margin-call
 * Satisfy margin call by adding collateral
 */
router.post('/collateral/:positionId/satisfy-margin-call', async (req, res) => {
    try {
        const userId = req.user.id;
        const { positionId } = req.params;
        const { addedCollateralValue } = req.body;

        if (!addedCollateralValue || addedCollateralValue <= 0) {
            return res.status(400).json({ error: 'addedCollateralValue must be positive' });
        }

        const result = await collateralOrchestrator.satisfyMarginCall(
            userId,
            parseInt(positionId),
            parseFloat(addedCollateralValue)
        );

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error satisfying margin call:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/private-debt/collateral/:positionId/revalue
 * Revalue collateral
 */
router.post('/collateral/:positionId/revalue', async (req, res) => {
    try {
        const userId = req.user.id;
        const { positionId } = req.params;
        const { newValue, valuationSource } = req.body;

        if (!newValue || newValue <= 0) {
            return res.status(400).json({ error: 'newValue must be positive' });
        }

        const result = await collateralOrchestrator.revalueCollateral(
            userId,
            parseInt(positionId),
            parseFloat(newValue),
            valuationSource
        );

        res.json({
            success: true,
            message: 'Collateral revalued',
            data: result
        });
    } catch (error) {
        console.error('Error revaluing collateral:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/private-debt/collateral/revaluations
 * Get upcoming revaluations
 */
router.get('/collateral/revaluations', async (req, res) => {
    try {
        const userId = req.user.id;
        const { daysAhead } = req.query;

        const revaluations = await collateralOrchestrator.getUpcomingRevaluations(
            userId,
            daysAhead ? parseInt(daysAhead) : 30
        );

        res.json({
            success: true,
            count: revaluations.length,
            data: revaluations
        });
    } catch (error) {
        console.error('Error fetching upcoming revaluations:', error);
        res.status(500).json({ error: error.message });
    }
});

/** ======================
 *  AMORTIZATION
 *  ======================*/

/**
 * GET /api/private-debt/:debtId/amortization
 * Get amortization schedule
 */
router.get('/:debtId/amortization', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId } = req.params;

        const schedule = await amortizationService.generateAmortizationSchedule(userId, parseInt(debtId));

        res.json({
            success: true,
            data: schedule
        });
    } catch (error) {
        console.error('Error generating amortization schedule:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/private-debt/:debtId/pik-schedule
 * Get PIK amortization schedule
 */
router.get('/:debtId/pik-schedule', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId } = req.params;
        const { periodsAhead } = req.query;

        const schedule = await amortizationService.generatePIKSchedule(
            userId,
            parseInt(debtId),
            periodsAhead ? parseInt(periodsAhead) : 12
        );

        res.json({
            success: true,
            data: schedule
        });
    } catch (error) {
        console.error('Error generating PIK schedule:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/private-debt/:debtId/irregular-payment
 * Apply irregular payment
 */
router.post('/:debtId/irregular-payment', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId } = req.params;
        const { paymentAmount, paymentDate } = req.body;

        if (!paymentAmount || paymentAmount <= 0) {
            return res.status(400).json({ error: 'paymentAmount must be positive' });
        }

        const result = await amortizationService.applyIrregularPayment(
            userId,
            parseInt(debtId),
            parseFloat(paymentAmount),
            paymentDate ? new Date(paymentDate) : new Date()
        );

        res.json({
            success: true,
            message: 'Irregular payment applied',
            data: result
        });
    } catch (error) {
        console.error('Error applying irregular payment:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/private-debt/:debtId/calculate-prepayment
 * Calculate prepayment impact
 */
router.post('/:debtId/calculate-prepayment', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId } = req.params;
        const { prepaymentAmount } = req.body;

        if (!prepaymentAmount || prepaymentAmount <= 0) {
            return res.status(400).json({ error: 'prepaymentAmount must be positive' });
        }

        const analysis = await amortizationService.calculatePrepayment(
            userId,
            parseInt(debtId),
            parseFloat(prepaymentAmount)
        );

        res.json({
            success: true,
            data: analysis
        });
    } catch (error) {
        console.error('Error calculating prepayment:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/private-debt/:debtId/cash-flows
 * Project future cash flows
 */
router.get('/:debtId/cash-flows', async (req, res) => {
    try {
        const userId = req.user.id;
        const { debtId } = req.params;
        const { horizonMonths } = req.query;

        const projection = await amortizationService.projectCashFlows(
            userId,
            parseInt(debtId),
            horizonMonths ? parseInt(horizonMonths) : 24
        );

        res.json({
            success: true,
            data: projection
        });
    } catch (error) {
        console.error('Error projecting cash flows:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
