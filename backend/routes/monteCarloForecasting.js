/**
 * Monte Carlo Forecasting Routes
 * API endpoints for probabilistic Monte Carlo cashflow simulations
 */

import express from 'express';
import { db } from '../config/db.js';
import { 
    forecastScenarios, 
    forecastSimulationResults, 
    forecastAggregates,
    runwayAlertThresholds
} from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth.js';
import { 
    runMonteCarloSimulation, 
    runWhatIfAnalysis,
    assessFinancialHealth,
    calculateUncertainty
} from '../services/cashflowSimulationEngine.js';

const router = express.Router();

/**
 * GET /api/monte-carlo/scenarios
 * Get all forecast scenarios
 */
router.get('/scenarios', authenticateToken, async (req, res) => {
    try {
        const scenarios = await db
            .select()
            .from(forecastScenarios)
            .where(eq(forecastScenarios.userId, req.user.userId))
            .orderBy(desc(forecastScenarios.createdAt));
        
        res.json({
            success: true,
            count: scenarios.length,
            scenarios
        });
    } catch (error) {
        console.error('Error fetching scenarios:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/monte-carlo/scenarios
 * Create new forecast scenario
 */
router.post('/scenarios', authenticateToken, async (req, res) => {
    try {
        const {
            scenarioName,
            description,
            scenarioType = 'baseline',
            simulationCount = 10000,
            forecastHorizonDays = 365,
            confidenceLevel = 0.90,
            revenueParams,
            expenseParams,
            economicFactors,
            initialCashBalance,
            minimumCashReserve
        } = req.body;
        
        if (!scenarioName) {
            return res.status(400).json({ success: false, error: 'Scenario name is required' });
        }
        
        const [scenario] = await db.insert(forecastScenarios).values({
            userId: req.user.userId,
            scenarioName,
            description,
            scenarioType,
            simulationCount,
            forecastHorizonDays,
            confidenceLevel,
            revenueParams: revenueParams || {},
            expenseParams: expenseParams || {},
            economicFactors: economicFactors || {},
            initialCashBalance: initialCashBalance || '0',
            minimumCashReserve: minimumCashReserve || '0'
        }).returning();
        
        res.status(201).json({ success: true, scenario });
    } catch (error) {
        console.error('Error creating scenario:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/monte-carlo/scenarios/:id/simulate
 * Run Monte Carlo simulation
 */
router.post('/scenarios/:id/simulate', authenticateToken, async (req, res) => {
    try {
        const [scenario] = await db
            .select()
            .from(forecastScenarios)
            .where(and(
                eq(forecastScenarios.id, req.params.id),
                eq(forecastScenarios.userId, req.user.userId)
            ));
        
        if (!scenario) {
            return res.status(404).json({ success: false, error: 'Scenario not found' });
        }
        
        // Lock scenario
        await db.update(forecastScenarios).set({ isLocked: true }).where(eq(forecastScenarios.id, scenario.id));
        
        // Run simulation
        const simCount = req.body.simulationCount || scenario.simulationCount || 10000;
        const results = await runMonteCarloSimulation(scenario, simCount);
        
        // Save aggregates
        await db.insert(forecastAggregates).values({
            scenarioId: scenario.id,
            userId: req.user.userId,
            batchId: results.batchId,
            p10FinalBalance: results.aggregates.p10FinalBalance.toString(),
            p50FinalBalance: results.aggregates.p50FinalBalance.toString(),
            p90FinalBalance: results.aggregates.p90FinalBalance.toString(),
            p10DaysToDepletion: results.aggregates.p10DaysToDepletion,
            p50DaysToDepletion: results.aggregates.p50DaysToDepletion,
            p90DaysToDepletion: results.aggregates.p90DaysToDepletion,
            depletionProbability: results.aggregates.depletionProbability.toString(),
            dailyPercentiles: results.aggregates.dailyPercentiles,
            finalBalanceDistribution: results.aggregates.finalBalanceDistribution,
            dailyVolatilityDistribution: results.aggregates.dailyVolatilityDistribution,
            meanFinalBalance: results.aggregates.meanFinalBalance.toString(),
            stdDevFinalBalance: results.aggregates.stdDevFinalBalance.toString(),
            skewness: results.aggregates.skewness,
            kurtosis: results.aggregates.kurtosis,
            totalSimulations: results.metadata.totalSimulations,
            successfulSimulations: results.metadata.successfulSimulations,
            totalExecutionTimeMs: results.metadata.totalExecutionTimeMs
        });
        
        // Update scenario
        await db.update(forecastScenarios).set({
            lastRunAt: new Date(),
            isLocked: false
        }).where(eq(forecastScenarios.id, scenario.id));
        
        const healthAssessment = assessFinancialHealth(results.aggregates);
        
        res.json({
            success: true,
            batchId: results.batchId,
            aggregates: results.aggregates,
            healthAssessment,
            metadata: results.metadata
        });
    } catch (error) {
        console.error('Error running simulation:', error);
        await db.update(forecastScenarios).set({ isLocked: false }).where(eq(forecastScenarios.id, req.params.id));
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/monte-carlo/scenarios/:id/results
 * Get simulation results
 */
router.get('/scenarios/:id/results', authenticateToken, async (req, res) => {
    try {
        const [aggregate] = await db
            .select()
            .from(forecastAggregates)
            .where(and(
                eq(forecastAggregates.scenarioId, req.params.id),
                eq(forecastAggregates.userId, req.user.userId)
            ))
            .orderBy(desc(forecastAggregates.computedAt))
            .limit(1);
        
        if (!aggregate) {
            return res.status(404).json({ success: false, error: 'No results found' });
        }
        
        const healthAssessment = assessFinancialHealth(aggregate);
        
        res.json({
            success: true,
            results: aggregate,
            healthAssessment,
            uncertainty: calculateUncertainty(aggregate)
        });
    } catch (error) {
        console.error('Error fetching results:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/monte-carlo/scenarios/:id/fan-chart
 * Get fan chart data
 */
router.get('/scenarios/:id/fan-chart', authenticateToken, async (req, res) => {
    try {
        const [aggregate] = await db
            .select()
            .from(forecastAggregates)
            .where(and(
                eq(forecastAggregates.scenarioId, req.params.id),
                eq(forecastAggregates.userId, req.user.userId)
            ))
            .orderBy(desc(forecastAggregates.computedAt))
            .limit(1);
        
        if (!aggregate) {
            return res.status(404).json({ success: false, error: 'No results found' });
        }
        
        res.json({
            success: true,
            fanChartData: aggregate.dailyPercentiles,
            confidenceIntervals: {
                p10: parseFloat(aggregate.p10FinalBalance),
                p50: parseFloat(aggregate.p50FinalBalance),
                p90: parseFloat(aggregate.p90FinalBalance)
            }
        });
    } catch (error) {
        console.error('Error fetching fan chart:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/monte-carlo/scenarios/:id/histogram
 * Get histogram data
 */
router.get('/scenarios/:id/histogram', authenticateToken, async (req, res) => {
    try {
        const type = req.query.type || 'balance';
        
        const [aggregate] = await db
            .select()
            .from(forecastAggregates)
            .where(and(
                eq(forecastAggregates.scenarioId, req.params.id),
                eq(forecastAggregates.userId, req.user.userId)
            ))
            .orderBy(desc(forecastAggregates.computedAt))
            .limit(1);
        
        if (!aggregate) {
            return res.status(404).json({ success: false, error: 'No results found' });
        }
        
        const histogramData = type === 'volatility' 
            ? aggregate.dailyVolatilityDistribution 
            : aggregate.finalBalanceDistribution;
        
        res.json({
            success: true,
            type,
            histogram: histogramData,
            summary: {
                mean: parseFloat(aggregate.meanFinalBalance),
                stdDev: parseFloat(aggregate.stdDevFinalBalance),
                skewness: aggregate.skewness,
                kurtosis: aggregate.kurtosis
            }
        });
    } catch (error) {
        console.error('Error fetching histogram:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/monte-carlo/what-if
 * Run What-If analysis
 */
router.post('/what-if', authenticateToken, async (req, res) => {
    try {
        const { baselineScenarioId, modifications, simulationCount = 5000 } = req.body;
        
        if (!baselineScenarioId || !modifications) {
            return res.status(400).json({ success: false, error: 'baselineScenarioId and modifications required' });
        }
        
        const [baselineScenario] = await db
            .select()
            .from(forecastScenarios)
            .where(and(
                eq(forecastScenarios.id, baselineScenarioId),
                eq(forecastScenarios.userId, req.user.userId)
            ));
        
        if (!baselineScenario) {
            return res.status(404).json({ success: false, error: 'Baseline scenario not found' });
        }
        
        const comparison = await runWhatIfAnalysis(baselineScenario, modifications, simulationCount);
        
        res.json({ success: true, comparison });
    } catch (error) {
        console.error('Error running what-if analysis:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/monte-carlo/runway-alert
 * Get runway alert thresholds
 */
router.get('/runway-alert', authenticateToken, async (req, res) => {
    try {
        let [threshold] = await db
            .select()
            .from(runwayAlertThresholds)
            .where(eq(runwayAlertThresholds.userId, req.user.userId));
        
        if (!threshold) {
            [threshold] = await db.insert(runwayAlertThresholds).values({
                userId: req.user.userId,
                minDaysRunwayP50: 90,
                maxDepletionProbability: '0.20',
                minCashReserveP10: '5000'
            }).returning();
        }
        
        res.json({ success: true, threshold });
    } catch (error) {
        console.error('Error fetching runway alert:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/monte-carlo/runway-alert
 * Update runway alert thresholds
 */
router.put('/runway-alert', authenticateToken, async (req, res) => {
    try {
        const updates = {};
        const allowedFields = ['minDaysRunwayP50', 'maxDepletionProbability', 'minCashReserveP10', 'enableCircuitBreaker', 'circuitBreakerThreshold'];
        
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });
        
        updates.updatedAt = new Date();
        
        const [updated] = await db
            .update(runwayAlertThresholds)
            .set(updates)
            .where(eq(runwayAlertThresholds.userId, req.user.userId))
            .returning();
        
        res.json({ success: true, threshold: updated });
    } catch (error) {
        console.error('Error updating runway alert:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
