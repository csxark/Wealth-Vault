/**
 * Multi-Scenario Retirement Planning Engine (ISSUE-737)
 * 
 * Monte Carlo simulation for retirement planning with:
 * - 10,000+ scenario simulations
 * - Variable market returns, inflation, longevity, healthcare costs
 * - Sequence of returns risk modeling
 * - Dynamic withdrawal strategies
 * - Probability of success analysis
 * - Failure mode identification
 * - Stress testing against recessions
 */

import db from '../config/db.js';
import { retirementSimulations, retirementScenarios } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import logger from '../utils/logger.js';

// Simulation constants
const DEFAULT_SIMULATIONS = 10000;
const MAX_SIMULATION_YEARS = 50;

// Historical market statistics (based on S&P 500)
const MARKET_STATS = {
  meanReturn: 0.10,        // 10% average annual return
  stdDeviation: 0.18,       // 18% standard deviation
  inflationMean: 0.03,      // 3% average inflation
  inflationStdDev: 0.015    // 1.5% inflation volatility
};

// Healthcare cost escalation (typically exceeds general inflation)
const HEALTHCARE_ESCALATION = 0.05; // 5% annual increase

// Life expectancy tables (simplified - based on SSA actuarial tables)
const LIFE_EXPECTANCY = {
  male: { 65: 84, 70: 85.5, 75: 87 },
  female: { 65: 86.5, 70: 88, 75: 89.5 }
};

/**
 * Generate random normal distribution value (Box-Muller transform)
 */
const randomNormal = (mean, stdDev) => {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
};

/**
 * Calculate life expectancy with percentile adjustments
 */
const calculateLifeExpectancy = (currentAge, gender, percentile = 50) => {
  const baseAge = Math.floor(currentAge / 5) * 5;
  const baseExpectancy = LIFE_EXPECTANCY[gender.toLowerCase()]?.[baseAge] || 
                         (currentAge + 20);
  
  // Adjust for percentile (25th = -3 years, 75th = +3 years, 90th = +5 years)
  const adjustment = percentile === 25 ? -3 : percentile === 75 ? 3 : percentile === 90 ? 5 : 0;
  return Math.max(currentAge + 5, baseExpectancy + adjustment);
};

/**
 * Generate correlated market returns with sequence risk
 */
const generateMarketReturns = (years, includeRecession = false) => {
  const returns = [];
  let inRecession = false;
  let recessionYearsRemaining = 0;
  
  for (let year = 0; year < years; year++) {
    let annualReturn;
    
    // Recession modeling: 10% chance per decade
    if (includeRecession && !inRecession && Math.random() < 0.01) {
      inRecession = true;
      recessionYearsRemaining = 2; // 2-year recession
    }
    
    if (inRecession) {
      // Recession: -20% to -40% returns
      annualReturn = randomNormal(-0.30, 0.10);
      recessionYearsRemaining--;
      if (recessionYearsRemaining <= 0) {
        inRecession = false;
      }
    } else {
      // Normal market conditions
      annualReturn = randomNormal(MARKET_STATS.meanReturn, MARKET_STATS.stdDeviation);
    }
    
    // Add some autocorrelation (markets tend to continue trends)
    if (year > 0 && Math.random() < 0.3) {
      const momentum = returns[year - 1] * 0.2;
      annualReturn += momentum;
    }
    
    returns.push(annualReturn);
  }
  
  return returns;
};

/**
 * Generate inflation sequence
 */
const generateInflationSequence = (years) => {
  const inflation = [];
  for (let year = 0; year < years; year++) {
    const rate = Math.max(0, randomNormal(MARKET_STATS.inflationMean, MARKET_STATS.inflationStdDev));
    inflation.push(rate);
  }
  return inflation;
};

/**
 * Calculate dynamic withdrawal based on strategy
 */
const calculateWithdrawal = (strategy, portfolio, initialWithdrawal, year, inflationRate) => {
  switch (strategy) {
    case 'fixed_real':
      // Adjust for inflation each year (traditional 4% rule)
      return initialWithdrawal * Math.pow(1 + inflationRate, year);
      
    case 'percentage':
      // Withdraw fixed percentage of remaining portfolio (e.g., 4%)
      return portfolio * 0.04;
      
    case 'floor_ceiling':
      // Variable withdrawal with floor (min) and ceiling (max)
      const baseWithdrawal = portfolio * 0.04;
      const floor = initialWithdrawal * 0.8; // 80% minimum
      const ceiling = initialWithdrawal * 1.5; // 150% maximum
      return Math.max(floor, Math.min(ceiling, baseWithdrawal));
      
    case 'dynamic':
      // Guardrails: adjust spending based on portfolio performance
      const targetRate = 0.04;
      const currentRate = initialWithdrawal / portfolio;
      if (currentRate > 0.05) {
        // Portfolio struggling, reduce spending
        return portfolio * 0.035;
      } else if (currentRate < 0.03) {
        // Portfolio doing well, can spend more
        return portfolio * 0.045;
      }
      return portfolio * targetRate;
      
    default:
      return initialWithdrawal;
  }
};

/**
 * Run single retirement scenario simulation
 */
const runSingleScenario = (params) => {
  const {
    initialPortfolio,
    annualExpenses,
    retirementAge,
    currentAge,
    gender,
    withdrawalStrategy,
    includeHealthcare,
    includeSocialSecurity,
    socialSecurityAmount,
    healthcareExpenses,
    includeRecession,
    lifespanPercentile
  } = params;
  
  const lifeExpectancy = calculateLifeExpectancy(currentAge, gender, lifespanPercentile);
  const yearsToSimulate = Math.min(lifeExpectancy - currentAge, MAX_SIMULATION_YEARS);
  
  const marketReturns = generateMarketReturns(yearsToSimulate, includeRecession);
  const inflationRates = generateInflationSequence(yearsToSimulate);
  
  let portfolio = initialPortfolio;
  const yearlyBalances = [];
  const yearlyWithdrawals = [];
  let successfulYears = 0;
  let depletionYear = null;
  let finalBalance = 0;
  
  for (let year = 0; year < yearsToSimulate; year++) {
    const age = currentAge + year;
    
    // Calculate investment returns
    const investmentReturn = portfolio * marketReturns[year];
    portfolio += investmentReturn;
    
    // Calculate withdrawal amount
    let withdrawal = calculateWithdrawal(
      withdrawalStrategy,
      portfolio,
      annualExpenses,
      year,
      inflationRates[year]
    );
    
    // Add healthcare expenses (escalating faster than inflation)
    if (includeHealthcare && age >= 65) {
      const healthcareCost = healthcareExpenses * Math.pow(1 + HEALTHCARE_ESCALATION, year);
      withdrawal += healthcareCost;
    }
    
    // Subtract Social Security income (if eligible)
    if (includeSocialSecurity && age >= 67) {
      withdrawal = Math.max(0, withdrawal - socialSecurityAmount);
    }
    
    // Apply withdrawal
    portfolio -= withdrawal;
    
    yearlyBalances.push(portfolio);
    yearlyWithdrawals.push(withdrawal);
    
    // Check if portfolio depleted
    if (portfolio <= 0) {
      if (depletionYear === null) {
        depletionYear = year;
      }
      portfolio = 0;
    } else {
      successfulYears = year + 1;
    }
  }
  
  finalBalance = portfolio;
  const success = portfolio > 0 && successfulYears >= (yearsToSimulate * 0.95); // Success if 95%+ years funded
  
  return {
    success,
    finalBalance,
    depletionYear,
    successfulYears,
    totalYears: yearsToSimulate,
    yearlyBalances,
    yearlyWithdrawals,
    averageReturn: marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length,
    worstYear: Math.min(...marketReturns),
    bestYear: Math.max(...marketReturns),
    sequenceOfReturnsRisk: marketReturns.slice(0, 10).reduce((a, b) => a + b, 0) / 10 // First 10 years critical
  };
};

/**
 * Run full Monte Carlo retirement simulation
 */
export const runMonteCarloSimulation = async (userId, tenantId, params) => {
  try {
    const {
      currentAge = 40,
      retirementAge = 65,
      currentSavings = 0,
      monthlyContribution = 0,
      yearsToRetirement = retirementAge - currentAge,
      annualExpenses = 50000,
      gender = 'male',
      withdrawalStrategy = 'fixed_real', // 'fixed_real', 'percentage', 'floor_ceiling', 'dynamic'
      numSimulations = DEFAULT_SIMULATIONS,
      includeHealthcare = true,
      healthcareExpenses = 10000,
      includeSocialSecurity = true,
      socialSecurityAmount = 20000,
      expectedReturn = 0.07,
      includeRecession = true,
      lifespanPercentile = 50 // 50th percentile = median lifespan
    } = params;
    
    logger.info(`[Retirement Monte Carlo] Starting simulation for user ${userId}`, {
      numSimulations,
      currentAge,
      retirementAge
    });
    
    // Calculate portfolio at retirement
    // (Simplified - assumes contributions grow at expected return)
    const futureValue = currentSavings * Math.pow(1 + expectedReturn, yearsToRetirement);
    const contributionsFV = monthlyContribution * 12 * 
      ((Math.pow(1 + expectedReturn, yearsToRetirement) - 1) / expectedReturn);
    const portfolioAtRetirement = futureValue + contributionsFV;
    
    // Run simulations
    const scenarios = [];
    const startTime = Date.now();
    
    for (let i = 0; i < numSimulations; i++) {
      const scenario = runSingleScenario({
        initialPortfolio: portfolioAtRetirement,
        annualExpenses,
        retirementAge,
        currentAge: retirementAge, // Start simulation at retirement
        gender,
        withdrawalStrategy,
        includeHealthcare,
        includeSocialSecurity,
        socialSecurityAmount,
        healthcareExpenses,
        includeRecession,
        lifespanPercentile
      });
      
      scenarios.push(scenario);
      
      // Log progress every 1000 simulations
      if ((i + 1) % 1000 === 0) {
        logger.debug(`[Retirement Monte Carlo] Progress: ${i + 1}/${numSimulations}`);
      }
    }
    
    const executionTime = Date.now() - startTime;
    
    // Analyze results
    const analysis = analyzeScenarios(scenarios, params);
    
    // Save simulation to database
    const simulation = await db.insert(retirementSimulations).values({
      userId,
      tenantId,
      simulationParams: params,
      numSimulations,
      successRate: analysis.successRate,
      medianFinalBalance: analysis.medianFinalBalance,
      confidenceIntervals: analysis.confidenceIntervals,
      failureModes: analysis.failureModes,
      recommendations: analysis.recommendations,
      executionTimeMs: executionTime,
      withdrawalStrategy,
      includeRecession
    }).returning();
    
    logger.info(`[Retirement Monte Carlo] Simulation complete`, {
      simulationId: simulation[0].id,
      successRate: analysis.successRate,
      executionTime: `${executionTime}ms`
    });
    
    return {
      simulationId: simulation[0].id,
      ...analysis,
      portfolioAtRetirement,
      executionTime
    };
  } catch (error) {
    logger.error('[Retirement Monte Carlo] Simulation failed:', error);
    throw error;
  }
};

/**
 * Analyze simulation scenarios and generate insights
 */
const analyzeScenarios = (scenarios, params) => {
  const successfulScenarios = scenarios.filter(s => s.success);
  const failedScenarios = scenarios.filter(s => !s.success);
  
  const successRate = (successfulScenarios.length / scenarios.length) * 100;
  
  // Final balance distribution
  const finalBalances = scenarios.map(s => s.finalBalance).sort((a, b) => a - b);
  const medianFinalBalance = finalBalances[Math.floor(finalBalances.length / 2)];
  
  // Confidence intervals (percentiles)
  const confidenceIntervals = {
    p10: finalBalances[Math.floor(finalBalances.length * 0.10)],
    p25: finalBalances[Math.floor(finalBalances.length * 0.25)],
    p50: medianFinalBalance,
    p75: finalBalances[Math.floor(finalBalances.length * 0.75)],
    p90: finalBalances[Math.floor(finalBalances.length * 0.90)]
  };
  
  // Worst-case scenarios
  const worstCases = scenarios
    .sort((a, b) => a.finalBalance - b.finalBalance)
    .slice(0, 10)
    .map(s => ({
      finalBalance: s.finalBalance,
      depletionYear: s.depletionYear,
      averageReturn: s.averageReturn,
      worstYear: s.worstYear,
      sequenceRisk: s.sequenceOfReturnsRisk
    }));
  
  // Depletion year distribution
  const depletionYears = failedScenarios
    .filter(s => s.depletionYear !== null)
    .map(s => s.depletionYear);
  const averageDepletionYear = depletionYears.length > 0
    ? depletionYears.reduce((a, b) => a + b, 0) / depletionYears.length
    : null;
  
  // Failure mode analysis
  const failureModes = {
    earlyDepletion: failedScenarios.filter(s => s.depletionYear && s.depletionYear < 10).length,
    midLifeDepletion: failedScenarios.filter(s => s.depletionYear && s.depletionYear >= 10 && s.depletionYear < 20).length,
    lateDepletion: failedScenarios.filter(s => s.depletionYear && s.depletionYear >= 20).length,
    sequenceOfReturnsRisk: scenarios.filter(s => s.sequenceOfReturnsRisk < -0.05).length,
    marketCrashImpact: scenarios.filter(s => s.worstYear < -0.30).length
  };
  
  // Generate recommendations
  const recommendations = generateRecommendations(successRate, failureModes, params, confidenceIntervals);
  
  // Survival curve (probability of funds lasting X years)
  const survivalCurve = [];
  for (let year = 1; year <= 40; year++) {
    const survivingScenarios = scenarios.filter(s => 
      s.depletionYear === null || s.depletionYear >= year
    ).length;
    survivalCurve.push({
      year,
      probability: (survivingScenarios / scenarios.length) * 100
    });
  }
  
  return {
    successRate,
    totalScenarios: scenarios.length,
    successfulScenarios: successfulScenarios.length,
    failedScenarios: failedScenarios.length,
    medianFinalBalance,
    confidenceIntervals,
    worstCases,
    averageDepletionYear,
    failureModes,
    recommendations,
    survivalCurve,
    distribution: {
      mean: finalBalances.reduce((a, b) => a + b, 0) / finalBalances.length,
      min: finalBalances[0],
      max: finalBalances[finalBalances.length - 1],
      stdDev: calculateStdDev(finalBalances)
    }
  };
};

/**
 * Calculate standard deviation
 */
const calculateStdDev = (values) => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(variance);
};

/**
 * Generate actionable recommendations based on simulation results
 */
const generateRecommendations = (successRate, failureModes, params, confidenceIntervals) => {
  const recommendations = [];
  
  if (successRate < 80) {
    recommendations.push({
      severity: 'critical',
      category: 'success_rate',
      title: 'Low Success Rate - Immediate Action Required',
      message: `Your retirement plan has only a ${successRate.toFixed(1)}% success rate. This is below the recommended 80-90% threshold.`,
      actions: [
        {
          action: 'increase_savings',
          description: 'Increase monthly contributions',
          impact: 'High',
          specificAmount: Math.ceil(params.monthlyContribution * 0.25) // 25% increase
        },
        {
          action: 'reduce_expenses',
          description: 'Reduce planned retirement expenses',
          impact: 'High',
          specificAmount: Math.ceil(params.annualExpenses * 0.15) // 15% reduction
        },
        {
          action: 'delay_retirement',
          description: 'Consider retiring 2-3 years later',
          impact: 'Very High',
          specificAmount: 2
        }
      ]
    });
  }
  
  if (successRate >= 80 && successRate < 90) {
    recommendations.push({
      severity: 'medium',
      category: 'success_rate',
      title: 'Moderate Success Rate',
      message: `Your plan has an ${successRate.toFixed(1)}% success rate. Consider minor adjustments for additional security.`,
      actions: [
        {
          action: 'increase_savings',
          description: 'Small increase in contributions',
          impact: 'Medium',
          specificAmount: Math.ceil(params.monthlyContribution * 0.10)
        },
        {
          action: 'emergency_buffer',
          description: 'Maintain 1-year expense buffer',
          impact: 'Medium'
        }
      ]
    });
  }
  
  if (failureModes.earlyDepletion > 50) {
    recommendations.push({
      severity: 'critical',
      category: 'early_depletion',
      title: 'High Risk of Early Portfolio Depletion',
      message: 'Many scenarios show portfolio depletion within first 10 years of retirement.',
      actions: [
        {
          action: 'sequence_risk_mitigation',
          description: 'Build cash buffer for first 5 years of expenses',
          impact: 'High',
          specificAmount: params.annualExpenses * 5
        },
        {
          action: 'bond_tent',
          description: 'Increase bond allocation approaching retirement',
          impact: 'High'
        }
      ]
    });
  }
  
  if (failureModes.sequenceOfReturnsRisk > 1000) {
    recommendations.push({
      severity: 'high',
      category: 'sequence_risk',
      title: 'Vulnerable to Sequence of Returns Risk',
      message: 'Poor early retirement returns significantly impact success rate.',
      actions: [
        {
          action: 'dynamic_spending',
          description: 'Use flexible withdrawal strategy',
          impact: 'High'
        },
        {
          action: 'glide_path',
          description: 'Implement bond glide path',
          impact: 'Medium'
        }
      ]
    });
  }
  
  if (confidenceIntervals.p10 < 0) {
    recommendations.push({
      severity: 'high',
      category: 'worst_case',
      title: 'Negative Outcomes in Worst 10% of Scenarios',
      message: 'In worst-case scenarios, portfolio depletes before life expectancy.',
      actions: [
        {
          action: 'safety_margin',
          description: 'Increase retirement savings by 20%',
          impact: 'Very High',
          specificAmount: Math.ceil(params.currentSavings * 0.20)
        },
        {
          action: 'part_time_work',
          description: 'Consider part-time work in early retirement years',
          impact: 'High'
        }
      ]
    });
  }
  
  if (successRate >= 95) {
    recommendations.push({
      severity: 'low',
      category: 'excellent',
      title: 'Excellent Retirement Plan',
      message: `Your plan has a ${successRate.toFixed(1)}% success rate. You may have flexibility to:`,
      actions: [
        {
          action: 'retire_earlier',
          description: 'Consider retiring 1-2 years earlier',
          impact: 'Positive'
        },
        {
          action: 'increase_lifestyle',
          description: 'Increase planned retirement expenses by 10-15%',
          impact: 'Positive',
          specificAmount: Math.ceil(params.annualExpenses * 0.12)
        },
        {
          action: 'legacy_planning',
          description: 'Focus on legacy and estate planning',
          impact: 'Positive'
        }
      ]
    });
  }
  
  return recommendations;
};

/**
 * Get simulation history for a user
 */
export const getSimulationHistory = async (userId, tenantId, limit = 10) => {
  try {
    const simulations = await db
      .select()
      .from(retirementSimulations)
      .where(
        and(
          eq(retirementSimulations.userId, userId),
          eq(retirementSimulations.tenantId, tenantId)
        )
      )
      .orderBy(desc(retirementSimulations.createdAt))
      .limit(limit);
    
    return simulations;
  } catch (error) {
    logger.error('[Retirement Monte Carlo] Failed to fetch history:', error);
    throw error;
  }
};

/**
 * Get specific simulation details
 */
export const getSimulationDetails = async (simulationId, userId, tenantId) => {
  try {
    const simulation = await db
      .select()
      .from(retirementSimulations)
      .where(
        and(
          eq(retirementSimulations.id, simulationId),
          eq(retirementSimulations.userId, userId),
          eq(retirementSimulations.tenantId, tenantId)
        )
      )
      .limit(1);
    
    return simulation[0] || null;
  } catch (error) {
    logger.error('[Retirement Monte Carlo] Failed to fetch simulation:', error);
    throw error;
  }
};

/**
 * Compare withdrawal strategies
 */
export const compareWithdrawalStrategies = async (userId, tenantId, baseParams) => {
  const strategies = ['fixed_real', 'percentage', 'floor_ceiling', 'dynamic'];
  const results = [];
  
  for (const strategy of strategies) {
    const params = { ...baseParams, withdrawalStrategy: strategy, numSimulations: 2000 };
    const result = await runMonteCarloSimulation(userId, tenantId, params);
    
    results.push({
      strategy,
      successRate: result.successRate,
      medianFinalBalance: result.medianFinalBalance,
      worstCase: result.confidenceIntervals.p10
    });
  }
  
  return {
    comparison: results,
    recommendation: results.reduce((best, current) => 
      current.successRate > best.successRate ? current : best
    )
  };
};

export default {
  runMonteCarloSimulation,
  getSimulationHistory,
  getSimulationDetails,
  compareWithdrawalStrategies
};
