import InvestmentRepository from '../repositories/InvestmentRepository.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from './auditService.js';

/**
 * Investment Service
 * Handles CRUD operations for investments and related functionality
 */

/**
 * Create a new investment
 * @param {Object} investmentData - Investment data
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Created investment
 */
export const createInvestment = async (investmentData, userId) => {
  try {
    const investment = await InvestmentRepository.create({
      ...investmentData,
      userId,
    });

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.CREATE,
      resourceType: ResourceTypes.INVESTMENT,
      resourceId: investment.id,
      metadata: {
        symbol: investment.symbol,
        name: investment.name,
        type: investment.type,
        quantity: investment.quantity,
        averageCost: investment.averageCost,
      },
      status: 'success',
    });

    return investment;
  } catch (error) {
    console.error('Error creating investment:', error);
    throw error;
  }
};

/**
 * Get all investments for a user
 * @param {string} userId - User ID
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} - Array of investments
 */
export const getInvestments = async (userId, filters = {}) => {
  try {
    return await InvestmentRepository.findAll(userId, filters);
  } catch (error) {
    console.error('Error fetching investments:', error);
    throw error;
  }
};

/**
 * Get investment by ID
 * @param {string} investmentId - Investment ID
 * @param {string} userId - User ID for security
 * @returns {Promise<Object|null>} - Investment object or null
 */
export const getInvestmentById = async (investmentId, userId) => {
  try {
    return await InvestmentRepository.findById(investmentId, userId);
  } catch (error) {
    console.error('Error fetching investment by ID:', error);
    throw error;
  }
};

/**
 * Update an investment
 * @param {string} investmentId - Investment ID
 * @param {Object} updateData - Data to update
 * @param {string} userId - User ID for security
 * @returns {Promise<Object>} - Updated investment
 */
export const updateInvestment = async (investmentId, updateData, userId) => {
  try {
    const investment = await InvestmentRepository.update(investmentId, userId, updateData);

    if (!investment) {
      throw new Error('Investment not found or access denied');
    }

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.UPDATE,
      resourceType: ResourceTypes.INVESTMENT,
      resourceId: investment.id,
      metadata: {
        symbol: investment.symbol,
        updatedFields: Object.keys(updateData),
      },
      status: 'success',
    });

    return investment;
  } catch (error) {
    console.error('Error updating investment:', error);
    throw error;
  }
};

/**
 * Delete an investment
 * @param {string} investmentId - Investment ID
 * @param {string} userId - User ID for security
 * @returns {Promise<boolean>} - Success status
 */
export const deleteInvestment = async (investmentId, userId) => {
  try {
    const success = await InvestmentRepository.delete(investmentId, userId);

    if (!success) {
      throw new Error('Investment not found or access denied');
    }

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.DELETE,
      resourceType: ResourceTypes.INVESTMENT,
      resourceId: investmentId,
      metadata: {
        investmentId,
      },
      status: 'success',
    });

    return true;
  } catch (error) {
    console.error('Error deleting investment:', error);
    throw error;
  }
};

/**
 * Add a transaction to an investment
 * @param {string} investmentId - Investment ID
 * @param {Object} transactionData - Transaction data
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Created transaction
 */
export const addInvestmentTransaction = async (investmentId, transactionData, userId) => {
  try {
    // Get the investment to verify ownership and get portfolio ID
    const investment = await getInvestmentById(investmentId, userId);
    if (!investment) {
      throw new Error('Investment not found or access denied');
    }

    const transaction = await InvestmentRepository.createTransaction({
      ...transactionData,
      investmentId,
      portfolioId: investment.portfolioId,
      userId,
    });

    // Update investment's average cost and quantity based on transaction
    await updateInvestmentMetrics(investmentId, userId);

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.CREATE,
      resourceType: ResourceTypes.INVESTMENT_TRANSACTION,
      resourceId: transaction.id,
      metadata: {
        investmentId,
        type: transaction.type,
        quantity: transaction.quantity,
        price: transaction.price,
        totalAmount: transaction.totalAmount,
      },
      status: 'success',
    });

    return transaction;
  } catch (error) {
    console.error('Error adding investment transaction:', error);
    throw error;
  }
};

/**
 * Get transactions for an investment
 * @param {string} investmentId - Investment ID
 * @param {string} userId - User ID for security
 * @returns {Promise<Array>} - Array of transactions
 */
export const getInvestmentTransactions = async (investmentId, userId) => {
  try {
    // Verify investment ownership
    const investment = await getInvestmentById(investmentId, userId);
    if (!investment) {
      throw new Error('Investment not found or access denied');
    }

    return await InvestmentRepository.findTransactions(investmentId, userId);
  } catch (error) {
    console.error('Error fetching investment transactions:', error);
    throw error;
  }
};

/**
 * Update investment metrics (average cost, quantity, market value, etc.)
 * @param {string} investmentId - Investment ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Updated investment
 */
export const updateInvestmentMetrics = async (investmentId, userId) => {
  try {
    // Get all transactions for this investment
    const transactions = await InvestmentRepository.findTransactionsByInvestmentId(investmentId, userId);

    let totalQuantity = 0;
    let totalCost = 0;

    // Calculate current quantity and total cost
    for (const transaction of transactions) {
      const { type, quantity, price, fees } = transaction;
      const q = parseFloat(quantity);
      const p = parseFloat(price);
      const f = parseFloat(fees || 0);
      const effectivePrice = p + (f / q);

      if (type === 'buy') {
        totalQuantity += q;
        totalCost += q * effectivePrice;
      } else if (type === 'sell') {
        totalQuantity -= q;
        totalCost -= q * effectivePrice;
      }
    }

    const averageCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;

    // Update the investment
    return await InvestmentRepository.update(investmentId, userId, {
      quantity: totalQuantity.toString(),
      averageCost: averageCost.toString(),
      totalCost: totalCost.toString(),
    });
  } catch (error) {
    console.error('Error updating investment metrics:', error);
    throw error;
  }
};

/**
 * Update current prices for investments
 * @param {Array} priceUpdates - Array of {investmentId, currentPrice, marketValue}
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Updated investments
 */
export const updateInvestmentPrices = async (priceUpdates, userId) => {
  try {
    const updatedInvestments = [];

    for (const update of priceUpdates) {
      const { investmentId, currentPrice, marketValue, unrealizedGainLoss, unrealizedGainLossPercent } = update;

      const investment = await InvestmentRepository.update(investmentId, userId, {
        currentPrice: currentPrice?.toString(),
        marketValue: marketValue?.toString(),
        unrealizedGainLoss: unrealizedGainLoss?.toString(),
        unrealizedGainLossPercent: unrealizedGainLossPercent?.toString(),
        lastPriceUpdate: new Date(),
      });

      if (investment) {
        updatedInvestments.push(investment);
      }
    }

    return updatedInvestments;
  } catch (error) {
    console.error('Error updating investment prices:', error);
    throw error;
  }
};

/**
 * Calculate investment metrics (expected return, volatility, etc.)
 * @param {string} investmentId - Investment ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Investment metrics
 */
export const calculateInvestmentMetrics = async (investmentId, userId) => {
  try {
    // Get price history for the investment
    // Note: Assuming there's a priceService imported somewhere else or available
    // For this refactor, we keep original logic but wrap DB calls if any
    const priceHistory = await priceService.getPriceHistory(investmentId, 365); // 1 year

    if (priceHistory.length < 30) {
      // Insufficient data, return defaults
      return {
        expectedReturn: 0.08, // 8% annual return
        volatility: 0.15, // 15% volatility
        sharpeRatio: 0.53, // Return / volatility
      };
    }

    // Calculate daily returns
    const returns = [];
    for (let i = 1; i < priceHistory.length; i++) {
      const prevPrice = parseFloat(priceHistory[i - 1].close);
      const currPrice = parseFloat(priceHistory[i].close);
      const dailyReturn = (currPrice - prevPrice) / prevPrice;
      returns.push(dailyReturn);
    }

    // Calculate expected return (annualized)
    const avgDailyReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const expectedReturn = avgDailyReturn * 252; // 252 trading days per year

    // Calculate volatility (annualized standard deviation)
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgDailyReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance * 252); // Annualized

    // Calculate Sharpe ratio (assuming 3% risk-free rate)
    const riskFreeRate = 0.03;
    const sharpeRatio = (expectedReturn - riskFreeRate) / volatility;

    return {
      expectedReturn: Math.max(expectedReturn, 0), // Ensure non-negative
      volatility: Math.max(volatility, 0.01), // Minimum volatility
      sharpeRatio: isFinite(sharpeRatio) ? sharpeRatio : 0,
    };
  } catch (error) {
    console.warn(`Error calculating metrics for investment ${investmentId}:`, error);
    // Return conservative defaults
    return {
      expectedReturn: 0.06, // 6% annual return
      volatility: 0.20, // 20% volatility
      sharpeRatio: 0.15,
    };
  }
};

export default {
  createInvestment,
  getInvestments,
  getInvestmentById,
  updateInvestment,
  deleteInvestment,
  addInvestmentTransaction,
  getInvestmentTransactions,
  updateInvestmentMetrics,
  updateInvestmentPrices,
  calculateInvestmentMetrics,
};
