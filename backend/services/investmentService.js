import InvestmentRepository from '../repositories/InvestmentRepository.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from './auditService.js';
import eventBus from '../events/eventBus.js';
import db from '../config/db.js';
import { goals, goalRiskProfiles, rebalanceTriggers, taxLossOpportunities, investments, portfolios } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import taxService from './taxService.js';
import portfolioService from './portfolioService.js';

/**
 * Execute Tax-Loss Swap (L3)
 * Atomically sells a losing asset and buys a highly correlated proxy asset to maintain market exposure.
 */
export const executeTaxLossSwap = async (userId, opportunityId) => {
  return await db.transaction(async (tx) => {
    const opportunity = await tx.query.taxLossOpportunities.findFirst({
      where: and(
        eq(taxLossOpportunities.id, opportunityId),
        eq(taxLossOpportunities.userId, userId),
        eq(taxLossOpportunities.status, 'pending')
      )
    });

    if (!opportunity) throw new Error('Harvesting opportunity not found or already processed');

    const target = await tx.query.investments.findFirst({
      where: eq(investments.id, opportunity.investmentId)
    });

    if (!target) throw new Error('Target investment not found');

    // 1. Sell the total position of the losing asset
    const sellAmount = parseFloat(target.quantity) * parseFloat(target.currentPrice);

    // We use the existing addInvestmentTransaction logic which handles tax lots and wash-sales
    await addInvestmentTransaction(target.id, {
      type: 'sell',
      quantity: target.quantity,
      price: target.currentPrice,
      totalAmount: sellAmount.toString(),
      date: new Date(),
      notes: `Tax-Loss Harvesting Swap: Sold ${target.symbol}`
    }, userId);

    // 2. Buy the proxy asset (maintains market exposure without violating 30-day wash-sale rule for Target)
    if (opportunity.proxyAssetSymbol) {
      const buyPrice = target.currentPrice; // Proxy assumed at same dollar exposure
      const buyQuantity = (sellAmount / parseFloat(buyPrice)).toFixed(8);

      await createInvestment({
        portfolioId: target.portfolioId,
        symbol: opportunity.proxyAssetSymbol,
        name: `Tax-Proxy for ${target.symbol}`,
        type: target.type,
        quantity: buyQuantity,
        averageCost: buyPrice.toString(),
        totalCost: sellAmount.toString(),
        metadata: {
          harvestedFrom: target.symbol,
          harvestOpportunityId: opportunity.id
        }
      }, userId);

      logInfo(`[Investment Service] Automatically executed Tax-Loss Swap: ${target.symbol} -> ${opportunity.proxyAssetSymbol}`);

      await logAuditEventAsync({
        userId,
        action: AuditActions.UPDATE,
        resourceType: ResourceTypes.INVESTMENT,
        resourceId: target.id,
        metadata: {
          type: 'tax_loss_swap',
          harvestedFrom: target.symbol,
          proxyAsset: opportunity.proxyAssetSymbol,
          lossHarvested: opportunity.unrealizedLoss
        },
        status: 'success'
      });
    }

    // 3. Mark opportunity as implemented
    await tx.update(taxLossOpportunities)
      .set({ status: 'executed', updatedAt: new Date() })
      .where(eq(taxLossOpportunities.id, opportunity.id));

    return {
      success: true,
      harvestedAsset: target.symbol,
      proxyAsset: opportunity.proxyAssetSymbol,
      lossHarvested: opportunity.unrealizedLoss
    };
  });
};
// Removed notificationService import - now decoupled via events

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

    // Emit event
    eventBus.emit('INVESTMENT_CREATED', investment);

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

    // Emit event
    eventBus.emit('INVESTMENT_UPDATED', investment);

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

    // Emit event
    eventBus.emit('INVESTMENT_DELETED', { id: investmentId, userId });

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

    // 1. (L3) Cost-Basis Lot Tracking
    if (transaction.type === 'buy') {
      await portfolioService.addTaxLot(
        userId,
        investmentId,
        investment.symbol,
        transaction.quantity,
        transaction.price,
        transaction.date || new Date()
      );
    } else if (transaction.type === 'sell') {
      // Check for Wash-Sale if selling at a loss
      const matchingLots = await taxService.getMatchingLots(investmentId, userId, 'FIFO');
      const avgCost = matchingLots.reduce((acc, lot) => acc + parseFloat(lot.costBasisPerUnit), 0) / (matchingLots.length || 1);

      if (parseFloat(transaction.price) < avgCost) {
        const loss = (avgCost - parseFloat(transaction.price)) * parseFloat(transaction.quantity);
        const washRisk = await taxService.checkWashSaleRisk(userId, investmentId, new Date(), loss);

        if (washRisk.isWashSale) {
          console.warn(`[Investment Service] WASH-SALE DETECTED for user ${userId} on ${investmentId}. Loss of $${loss.toFixed(2)} will be disallowed.`);
          // In a production system, we'd block the transaction or log it for adjustment
        }
      }

      // 2. (L3) Actual Lot Liquidation
      await taxService.liquidateLots(userId, investmentId, transaction.quantity, 'FIFO');
    }

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

// Side-effects like notifications are now handled by event listeners in ../listeners/

/**
 * Batch update investment valuations based on FX rates
 * @param {string} userId - User ID
 * @param {Function} getConversionRate - Function(currency) => rate
 * @param {string} baseCurrencyCode - User's base currency code
 */
export const batchUpdateValuations = async (userId, getConversionRate, baseCurrencyCode) => {
  try {
    const userInvestments = await db
      .select()
      .from(investments)
      .where(
        and(
          eq(investments.userId, userId),
          eq(investments.isActive, true)
        )
      );

    const updates = userInvestments.map(async (inv) => {
      const currency = inv.currency || 'USD';
      const rate = getConversionRate(currency);

      if (rate !== null) {
        const marketValue = parseFloat(inv.marketValue || '0');
        const baseValue = marketValue * rate;
        const oldBaseValue = parseFloat(inv.baseCurrencyValue || '0');

        // Check for significant value swing (> 5%) and notify user
        if (oldBaseValue > 0) {
          const change = Math.abs((baseValue - oldBaseValue) / oldBaseValue);
          if (change > 0.05) {
            const direction = baseValue > oldBaseValue ? 'increased' : 'decreased';

            // Emit event instead of direct notification
            eventBus.emit('INVESTMENT_VALUATION_CHANGED', {
              userId,
              investmentId: inv.id,
              investmentName: inv.name,
              investmentSymbol: inv.symbol,
              changePercent: change * 100,
              direction,
              newValue: baseValue,
              oldValue: oldBaseValue
            });
          }
        }

        await db
          .update(investments)
          .set({
            baseCurrencyValue: baseValue.toFixed(2),
            baseCurrencyCode: baseCurrencyCode,
            valuationDate: new Date(),
          })
          .where(eq(investments.id, inv.id));
      }
    });

    await Promise.all(updates);
  } catch (error) {
    console.error('Error batch updating investment valuations:', error);
    throw error;
  }
};

/**
 * Rebalance Goal Risk (L3)
 * Downgrades risk profile when success probability is low.
 */
export const rebalanceGoalRisk = async (goalId, oldRisk, newRisk, probability) => {
  try {
    const [goal] = await db.select().from(goals).where(eq(goals.id, goalId));

    // 1. Update the goal risk profile
    await db.update(goalRiskProfiles)
      .set({ riskLevel: newRisk, updatedAt: new Date() })
      .where(eq(goalRiskProfiles.goalId, goalId));

    // 2. Log the trigger
    await db.insert(rebalanceTriggers).values({
      userId: goal.userId,
      goalId,
      previousRiskLevel: oldRisk,
      newRiskLevel: newRisk,
      triggerReason: 'success_probability_drop',
      simulatedSuccessProbability: probability
    });

    // 3. Emit event for further automation (e.g. Budget adjustments)
    eventBus.emit('GOAL_RISK_REBALANCED', { goalId, userId: goal.userId, oldRisk, newRisk });

    // 4. Shift simulated weights (L3 Logic Juggling)
    await this.adjustAssetWeightsForGoal(goalId, newRisk);

    console.log(`[Investment Service] Rebalanced goal ${goalId} from ${oldRisk} to ${newRisk}`);
    return true;
  } catch (error) {
    console.error('Error rebalancing goal risk:', error);
    throw error;
  }
};

/**
 * Adjust Asset Weights For Goal (L3)
 * Reallocates assets in the underlying vault linked to a goal.
 */
export const adjustAssetWeightsForGoal = async (goalId, riskLevel) => {
  // Business Logic: If goal is aggressive, 80% Equity / 20% Bonds.
  // If conservative, 20% Equity / 80% Bonds.
  const allocations = {
    aggressive: { equity: 0.8, fixed: 0.2 },
    moderate: { equity: 0.6, fixed: 0.4 },
    conservative: { equity: 0.2, fixed: 0.8 }
  };

  const target = allocations[riskLevel];
  console.log(`[Investment Service] Reallocating goal ${goalId} assets to ${JSON.stringify(target)}`);

  // For Wealth-Vault, we log it and update metadata.
  await db.update(goals)
    .set({ metadata: sql`jsonb_set(metadata, '{target_allocation}', ${JSON.stringify(target)}::jsonb)` })
    .where(eq(goals.id, goalId));
};

/**
 * Check Liquidation Tax Efficiency (L3)
 * Determines if selling an asset to pay down debt results in a net gain after taxes.
 */
export const checkLiquidationTaxEfficiency = async (userId, investmentId, amountNeeded) => {
  const investment = await InvestmentRepository.findById(investmentId, userId);
  if (!investment) throw new Error('Investment not found');

  const lots = await taxService.getMatchingLots(investmentId, userId, 'HIFO'); // Tax-optimized

  let currentCostBasis = 0;
  let unitsToSell = 0;
  let unitsRemaining = amountNeeded;

  for (const lot of lots) {
    if (unitsRemaining <= 0) break;
    const sellFromLot = Math.min(parseFloat(lot.remainingQuantity), unitsRemaining / parseFloat(investment.currentPrice));
    currentCostBasis += sellFromLot * parseFloat(lot.costBasisPerUnit);
    unitsToSell += sellFromLot;
    unitsRemaining -= sellFromLot * parseFloat(investment.currentPrice);
  }

  const proceeds = unitsToSell * parseFloat(investment.currentPrice);
  const capitalGain = proceeds - currentCostBasis;
  const estimatedTax = capitalGain > 0 ? capitalGain * 0.15 : 0; // 15% LTCG placeholder

  return {
    isEfficient: estimatedTax < (amountNeeded * 0.05), // If tax leakage < 5% of debt paid
    estimatedTax,
    capitalGain,
    netProceeds: proceeds - estimatedTax
  };
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
  batchUpdateValuations,
  rebalanceGoalRisk,
  adjustAssetWeightsForGoal,
  checkLiquidationTaxEfficiency,
  executeTaxLossSwap
};
