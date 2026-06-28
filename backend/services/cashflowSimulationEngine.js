/**
 * Cashflow Monte Simulation Engine
 * Core engine for running probabilistic cashflow forecasting with 10,000+ simulations
 */

import {
    normalRandom,
    lognormalRandom,
    uniformRandom,
    bernoulliTrial,
    percentile,
    mean,
    stdDev,
    skewness,
    kurtosis,
    valueAtRisk,
    conditionalVaR,
    maxDrawdown,
    histogram,
    seededRandom
} from '../utils/mathSimulation.js';

/**
 * Run single cashflow simulation path
 * @param {object} params - Simulation parameters
 * @param {number} simulationNumber - Simulation index
 * @param {number} seed - Random seed for reproducibility
 * @returns {object} Simulation result with timeline and metrics
 */
export function runSingleSimulation(params, simulationNumber, seed = null) {
    const startTime = Date.now();
    
    // Use seeded random if provided for reproducibility
    const random = seed !== null ? seededRandom(seed + simulationNumber) : Math.random;
    
    const {
        initialCashBalance,
        minimumCashReserve,
        forecastHorizonDays,
        revenueParams,
        expenseParams,
        economicFactors
    } = params;
    
    // Initialize timeline
    const timeline = [];
    let currentBalance = initialCashBalance;
    let minBalance = initialCashBalance;
    let maxBalance = initialCashBalance;
    let dayOfMinBalance = 0;
    let daysToCashDepletion = null;
    let totalRevenue = 0;
    let totalExpenses = 0;
    let expenseShockCount = 0;
    let revenueDroughtDays = 0;
    
    // Calculate average daily revenue for drought detection
    const avgDailyRevenue = (revenueParams.meanMonthly || 0) / 30;
    
    // Run day-by-day simulation
    for (let day = 1; day <= forecastHorizonDays; day++) {
        // Generate daily revenue
        let dailyRevenue = 0;
        
        if (revenueParams.distribution === 'lognormal') {
            // Log-normal distribution (can't be negative, good for revenue)
            const logMean = Math.log(revenueParams.meanMonthly / 30);
            const logStdDev = revenueParams.stdDeviation / revenueParams.meanMonthly;
            dailyRevenue = Math.exp(normalRandom(logMean, logStdDev));
        } else if (revenueParams.distribution === 'uniform') {
            // Uniform distribution
            const min = (revenueParams.meanMonthly / 30) * 0.5;
            const max = (revenueParams.meanMonthly / 30) * 1.5;
            dailyRevenue = uniformRandom(min, max);
        } else {
            // Normal distribution (default)
            dailyRevenue = Math.max(0, normalRandom(
                revenueParams.meanMonthly / 30,
                revenueParams.stdDeviation / Math.sqrt(30)
            ));
        }
        
        // Apply growth rate (compound daily)
        const growthFactor = Math.pow(1 + (revenueParams.growthRate || 0), day / 365);
        dailyRevenue *= growthFactor;
        
        // Apply seasonality if defined
        if (revenueParams.seasonality && revenueParams.seasonality.length > 0) {
            const monthIndex = Math.floor((day / 365) * 12) % 12;
            const seasonalityFactor = revenueParams.seasonality[monthIndex] || 1.0;
            dailyRevenue *= seasonalityFactor;
        }
        
        // Apply economic factors (inflation, market volatility)
        if (economicFactors) {
            const inflationFactor = Math.pow(1 + (economicFactors.inflationRate || 0), day / 365);
            dailyRevenue *= inflationFactor;
            
            // Market volatility adds random noise
            if (economicFactors.marketVolatility) {
                const volatilityNoise = normalRandom(1, economicFactors.marketVolatility / Math.sqrt(365));
                dailyRevenue *= Math.max(0.5, volatilityNoise); // Cap downside at 50%
            }
        }
        
        // Detect revenue drought
        if (dailyRevenue < avgDailyRevenue * 0.7) {
            revenueDroughtDays++;
        }
        
        // Generate daily expenses
        let dailyExpenses = expenseParams.fixedCosts / 30;
        
        // Variable expenses (normally distributed)
        const variableExpenses = Math.max(0, normalRandom(
            expenseParams.variableCostsMean / 30,
            expenseParams.variableCostsStdDev / Math.sqrt(30)
        ));
        dailyExpenses += variableExpenses;
        
        // Expense shock events (e.g., emergency repairs, unexpected bills)
        if (bernoulliTrial(expenseParams.shockProbability / 30)) {
            const shockMultiplier = expenseParams.shockMagnitude || 1.5;
            const shockAmount = variableExpenses * shockMultiplier;
            dailyExpenses += shockAmount;
            expenseShockCount++;
        }
        
        // Apply inflation to expenses
        if (economicFactors && economicFactors.inflationRate) {
            const inflationFactor = Math.pow(1 + economicFactors.inflationRate, day / 365);
            dailyExpenses *= inflationFactor;
        }
        
        // Update balance
        const netCashFlow = dailyRevenue - dailyExpenses;
        currentBalance += netCashFlow;
        
        // Track min/max
        if (currentBalance < minBalance) {
            minBalance = currentBalance;
            dayOfMinBalance = day;
        }
        if (currentBalance > maxBalance) {
            maxBalance = currentBalance;
        }
        
        // Check for cash depletion
        if (currentBalance <= (minimumCashReserve || 0) && daysToCashDepletion === null) {
            daysToCashDepletion = day;
        }
        
        // Accumulate totals
        totalRevenue += dailyRevenue;
        totalExpenses += dailyExpenses;
        
        // Record timeline entry (sample every N days to reduce data size)
        if (day % 7 === 0 || day === 1 || day === forecastHorizonDays || currentBalance <= 0) {
            timeline.push({
                day,
                balance: Math.round(currentBalance * 100) / 100,
                revenue: Math.round(dailyRevenue * 100) / 100,
                expenses: Math.round(dailyExpenses * 100) / 100,
                netCashFlow: Math.round(netCashFlow * 100) / 100
            });
        }
        
        // Stop simulation if completely out of cash
        if (currentBalance < 0) {
            break;
        }
    }
    
    // Calculate volatility score (std dev of daily changes)
    const dailyChanges = [];
    for (let i = 1; i < timeline.length; i++) {
        dailyChanges.push(timeline[i].balance - timeline[i - 1].balance);
    }
    const volatilityScore = dailyChanges.length > 0 ? stdDev(dailyChanges) : 0;
    
    const executionTime = Date.now() - startTime;
    
    return {
        simulationNumber,
        cashflowTimeline: timeline,
        finalCashBalance: currentBalance,
        minCashBalance: minBalance,
        maxCashBalance: maxBalance,
        dayOfMinBalance,
        daysToCashDepletion,
        totalRevenue,
        totalExpenses,
        netCashFlow: totalRevenue - totalExpenses,
        volatilityScore,
        expenseShockCount,
        revenueDroughtDays,
        executionTimeMs: executionTime,
        seedValue: seed
    };
}

/**
 * Run full Monte Carlo simulation with N iterations
 * @param {object} scenario - Forecast scenario with parameters
 * @param {number} simulationCount - Number of simulations to run
 * @param {function} progressCallback - Optional callback for progress updates
 * @returns {object} Aggregated results with confidence intervals
 */
export async function runMonteCarloSimulation(scenario, simulationCount = 10000, progressCallback = null) {
    console.log(`🎲 Starting Monte Carlo simulation: ${simulationCount} runs for ${scenario.forecastHorizonDays} days`);
    
    const startTime = Date.now();
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const results = [];
    const batchSize = 100; // Process in batches for progress reporting
    
    // Extract parameters
    const params = {
        initialCashBalance: parseFloat(scenario.initialCashBalance || 0),
        minimumCashReserve: parseFloat(scenario.minimumCashReserve || 0),
        forecastHorizonDays: scenario.forecastHorizonDays || 365,
        revenueParams: scenario.revenueParams || {},
        expenseParams: scenario.expenseParams || {},
        economicFactors: scenario.economicFactors || {}
    };
    
    // Run simulations
    for (let i = 0; i < simulationCount; i++) {
        try {
            const seed = Date.now() + i; // Unique seed for each simulation
            const result = runSingleSimulation(params, i + 1, seed);
            results.push(result);
            
            // Progress callback every batch
            if (progressCallback && (i + 1) % batchSize === 0) {
                progressCallback({
                    completed: i + 1,
                    total: simulationCount,
                    percentage: ((i + 1) / simulationCount * 100).toFixed(1)
                });
            }
        } catch (error) {
            console.error(`Simulation ${i + 1} failed:`, error);
        }
    }
    
    const totalExecutionTime = Date.now() - startTime;
    console.log(`✅ Simulation complete: ${results.length} successful runs in ${totalExecutionTime}ms`);
    
    // Calculate aggregates
    const aggregates = calculateAggregates(results, scenario, batchId);
    
    return {
        batchId,
        results,
        aggregates,
        metadata: {
            totalSimulations: simulationCount,
            successfulSimulations: results.length,
            failedSimulations: simulationCount - results.length,
            totalExecutionTimeMs: totalExecutionTime,
            averageExecutionTimeMs: results.length > 0 ? totalExecutionTime / results.length : 0
        }
    };
}

/**
 * Calculate statistical aggregates from simulation results
 * @param {object[]} results - Array of simulation results
 * @param {object} scenario - Original scenario parameters
 * @param {string} batchId - Batch identifier
 * @returns {object} Aggregated statistics and confidence intervals
 */
export function calculateAggregates(results, scenario, batchId) {
    if (results.length === 0) {
        return null;
    }
    
    // Extract final balances and sort
    const finalBalances = results.map(r => r.finalCashBalance).sort((a, b) => a - b);
    
    // Extract days to depletion (null if never depleted)
    const depletionDays = results
        .map(r => r.daysToCashDepletion)
        .filter(d => d !== null)
        .sort((a, b) => a - b);
    
    // Calculate confidence intervals
    const p10FinalBalance = percentile(finalBalances, 0.10);
    const p50FinalBalance = percentile(finalBalances, 0.50);
    const p90FinalBalance = percentile(finalBalances, 0.90);
    
    const p10DaysToDepletion = depletionDays.length > 0 ? percentile(depletionDays, 0.10) : null;
    const p50DaysToDepletion = depletionDays.length > 0 ? percentile(depletionDays, 0.50) : null;
    const p90DaysToDepletion = depletionDays.length > 0 ? percentile(depletionDays, 0.90) : null;
    
    const depletionProbability = depletionDays.length / results.length;
    
    // Calculate summary statistics
    const meanFinalBalance = mean(finalBalances);
    const stdDevFinalBalance = stdDev(finalBalances);
    const skew = skewness(finalBalances);
    const kurt = kurtosis(finalBalances);
    
    // Calculate risk metrics
    const var95 = valueAtRisk(finalBalances, 0.95);
    const cvar95 = conditionalVaR(finalBalances, 0.95);
    
    // Calculate max drawdown across all simulations
    const allTimelines = results.map(r => r.cashflowTimeline);
    const drawdowns = allTimelines.map(timeline => {
        const balances = timeline.map(t => t.balance);
        return maxDrawdown(balances);
    });
    const maxDD = Math.max(...drawdowns.map(d => d.maxDrawdownAmount));
    
    // Generate daily percentiles for fan chart
    const dailyPercentiles = generateDailyPercentiles(results, scenario.forecastHorizonDays);
    
    // Generate distribution histograms
    const finalBalanceDistribution = histogram(finalBalances, 50);
    const volatilities = results.map(r => r.volatilityScore);
    const dailyVolatilityDistribution = histogram(volatilities, 30);
    
    return {
        batchId,
        userId: scenario.userId,
        scenarioId: scenario.id,
        
        // Confidence intervals
        p10FinalBalance,
        p50FinalBalance,
        p90FinalBalance,
        p10DaysToDepletion,
        p50DaysToDepletion,
        p90DaysToDepletion,
        depletionProbability,
        
        // Fan chart data
        dailyPercentiles,
        
        // Distributions
        finalBalanceDistribution,
        dailyVolatilityDistribution,
        
        // Summary statistics
        meanFinalBalance,
        stdDevFinalBalance,
        skewness: skew,
        kurtosis: kurt,
        
        // Risk metrics
        valueAtRisk95: var95,
        conditionalVaR95: cvar95,
        maxDrawdown: maxDD,
        
        // Counts
        totalSimulations: results.length,
        successfulSimulations: results.length,
        failedSimulations: 0
    };
}

/**
 * Generate daily percentile bands for fan chart visualization
 * @param {object[]} results - Simulation results
 * @param {number} forecastHorizonDays - Number of days
 * @returns {object[]} Daily percentile data
 */
function generateDailyPercentiles(results, forecastHorizonDays) {
    const dailyPercentiles = [];
    
    // Sample every 7 days to reduce data size
    for (let day = 7; day <= forecastHorizonDays; day += 7) {
        const dayBalances = [];
        
        // Extract balance at this day from each simulation
        results.forEach(result => {
            const timelineEntry = result.cashflowTimeline.find(t => t.day >= day);
            if (timelineEntry) {
                dayBalances.push(timelineEntry.balance);
            }
        });
        
        if (dayBalances.length === 0) continue;
        
        dayBalances.sort((a, b) => a - b);
        
        dailyPercentiles.push({
            day,
            p10: percentile(dayBalances, 0.10),
            p25: percentile(dayBalances, 0.25),
            p50: percentile(dayBalances, 0.50),
            p75: percentile(dayBalances, 0.75),
            p90: percentile(dayBalances, 0.90),
            mean: mean(dayBalances)
        });
    }
    
    return dailyPercentiles;
}

/**
 * Run "What-If" scenario comparison
 * Compare baseline vs modified parameters
 * @param {object} baselineScenario - Original scenario
 * @param {object} modifications - Parameter modifications
 * @param {number} simulationCount - Number of simulations
 * @returns {object} Comparison results
 */
export async function runWhatIfAnalysis(baselineScenario, modifications, simulationCount = 5000) {
    console.log('🔍 Running What-If analysis...');
    
    // Run baseline
    const baselineResults = await runMonteCarloSimulation(baselineScenario, simulationCount);
    
    // Create modified scenario
    const modifiedScenario = {
        ...baselineScenario,
        ...modifications
    };
    
    // Run modified scenario
    const modifiedResults = await runMonteCarloSimulation(modifiedScenario, simulationCount);
    
    // Calculate differences
    const comparison = {
        baseline: {
            p50FinalBalance: baselineResults.aggregates.p50FinalBalance,
            p50DaysToDepletion: baselineResults.aggregates.p50DaysToDepletion,
            depletionProbability: baselineResults.aggregates.depletionProbability
        },
        modified: {
            p50FinalBalance: modifiedResults.aggregates.p50FinalBalance,
            p50DaysToDepletion: modifiedResults.aggregates.p50DaysToDepletion,
            depletionProbability: modifiedResults.aggregates.depletionProbability
        },
        differences: {
            finalBalanceChange: modifiedResults.aggregates.p50FinalBalance - baselineResults.aggregates.p50FinalBalance,
            finalBalanceChangePercent: ((modifiedResults.aggregates.p50FinalBalance - baselineResults.aggregates.p50FinalBalance) / baselineResults.aggregates.p50FinalBalance * 100),
            runwayChange: (modifiedResults.aggregates.p50DaysToDepletion || 0) - (baselineResults.aggregates.p50DaysToDepletion || 0),
            depletionProbabilityChange: modifiedResults.aggregates.depletionProbability - baselineResults.aggregates.depletionProbability
        },
        modifications
    };
    
    return comparison;
}

/**
 * Calculate confidence interval width (uncertainty measure)
 * @param {object} aggregates - Aggregated results
 * @returns {number} Width of 80% confidence interval
 */
export function calculateUncertainty(aggregates) {
    return aggregates.p90FinalBalance - aggregates.p10FinalBalance;
}

/**
 * Assess financial health based on simulation results
 * @param {object} aggregates - Aggregated results
 * @returns {object} Health assessment
 */
export function assessFinancialHealth(aggregates) {
    const health = {
        score: 0,
        level: 'critical',
        warnings: [],
        strengths: []
    };
    
    // Check depletion probability
    if (aggregates.depletionProbability > 0.5) {
        health.warnings.push('High cash depletion risk (>50%)');
        health.score += 0;
    } else if (aggregates.depletionProbability > 0.2) {
        health.warnings.push('Moderate cash depletion risk (>20%)');
        health.score += 30;
    } else if (aggregates.depletionProbability > 0.05) {
        health.score += 60;
    } else {
        health.strengths.push('Low depletion risk (<5%)');
        health.score += 90;
    }
    
    // Check runway
    if (aggregates.p50DaysToDepletion && aggregates.p50DaysToDepletion < 90) {
        health.warnings.push(`Short runway (${aggregates.p50DaysToDepletion} days)`);
    } else if (!aggregates.p50DaysToDepletion || aggregates.p50DaysToDepletion > 180) {
        health.strengths.push('Healthy cash runway (>6 months)');
    }
    
    // Check final balance trend
    if (aggregates.p50FinalBalance < 0) {
        health.warnings.push('Negative median final balance');
    } else if (aggregates.p50FinalBalance > aggregates.meanFinalBalance * 1.2) {
        health.strengths.push('Strong positive cash trajectory');
    }
    
    // Check volatility
    const cv = aggregates.stdDevFinalBalance / Math.abs(aggregates.meanFinalBalance);
    if (cv > 1.0) {
        health.warnings.push('High cashflow volatility');
    } else if (cv < 0.3) {
        health.strengths.push('Stable cashflow projections');
    }
    
    // Determine level
    if (health.score >= 80) {
        health.level = 'excellent';
    } else if (health.score >= 60) {
        health.level = 'good';
    } else if (health.score >= 40) {
        health.level = 'fair';
    } else if (health.score >= 20) {
        health.level = 'poor';
    } else {
        health.level = 'critical';
    }
    
    return health;
}

export default {
    runSingleSimulation,
    runMonteCarloSimulation,
    calculateAggregates,
    runWhatIfAnalysis,
    calculateUncertainty,
    assessFinancialHealth
};
