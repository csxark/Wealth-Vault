import axios from 'axios';
import db from '../config/db.js';
import { eq, and, desc, gte } from 'drizzle-orm';
import { priceHistory, investments } from '../db/schema.js';

/**
 * Price Service
 * Handles fetching real-time stock prices and managing price history
 */

// API configurations
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const YAHOO_FINANCE_API_KEY = process.env.YAHOO_FINANCE_API_KEY;

// Rate limiting
const PRICE_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 10; // Process 10 symbols at a time

/**
 * Fetch stock price from Alpha Vantage
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object|null>} - Price data or null if failed
 */
const fetchFromAlphaVantage = async (symbol) => {
  if (!ALPHA_VANTAGE_API_KEY) {
    return null;
  }

  try {
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'GLOBAL_QUOTE',
        symbol: symbol,
        apikey: ALPHA_VANTAGE_API_KEY,
      },
      timeout: 10000, // 10 second timeout
    });

    const data = response.data;
    if (data['Global Quote'] && data['Global Quote']['05. price']) {
      return {
        symbol: symbol.toUpperCase(),
        price: parseFloat(data['Global Quote']['05. price']),
        change: parseFloat(data['Global Quote']['09. change'] || '0'),
        changePercent: parseFloat(data['Global Quote']['10. change percent']?.replace('%', '') || '0'),
        volume: parseInt(data['Global Quote']['06. volume'] || '0'),
        lastTradingDay: data['Global Quote']['07. latest trading day'],
        source: 'alpha_vantage',
      };
    }

    return null;
  } catch (error) {
    console.warn(`Alpha Vantage API error for ${symbol}:`, error.message);
    return null;
  }
};

/**
 * Fetch stock price from Yahoo Finance (alternative implementation)
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object|null>} - Price data or null if failed
 */
const fetchFromYahooFinance = async (symbol) => {
  // Note: Yahoo Finance doesn't have a free API anymore
  // This is a placeholder for alternative implementations
  // You might use services like IEX Cloud, Finnhub, or others
  return null;
};

/**
 * Fetch stock price from multiple sources
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Object|null>} - Price data or null if all sources failed
 */
export const fetchStockPrice = async (symbol) => {
  // Try Alpha Vantage first
  let priceData = await fetchFromAlphaVantage(symbol);

  // If Alpha Vantage fails, try Yahoo Finance
  if (!priceData) {
    priceData = await fetchFromYahooFinance(symbol);
  }

  // If both fail, try other sources or return null
  if (!priceData) {
    console.warn(`Failed to fetch price for ${symbol} from all sources`);
    return null;
  }

  return priceData;
};

/**
 * Fetch prices for multiple symbols
 * @param {Array<string>} symbols - Array of stock symbols
 * @returns {Promise<Array>} - Array of price data
 */
export const fetchMultiplePrices = async (symbols) => {
  const results = [];
  const batches = [];

  // Split into batches to avoid rate limits
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    batches.push(symbols.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const batchPromises = batch.map(symbol => fetchStockPrice(symbol));
    const batchResults = await Promise.all(batchPromises);

    results.push(...batchResults.filter(result => result !== null));

    // Add delay between batches to respect rate limits
    if (batches.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
};

/**
 * Update price history in database
 * @param {string} investmentId - Investment ID
 * @param {Object} priceData - Price data from API
 * @returns {Promise<Object>} - Created price history record
 */
export const updatePriceHistory = async (investmentId, priceData) => {
  try {
    const [priceRecord] = await db
      .insert(priceHistory)
      .values({
        investmentId,
        symbol: priceData.symbol,
        date: new Date(),
        open: priceData.open?.toString(),
        high: priceData.high?.toString(),
        low: priceData.low?.toString(),
        close: priceData.price.toString(),
        volume: priceData.volume,
        adjustedClose: priceData.price.toString(), // Assuming no adjustment for now
        source: priceData.source,
        createdAt: new Date(),
      })
      .returning();

    return priceRecord;
  } catch (error) {
    console.error('Error updating price history:', error);
    throw error;
  }
};

/**
 * Get latest price for an investment
 * @param {string} investmentId - Investment ID
 * @returns {Promise<Object|null>} - Latest price data or null
 */
export const getLatestPrice = async (investmentId) => {
  try {
    const [latestPrice] = await db
      .select()
      .from(priceHistory)
      .where(eq(priceHistory.investmentId, investmentId))
      .orderBy(desc(priceHistory.date))
      .limit(1);

    return latestPrice || null;
  } catch (error) {
    console.error('Error getting latest price:', error);
    throw error;
  }
};

/**
 * Get price history for an investment
 * @param {string} investmentId - Investment ID
 * @param {number} days - Number of days of history (default 30)
 * @returns {Promise<Array>} - Array of price history records
 */
export const getPriceHistory = async (investmentId, days = 30) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const history = await db
      .select()
      .from(priceHistory)
      .where(
        and(
          eq(priceHistory.investmentId, investmentId),
          gte(priceHistory.date, startDate)
        )
      )
      .orderBy(desc(priceHistory.date));

    return history;
  } catch (error) {
    console.error('Error getting price history:', error);
    throw error;
  }
};

/**
 * Update prices for all investments in a portfolio
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID for security
 * @returns {Promise<Object>} - Update results
 */
export const updatePortfolioPrices = async (portfolioId, userId) => {
  try {
    // Get all active investments in the portfolio
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

    if (portfolioInvestments.length === 0) {
      return { updated: 0, failed: 0, message: 'No active investments found' };
    }

    // Check which investments need price updates (not updated in last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - PRICE_UPDATE_INTERVAL);
    const needsUpdate = portfolioInvestments.filter(
      investment => !investment.lastPriceUpdate || investment.lastPriceUpdate < fiveMinutesAgo
    );

    if (needsUpdate.length === 0) {
      return { updated: 0, failed: 0, message: 'All prices are up to date' };
    }

    // Fetch prices for symbols that need updates
    const symbols = [...new Set(needsUpdate.map(inv => inv.symbol))];
    const priceResults = await fetchMultiplePrices(symbols);

    // Create a map of symbol to price data
    const priceMap = new Map();
    priceResults.forEach(result => {
      priceMap.set(result.symbol, result);
    });

    // Update investments with new prices
    const updates = [];
    const failures = [];

    for (const investment of needsUpdate) {
      const priceData = priceMap.get(investment.symbol.toUpperCase());

      if (priceData) {
        try {
          const quantity = parseFloat(investment.quantity);
          const currentPrice = priceData.price;
          const marketValue = quantity * currentPrice;
          const totalCost = parseFloat(investment.totalCost);
          const unrealizedGainLoss = marketValue - totalCost;
          const unrealizedGainLossPercent = totalCost > 0 ? (unrealizedGainLoss / totalCost) * 100 : 0;

          // Update investment
          await db
            .update(investments)
            .set({
              currentPrice: currentPrice.toString(),
              marketValue: marketValue.toString(),
              unrealizedGainLoss: unrealizedGainLoss.toString(),
              unrealizedGainLossPercent: unrealizedGainLossPercent.toString(),
              lastPriceUpdate: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(investments.id, investment.id));

          // Update price history
          await updatePriceHistory(investment.id, priceData);

          updates.push({
            investmentId: investment.id,
            symbol: investment.symbol,
            oldPrice: investment.currentPrice,
            newPrice: currentPrice,
          });
        } catch (error) {
          console.error(`Error updating price for ${investment.symbol}:`, error);
          failures.push({
            investmentId: investment.id,
            symbol: investment.symbol,
            error: error.message,
          });
        }
      } else {
        failures.push({
          investmentId: investment.id,
          symbol: investment.symbol,
          error: 'Price not available from APIs',
        });
      }
    }

    return {
      updated: updates.length,
      failed: failures.length,
      updates,
      failures,
    };
  } catch (error) {
    console.error('Error updating portfolio prices:', error);
    throw error;
  }
};

/**
 * Get price alerts for investments
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of investments that may need alerts
 */
export const getPriceAlerts = async (userId) => {
  try {
    // This is a placeholder for price alert functionality
    // In a real implementation, you'd have alert thresholds stored in the database
    // and check current prices against those thresholds

    const investments = await db
      .select()
      .from(investments)
      .where(
        and(
          eq(investments.userId, userId),
          eq(investments.isActive, true)
        )
      );

    // Placeholder logic - in reality, you'd compare against alert thresholds
    return investments.map(investment => ({
      investmentId: investment.id,
      symbol: investment.symbol,
      currentPrice: investment.currentPrice,
      alertTriggered: false, // This would be calculated based on alert rules
    }));
  } catch (error) {
    console.error('Error getting price alerts:', error);
    throw error;
  }
};

export default {
  fetchStockPrice,
  fetchMultiplePrices,
  updatePriceHistory,
  getLatestPrice,
  getPriceHistory,
  updatePortfolioPrices,
  getPriceAlerts,
};
