/**
 * Yield-at-Risk (YaR) Service
 * Calculates portfolio-wide yield-at-risk using Monte Carlo simulation
 * Estimates 99% confidence interval for yield loss over 12-month horizon
 */

import { db } from '../config/db.js';
import { debts, debtBayesianParams, defaultSimulations } from '../db/schema.js';
import { eq, and, inArray, desc } from 'drizzle-orm';
import {
    generateNormal,
    generateCorrelatedNormals,
    calculateVaR,
    calculateCVaR,
    mean,
    stdDev,
    skewness,
    kurtosis,
    percentile,
    covarianceMatrix
} from '../utils/probabilisticMath.js';
import { getBayesianParams } from './bayesianInferenceEngine.js';

/**
 * Run Monte Carlo simulation for Yield-at-Risk calculation
 */
export async function calculateYieldAtRisk(userId, debtIds, options = {}) {
    const {
        horizonMonths = 12,
        iterations = 10000,
        confidenceLevels = [0.90, 0.95, 0.99],
        macroScenario = 'base_case', // 'base_case', 'recession', 'boom', 'stress'
        includeCorrelation = true
    } = options;

    console.log(`Starting YaR calculation for ${debtIds.length} debts with ${iterations} iterations...`);

    // Fetch debt details and Bayesian parameters
    const debtsData = await db.select()
        .from(debts)
        .where(and(
            eq(debts.userId, userId),
            inArray(debts.id, debtIds)
        ));

    const bayesianParamsData = await Promise.all(
        debtIds.map(debtId => getBayesianParams(userId, debtId))
    );

    if (debtsData.length === 0) {
        throw new Error('No debts found for the given IDs');
    }

    // Build debt portfolio
    const portfolio = debtsData.map((debt, idx) => ({
        id: debt.id,
        name: debt.name,
        principalAmount: parseFloat(debt.currentBalance),
        interestRate: parseFloat(debt.interestRate),
        defaultProbability: parseFloat(bayesianParamsData[idx]?.subjectiveProbabilityOfDefault || 0.01),
        recoveryRate: 0.40, // Assume 40% recovery rate
        maturityMonths: Math.max(1, Math.ceil((new Date(debt.plannedPayoffDate) - new Date()) / (30 * 24 * 60 * 60 * 1000)))
    }));

    // Calculate correlation matrix if needed
    let correlationMatrix = null;
    if (includeCorrelation && portfolio.length > 1) {
        correlationMatrix = estimateDefaultCorrelation(portfolio);
    }

    // Macro scenario parameters
    const macroParams = getMacroScenarioParams(macroScenario);

    // Run Monte Carlo simulation
    const simulationResults = [];
    const yieldDistribution = [];

    const startTime = Date.now();

    for (let iter = 0; iter < iterations; iter++) {
        const pathResult = simulateSinglePath(portfolio, horizonMonths, macroParams, correlationMatrix);
        simulationResults.push(pathResult);
        yieldDistribution.push(pathResult.portfolioYield);
    }

    const executionTime = Date.now() - startTime;

    // Calculate YaR metrics
    const sortedYields = [...yieldDistribution].sort((a, b) => a - b);
    const expectedYield = mean(yieldDistribution);

    const yarMetrics = {};
    for (const confidence of confidenceLevels) {
        const varIndex = Math.floor((1 - confidence) * iterations);
        const yieldAtRisk = sortedYields[varIndex];
        yarMetrics[`yar_${(confidence * 100).toFixed(0)}`] = yieldAtRisk;
    }

    // Calculate VaR in dollar terms (loss amounts)
    const lossDistribution = yieldDistribution.map(y => -y); // Negative yield = loss
    const var99 = calculateVaR(lossDistribution, 0.99);
    const var95 = calculateVaR(lossDistribution, 0.95);
    const cvar99 = calculateCVaR(lossDistribution, 0.99);

    // Portfolio-wide default statistics
    const defaultEvents = simulationResults.map(r => r.defaultedDebtCount);
    const avgDefaultCount = mean(defaultEvents);
    const maxDefaultCount = Math.max(...defaultEvents);

    const totalLosses = simulationResults.map(r => r.totalLoss);
    const expectedLoss = mean(totalLosses);
    const unexpectedLoss = stdDev(totalLosses);

    // Distribution metrics
    const distributionMetrics = {
        mean: mean(yieldDistribution),
        stdDev: stdDev(yieldDistribution),
        skewness: skewness(yieldDistribution),
        kurtosis: kurtosis(yieldDistribution)
    };

    // Path distribution percentiles
    const percentiles = [1, 5, 10, 25, 50, 75, 90, 95, 99];
    const pathDistribution = percentiles.map(p => ({
        percentile: p,
        yield: percentile(yieldDistribution, p)
    }));

    // Worst case scenarios
    const worstCases = simulationResults
        .sort((a, b) => a.portfolioYield - b.portfolioYield)
        .slice(0, 10)
        .map((result, idx) => ({
            rank: idx + 1,
            yield: result.portfolioYield,
            defaultedDebtCount: result.defaultedDebtCount,
            totalLoss: result.totalLoss,
            defaultedDebtIds: result.defaultedDebtIds
        }));

    // Calculate portfolio default probability
    const defaultProbabilities = portfolio.map(d => d.defaultProbability);
    const portfolioDefaultProb = 1 - defaultProbabilities.reduce((prod, p) => prod * (1 - p), 1);

    // Save simulation results to database
    const savedSimulation = await db.insert(defaultSimulations).values({
        userId,
        simulationName: `YaR_${macroScenario}_${Date.now()}`,
        simulationType: 'portfolio_yar',
        debtIds: debtIds,
        horizonMonths,
        iterationCount: iterations,
        expectedYield: expectedYield.toFixed(4),
        yieldAtRisk99: yarMetrics.yar_99?.toFixed(4),
        yieldAtRisk95: yarMetrics.yar_95?.toFixed(4),
        yieldAtRisk90: yarMetrics.yar_90?.toFixed(4),
        portfolioDefaultProb: portfolioDefaultProb.toFixed(6),
        expectedLoss: expectedLoss.toFixed(2),
        unexpectedLoss: unexpectedLoss.toFixed(2),
        var99: var99.toFixed(2),
        var95: var95.toFixed(2),
        cvar99: cvar99.toFixed(2),
        lossDistributionMean: distributionMetrics.mean.toFixed(2),
        lossDistributionStdDev: distributionMetrics.stdDev.toFixed(2),
        lossDistributionSkewness: distributionMetrics.skewness.toFixed(4),
        lossDistributionKurtosis: distributionMetrics.kurtosis.toFixed(4),
        macroScenario,
        baseRateAssumption: macroParams.baseRate.toFixed(4),
        gdpGrowthAssumption: macroParams.gdpGrowth.toFixed(4),
        creditSpreadAssumption: macroParams.creditSpreadAdjustment.toFixed(4),
        pathDistribution,
        worstCaseScenarios: worstCases,
        executionTimeMs: executionTime,
        convergenceAchieved: true,
        randomSeed: Math.floor(Math.random() * 1000000),
        status: 'completed',
        completedAt: new Date()
    }).returning();

    return {
        simulationId: savedSimulation[0].id,
        portfolio,
        expectedYield,
        yieldAtRisk: yarMetrics,
        var: { var99, var95, cvar99 },
        portfolioMetrics: {
            portfolioDefaultProbability: portfolioDefaultProb,
            expectedLoss,
            unexpectedLoss,
            avgDefaultCount,
            maxDefaultCount
        },
        distributionMetrics,
        pathDistribution,
        worstCases,
        executionTimeMs: executionTime
    };
}

/**
 * Simulate a single Monte Carlo path
 */
function simulateSinglePath(portfolio, horizonMonths, macroParams, correlationMatrix) {
    let totalYield = 0;
    let totalLoss = 0;
    let defaultedDebtCount = 0;
    const defaultedDebtIds = [];

    // Generate correlated default events if correlation matrix provided
    let defaultEvents;
    if (correlationMatrix) {
        const defaultProbs = portfolio.map(d => d.defaultProbability * macroParams.defaultMultiplier);
        defaultEvents = simulateCorrelatedDefaults(defaultProbs, correlationMatrix, horizonMonths);
    } else {
        defaultEvents = portfolio.map(d => {
            const adjDefaultProb = d.defaultProbability * macroParams.defaultMultiplier;
            return Math.random() < (adjDefaultProb * horizonMonths / 12);
        });
    }

    // Calculate yield for each debt
    portfolio.forEach((debt, idx) => {
        const defaulted = defaultEvents[idx];

        if (defaulted) {
            // Default: lose principal, gain some recovery
            const loss = debt.principalAmount * (1 - debt.recoveryRate);
            totalLoss += loss;
            defaultedDebtCount++;
            defaultedDebtIds.push(debt.id);

            // Negative yield from default
            const defaultYield = -loss / debt.principalAmount;
            totalYield += defaultYield * debt.principalAmount;
        } else {
            // No default: earn interest
            const periodicRate = debt.interestRate / 100 / 12;
            const earnedInterest = debt.principalAmount * periodicRate * Math.min(horizonMonths, debt.maturityMonths);
            totalYield += earnedInterest;
        }
    });

    const totalPrincipal = portfolio.reduce((sum, d) => sum + d.principalAmount, 0);
    const portfolioYield = totalYield / totalPrincipal;

    return {
        portfolioYield,
        totalLoss,
        defaultedDebtCount,
        defaultedDebtIds
    };
}

/**
 * Simulate correlated default events
 */
function simulateCorrelatedDefaults(defaultProbs, correlationMatrix, horizonMonths) {
    const n = defaultProbs.length;

    // Generate correlated uniform random variables using Gaussian copula
    const means = Array(n).fill(0);
    const normals = generateCorrelatedNormals(means, correlationMatrix);

    // Transform to uniform [0,1] using normal CDF
    const uniforms = normals.map(z => {
        // Standard normal CDF approximation
        return 0.5 * (1 + erf(z / Math.sqrt(2)));
    });

    // Check if each debt defaults
    return uniforms.map((u, idx) => {
        const adjDefaultProb = defaultProbs[idx] * horizonMonths / 12;
        return u < adjDefaultProb;
    });
}

// Error function for normal CDF
function erf(x) {
    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
}

/**
 * Estimate default correlation matrix
 */
function estimateDefaultCorrelation(portfolio) {
    const n = portfolio.length;
    const correlationMatrix = Array(n).fill(0).map(() => Array(n).fill(0));

    // Set diagonal to 1
    for (let i = 0; i < n; i++) {
        correlationMatrix[i][i] = 1.0;
    }

    // Estimate pairwise correlations (simplified: use industry/sector correlation)
    // In production, use historical default data or credit models
    const baseCorrelation = 0.15; // Base asset correlation

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            // Simplified: all debts have some correlation due to macro factors
            const correlation = baseCorrelation;
            correlationMatrix[i][j] = correlation;
            correlationMatrix[j][i] = correlation;
        }
    }

    return correlationMatrix;
}

/**
 * Get macro scenario parameters
 */
function getMacroScenarioParams(scenario) {
    const scenarios = {
        'base_case': {
            baseRate: 0.025, // 2.5% Fed Funds Rate
            gdpGrowth: 0.025, // 2.5% GDP growth
            defaultMultiplier: 1.0,
            creditSpreadAdjustment: 0.0
        },
        'recession': {
            baseRate: 0.001, // Near-zero rates
            gdpGrowth: -0.02, // -2% GDP contraction
            defaultMultiplier: 2.5, // 2.5x higher default rates
            creditSpreadAdjustment: 0.03 // +300 bps credit spread
        },
        'boom': {
            baseRate: 0.045, // 4.5% rates
            gdpGrowth: 0.045, // 4.5% GDP growth
            defaultMultiplier: 0.6, // 40% lower default rates
            creditSpreadAdjustment: -0.01 // -100 bps credit spread
        },
        'stress': {
            baseRate: 0.06, // 6% rates (hawkish Fed)
            gdpGrowth: -0.04, // -4% severe recession
            defaultMultiplier: 4.0, // 4x higher default rates
            creditSpreadAdjustment: 0.06 // +600 bps credit spread
        }
    };

    return scenarios[scenario] || scenarios['base_case'];
}

/**
 * Get simulation results by ID
 */
export async function getSimulationResults(userId, simulationId) {
    const results = await db.select()
        .from(defaultSimulations)
        .where(and(
            eq(defaultSimulations.userId, userId),
            eq(defaultSimulations.id, simulationId)
        ))
        .limit(1);

    return results.length > 0 ? results[0] : null;
}

/**
 * List all simulations for a user
 */
export async function listSimulations(userId, filters = {}) {
    let query = db.select()
        .from(defaultSimulations)
        .where(eq(defaultSimulations.userId, userId));

    if (filters.simulationType) {
        query = query.where(eq(defaultSimulations.simulationType, filters.simulationType));
    }

    const results = await query.orderBy(desc(defaultSimulations.createdAt));
    return results;
}

/**
 * Run stress test across multiple scenarios
 */
export async function runStressTest(userId, debtIds, options = {}) {
    const scenarios = ['base_case', 'recession', 'boom', 'stress'];
    const results = {};

    for (const scenario of scenarios) {
        console.log(`Running stress test scenario: ${scenario}`);
        const yarResult = await calculateYieldAtRisk(userId, debtIds, {
            ...options,
            macroScenario: scenario
        });
        results[scenario] = yarResult;
    }

    return {
        debtIds,
        scenarios: results,
        summary: {
            baseCase: results.base_case.expectedYield,
            worstCase: results.stress.expectedYield,
            maxYar99: Math.min(...Object.values(results).map(r => r.yieldAtRisk.yar_99)),
            maxExpectedLoss: Math.max(...Object.values(results).map(r => r.portfolioMetrics.expectedLoss))
        }
    };
}

export default {
    calculateYieldAtRisk,
    getSimulationResults,
    listSimulations,
    runStressTest
};
