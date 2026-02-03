import { eq, and, desc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { portfolios, investments, investmentTransactions } from '../db/schema.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from './auditService.js';

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
};
