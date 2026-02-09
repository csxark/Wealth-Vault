import { eq, and, desc, sql } from 'drizzle-orm';
import * as tf from '@tensorflow/tfjs-node';
import db from '../config/db.js';
import { portfolios, investments, investmentTransactions } from '../db/schema.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from './auditService.js';
import investmentService from './investmentService.js';
import priceService from './priceService.js';

/**
 * Portfolio Service
 * Handles portfolio management operations
 */

/**
 * Create a new portfolio
 * @param {Object} portfolioData - Portfolio data
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Created portfolio
 */
export const createPortfolio = async (portfolioData, userId) => {
  try {
    const [portfolio] = await db
      .insert(portfolios)
      .values({
        ...portfolioData,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.CREATE,
      resourceType: ResourceTypes.PORTFOLIO,
      resourceId: portfolio.id,
      metadata: {
        name: portfolio.name,
        currency: portfolio.currency,
        riskTolerance: portfolio.riskTolerance,
      },
      status: 'success',
    });

    return portfolio;
  } catch (error) {
    console.error('Error creating portfolio:', error);
    throw error;
  }
};

/**
 * Get all portfolios for a user
 * @param {string} userId - User ID
 * @param {boolean} includeInactive - Include inactive portfolios
 * @returns {Promise<Array>} - Array of portfolios
 */
export const getPortfolios = async (userId, includeInactive = false) => {
  try {
    let query = db
      .select()
      .from(portfolios)
      .where(eq(portfolios.userId, userId));

    if (!includeInactive) {
      query = query.where(eq(portfolios.isActive, true));
    }

    const result = await query.orderBy(desc(portfolios.createdAt));
    return result;
  } catch (error) {
    console.error('Error fetching portfolios:', error);
    throw error;
  }
};

/**
 * Get portfolio by ID
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID for security
 * @returns {Promise<Object|null>} - Portfolio object or null
 */
export const getPortfolioById = async (portfolioId, userId) => {
  try {
    const [portfolio] = await db
      .select()
      .from(portfolios)
      .where(
        and(
          eq(portfolios.id, portfolioId),
          eq(portfolios.userId, userId)
        )
      );

    return portfolio || null;
  } catch (error) {
    console.error('Error fetching portfolio by ID:', error);
    throw error;
  }
};

/**
 * Update a portfolio
 * @param {string} portfolioId - Portfolio ID
 * @param {Object} updateData - Data to update
 * @param {string} userId - User ID for security
 * @returns {Promise<Object>} - Updated portfolio
 */
export const updatePortfolio = async (portfolioId, updateData, userId) => {
  try {
    const [portfolio] = await db
      .update(portfolios)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(portfolios.id, portfolioId),
          eq(portfolios.userId, userId)
        )
      )
      .returning();

    if (!portfolio) {
      throw new Error('Portfolio not found or access denied');
    }

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.UPDATE,
      resourceType: ResourceTypes.PORTFOLIO,
      resourceId: portfolio.id,
      metadata: {
        name: portfolio.name,
        updatedFields: Object.keys(updateData),
      },
      status: 'success',
    });

    return portfolio;
  } catch (error) {
    console.error('Error updating portfolio:', error);
    throw error;
  }
};

/**
 * Delete a portfolio
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID for security
 * @returns {Promise<boolean>} - Success status
 */
export const deletePortfolio = async (portfolioId, userId) => {
  try {
    // Check if portfolio has investments
    const investmentsCount = await db
      .select({ count: sql`count(*)` })
      .from(investments)
      .where(
        and(
          eq(investments.portfolioId, portfolioId),
          eq(investments.userId, userId)
        )
      );

    if (investmentsCount[0].count > 0) {
      throw new Error('Cannot delete portfolio with existing investments');
    }

    const result = await db
      .delete(portfolios)
      .where(
        and(
          eq(portfolios.id, portfolioId),
          eq(portfolios.userId, userId)
        )
      );

    if (result.rowCount === 0) {
      throw new Error('Portfolio not found or access denied');
    }

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.DELETE,
      resourceType: ResourceTypes.PORTFOLIO,
      resourceId: portfolioId,
      metadata: {
        portfolioId,
      },
      status: 'success',
    });

    return true;
  } catch (error) {
    console.error('Error deleting portfolio:', error);
    throw error;
  }
};

/**
 * Get portfolio summary with investments
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID for security
 * @returns {Promise<Object>} - Portfolio with investments summary
 */
export const getPortfolioSummary = async (portfolioId, userId) => {
  try {
    const portfolio = await getPortfolioById(portfolioId, userId);
    if (!portfolio) {
      throw new Error('Portfolio not found or access denied');
    }

    // Get all investments in the portfolio
    const portfolioInvestments = await db
      .select()
      .from(investments)
      .where(
        and(
          eq(investments.portfolioId, portfolioId),
          eq(investments.userId, userId),
          eq(investments.isActive, true)
        )
      );

    // Calculate portfolio totals
    let totalValue = 0;
    let totalCost = 0;
    let totalGainLoss = 0;

    const investmentsWithMetrics = portfolioInvestments.map(investment => {
      const marketValue = parseFloat(investment.marketValue || '0');
      const totalCost = parseFloat(investment.totalCost || '0');
      const gainLoss = marketValue - totalCost;

      totalValue += marketValue;
      totalCost += totalCost;
      totalGainLoss += gainLoss;

      return {
        ...investment,
        marketValue,
        totalCost,
        gainLoss,
        gainLossPercent: totalCost > 0 ? (gainLoss / totalCost) * 100 : 0,
      };
    });

    const totalGainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

    // Update portfolio totals
    await db
      .update(portfolios)
      .set({
        totalValue: totalValue.toString(),
        totalCost: totalCost.toString(),
        totalGainLoss: totalGainLoss.toString(),
        totalGainLossPercent: totalGainLossPercent.toString(),
        updatedAt: new Date(),
      })
      .where(eq(portfolios.id, portfolioId));

    return {
      ...portfolio,
      totalValue,
      totalCost,
      totalGainLoss,
      totalGainLossPercent,
      investments: investmentsWithMetrics,
      investmentCount: investmentsWithMetrics.length,
    };
  } catch (error) {
    console.error('Error getting portfolio summary:', error);
    throw error;
  }
};

/**
 * Get all portfolio summaries for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of portfolio summaries
 */
export const getPortfolioSummaries = async (userId) => {
  try {
    const userPortfolios = await getPortfolios(userId);

    const summaries = await Promise.all(
      userPortfolios.map(portfolio => getPortfolioSummary(portfolio.id, userId))
    );

    return summaries;
  } catch (error) {
    console.error('Error getting portfolio summaries:', error);
    throw error;
  }
};

/**
 * Calculate portfolio allocation by asset class
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Allocation breakdown
 */
export const getPortfolioAllocation = async (portfolioId, userId) => {
  try {
    const summary = await getPortfolioSummary(portfolioId, userId);

    const allocation = {
      byAssetClass: {},
      bySector: {},
      byType: {},
      totalValue: summary.totalValue,
    };

    summary.investments.forEach(investment => {
      const value = parseFloat(investment.marketValue || '0');

      // By asset class
      const assetClass = investment.assetClass || 'other';
      allocation.byAssetClass[assetClass] = (allocation.byAssetClass[assetClass] || 0) + value;

      // By sector
      const sector = investment.sector || 'other';
      allocation.bySector[sector] = (allocation.bySector[sector] || 0) + value;

      // By type
      const type = investment.type;
      allocation.byType[type] = (allocation.byType[type] || 0) + value;
    });

    // Convert to percentages
    Object.keys(allocation.byAssetClass).forEach(key => {
      allocation.byAssetClass[key] = {
        value: allocation.byAssetClass[key],
        percentage: summary.totalValue > 0 ? (allocation.byAssetClass[key] / summary.totalValue) * 100 : 0,
      };
    });

    Object.keys(allocation.bySector).forEach(key => {
      allocation.bySector[key] = {
        value: allocation.bySector[key],
        percentage: summary.totalValue > 0 ? (allocation.bySector[key] / summary.totalValue) * 100 : 0,
      };
    });

    Object.keys(allocation.byType).forEach(key => {
      allocation.byType[key] = {
        value: allocation.byType[key],
        percentage: summary.totalValue > 0 ? (allocation.byType[key] / summary.totalValue) * 100 : 0,
      };
    });

    return allocation;
  } catch (error) {
    console.error('Error calculating portfolio allocation:', error);
    throw error;
  }
};

/**
 * Get portfolio performance over time
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID
 * @param {string} period - Time period (1M, 3M, 6M, 1Y, etc.)
 * @returns {Promise<Array>} - Performance data points
 */
export const getPortfolioPerformance = async (portfolioId, userId, period = '1Y') => {
  try {
    // This would typically aggregate data from price history
    // For now, return a placeholder structure
    const summary = await getPortfolioSummary(portfolioId, userId);

    // Placeholder - in a real implementation, this would query price history
    // and calculate performance metrics over time
    return {
      portfolioId,
      period,
      currentValue: summary.totalValue,
      totalReturn: summary.totalGainLoss,
      totalReturnPercent: summary.totalGainLossPercent,
      // Additional metrics would be calculated from historical data
      data: [], // Time series data would go here
    };
  } catch (error) {
    console.error('Error getting portfolio performance:', error);
    throw error;
  }
};

/**
 * Optimize portfolio using Modern Portfolio Theory
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID
 * @param {Object} optimizationParams - Optimization parameters
 * @param {string} optimizationParams.riskTolerance - 'conservative', 'moderate', 'aggressive'
 * @param {number} optimizationParams.targetReturn - Target annual return (optional)
 * @param {Object} optimizationParams.constraints - Allocation constraints
 * @returns {Promise<Object>} - Optimization results
 */
export const optimizePortfolio = async (portfolioId, userId, optimizationParams = {}) => {
  try {
    const summary = await getPortfolioSummary(portfolioId, userId);
    if (!summary || summary.investments.length < 2) {
      throw new Error('Portfolio must have at least 2 investments for optimization');
    }

    // Get historical returns and volatilities for each investment
    const investmentMetrics = await Promise.all(
      summary.investments.map(async (investment) => {
        const metrics = await investmentService.calculateInvestmentMetrics(investment.id, userId);
        return {
          ...investment,
          ...metrics,
        };
      })
    );

    // Calculate correlation matrix
    const correlationMatrix = await calculateCorrelationMatrix(investmentMetrics, userId);

    // Set up optimization parameters
    const riskTolerance = optimizationParams.riskTolerance || summary.riskTolerance || 'moderate';
    const targetReturn = optimizationParams.targetReturn;
    const constraints = optimizationParams.constraints || {};

    // Run portfolio optimization
    const optimizationResult = await runPortfolioOptimization(
      investmentMetrics,
      correlationMatrix,
      riskTolerance,
      targetReturn,
      constraints
    );

    // Generate rebalancing recommendations
    const recommendations = generateRebalancingRecommendations(
      summary,
      optimizationResult.optimalWeights
    );

    return {
      portfolioId,
      currentAllocation: summary.investments.map(inv => ({
        symbol: inv.symbol,
        name: inv.name,
        currentWeight: summary.totalValue > 0 ? (inv.marketValue / summary.totalValue) * 100 : 0,
        optimalWeight: optimizationResult.optimalWeights[inv.id] * 100,
      })),
      optimalPortfolio: {
        expectedReturn: optimizationResult.expectedReturn,
        expectedVolatility: optimizationResult.expectedVolatility,
        sharpeRatio: optimizationResult.sharpeRatio,
      },
      recommendations,
      diversificationAnalysis: analyzeDiversification(optimizationResult.optimalWeights, investmentMetrics),
    };
  } catch (error) {
    console.error('Error optimizing portfolio:', error);
    throw error;
  }
};

/**
 * Calculate correlation matrix for investments
 * @param {Array} investments - Investment data
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Correlation matrix
 */
const calculateCorrelationMatrix = async (investments, userId) => {
  const n = investments.length;
  const correlationMatrix = Array(n).fill().map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    correlationMatrix[i][i] = 1; // Perfect correlation with itself

    for (let j = i + 1; j < n; j++) {
      const correlation = await calculateCorrelation(
        investments[i].id,
        investments[j].id,
        userId
      );
      correlationMatrix[i][j] = correlation;
      correlationMatrix[j][i] = correlation;
    }
  }

  return correlationMatrix;
};

/**
 * Calculate correlation between two investments
 * @param {string} investmentId1 - First investment ID
 * @param {string} investmentId2 - Second investment ID
 * @param {string} userId - User ID
 * @returns {Promise<number>} - Correlation coefficient
 */
const calculateCorrelation = async (investmentId1, investmentId2, userId) => {
  try {
    // Get price history for both investments
    const [history1, history2] = await Promise.all([
      priceService.getPriceHistory(investmentId1, 365), // 1 year
      priceService.getPriceHistory(investmentId2, 365),
    ]);

    if (history1.length < 30 || history2.length < 30) {
      return 0.5; // Default moderate correlation if insufficient data
    }

    // Calculate daily returns
    const returns1 = calculateReturns(history1);
    const returns2 = calculateReturns(history2);

    // Calculate correlation
    const correlation = calculatePearsonCorrelation(returns1, returns2);
    return correlation;
  } catch (error) {
    console.warn(`Error calculating correlation between ${investmentId1} and ${investmentId2}:`, error);
    return 0.5; // Default moderate correlation
  }
};

/**
 * Calculate daily returns from price history
 * @param {Array} priceHistory - Price history data
 * @returns {Array} - Daily returns
 */
const calculateReturns = (priceHistory) => {
  const returns = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const prevPrice = parseFloat(priceHistory[i - 1].close);
    const currPrice = parseFloat(priceHistory[i].close);
    const dailyReturn = (currPrice - prevPrice) / prevPrice;
    returns.push(dailyReturn);
  }
  return returns;
};

/**
 * Calculate Pearson correlation coefficient
 * @param {Array} x - First dataset
 * @param {Array} y - Second dataset
 * @returns {number} - Correlation coefficient
 */
const calculatePearsonCorrelation = (x, y) => {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
};

/**
 * Run portfolio optimization using MPT
 * @param {Array} investments - Investment data
 * @param {Array} correlationMatrix - Correlation matrix
 * @param {string} riskTolerance - Risk tolerance level
 * @param {number} targetReturn - Target return (optional)
 * @param {Object} constraints - Allocation constraints
 * @returns {Promise<Object>} - Optimization results
 */
const runPortfolioOptimization = async (investments, correlationMatrix, riskTolerance, targetReturn, constraints) => {
  const n = investments.length;

  // Extract expected returns and volatilities
  const expectedReturns = investments.map(inv => inv.expectedReturn || 0.08); // Default 8% annual return
  const volatilities = investments.map(inv => inv.volatility || 0.15); // Default 15% volatility

  // Set up risk aversion based on tolerance
  const riskAversion = {
    conservative: 4,
    moderate: 2,
    aggressive: 1,
  }[riskTolerance] || 2;

  // Use TensorFlow.js for optimization
  const weights = tf.variable(tf.ones([n]).div(tf.scalar(n))); // Equal weights as starting point

  // Define objective function (minimize: risk - riskAversion * return)
  const objective = () => {
    const portfolioReturn = tf.sum(weights.mul(tf.tensor1d(expectedReturns)));
    const portfolioVariance = tf.sum(
      weights.mul(
        tf.matMul(
          tf.tensor2d(correlationMatrix).mul(
            tf.outerProduct(volatilities, volatilities)
          ),
          weights
        )
      )
    );
    const portfolioVolatility = tf.sqrt(portfolioVariance);

    // Maximize Sharpe ratio (return / volatility)
    return tf.neg(portfolioReturn.div(portfolioVolatility));
  };

  // Constraints: weights sum to 1, no negative weights
  const constraintsFn = () => {
    const sumConstraint = tf.sum(weights).sub(tf.scalar(1));
    const nonNegativeConstraint = tf.minimum(weights, tf.scalar(0)).neg();
    return tf.stack([sumConstraint, ...nonNegativeConstraint.arraySync()]);
  };

  // Simple gradient descent optimization
  const optimizer = tf.train.adam(0.01);

  for (let i = 0; i < 1000; i++) {
    optimizer.minimize(objective, false, [weights]);
  }

  const optimalWeights = await weights.array();
  const normalizedWeights = normalizeWeights(optimalWeights);

  // Calculate portfolio metrics
  const portfolioReturn = normalizedWeights.reduce((sum, w, i) => sum + w * expectedReturns[i], 0);
  const portfolioVariance = normalizedWeights.reduce((sum, w, i) =>
    sum + w * normalizedWeights.reduce((innerSum, w2, j) =>
      innerSum + w2 * correlationMatrix[i][j] * volatilities[i] * volatilities[j], 0
    ), 0
  );
  const portfolioVolatility = Math.sqrt(portfolioVariance);
  const sharpeRatio = portfolioReturn / portfolioVolatility;

  // Clean up tensors
  weights.dispose();

  return {
    optimalWeights: normalizedWeights,
    expectedReturn: portfolioReturn,
    expectedVolatility: portfolioVolatility,
    sharpeRatio,
  };
};

/**
 * Normalize weights to sum to 1
 * @param {Array} weights - Raw weights
 * @returns {Array} - Normalized weights
 */
const normalizeWeights = (weights) => {
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(w => w / sum);
};

/**
 * Generate rebalancing recommendations
 * @param {Object} summary - Portfolio summary
 * @param {Array} optimalWeights - Optimal weights
 * @returns {Array} - Rebalancing recommendations
 */
const generateRebalancingRecommendations = (summary, optimalWeights) => {
  const recommendations = [];
  const totalValue = summary.totalValue;

  summary.investments.forEach((investment, index) => {
    const currentWeight = totalValue > 0 ? (investment.marketValue / totalValue) : 0;
    const optimalWeight = optimalWeights[index];
    const difference = optimalWeight - currentWeight;
    const amount = Math.abs(difference) * totalValue;

    if (Math.abs(difference) > 0.05) { // 5% threshold
      recommendations.push({
        symbol: investment.symbol,
        name: investment.name,
        action: difference > 0 ? 'buy' : 'sell',
        currentWeight: currentWeight * 100,
        optimalWeight: optimalWeight * 100,
        amount: amount,
        priority: Math.abs(difference) > 0.1 ? 'high' : 'medium',
      });
    }
  });

  return recommendations.sort((a, b) => Math.abs(b.optimalWeight - b.currentWeight) - Math.abs(a.optimalWeight - a.currentWeight));
};

/**
 * Analyze portfolio diversification
 * @param {Array} weights - Portfolio weights
 * @param {Array} investments - Investment data
 * @returns {Object} - Diversification analysis
 */
const analyzeDiversification = (weights, investments) => {
  const diversification = {
    byAssetClass: {},
    bySector: {},
    concentration: {},
  };

  // Calculate diversification by asset class and sector
  investments.forEach((investment, index) => {
    const weight = weights[index];

    const assetClass = investment.assetClass || 'other';
    diversification.byAssetClass[assetClass] = (diversification.byAssetClass[assetClass] || 0) + weight;

    const sector = investment.sector || 'other';
    diversification.bySector[sector] = (diversification.bySector[sector] || 0) + weight;
  });

  // Calculate concentration metrics
  const herfindahlIndex = weights.reduce((sum, w) => sum + w * w, 0);
  diversification.concentration = {
    herfindahlIndex,
    concentrationRatio: Math.max(...weights),
    diversificationScore: 1 - herfindahlIndex, // Higher score = better diversification
  };

  return diversification;
};

export default {
  createPortfolio,
  getPortfolios,
  getPortfolioById,
  updatePortfolio,
  deletePortfolio,
  getPortfolioSummary,
  getPortfolioSummaries,
  getPortfolioAllocation,
  getPortfolioPerformance,
  optimizePortfolio,
};
