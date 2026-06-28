/**
 * Multi-Currency Rebalancing Service
 * 
 * Issue #613: Multi-Currency Portfolio Rebalancing with Tax-Loss Harvesting
 * 
 * Handles:
 * - Multi-currency portfolio analysis
 * - Forex conversion optimization
 * - Currency pairing optimization
 * - Cross-currency rebalancing moves
 * - Currency hedging recommendations
 */

import db from '../config/db.js';
import { portfolioHoldings, fxRates, currencies } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

class MultiCurrencyRebalancingService {
  /**
   * Analyze portfolio in multiple currencies
   */
  async analyzeMultiCurrencyPortfolio(userId, tenantId, baseCurrency = 'USD') {
    try {
      // Get all holdings
      const holdings = await db
        .select()
        .from(portfolioHoldings)
        .where(
          and(
            eq(portfolioHoldings.userId, userId),
            eq(portfolioHoldings.tenantId, tenantId)
          )
        );

      // Group by currency
      const byHoldingCurrency = {};
      let totalValueInBaseCurrency = 0;

      for (const holding of holdings) {
        const holdingCurl = holding.baseCurrency || 'USD';
        if (!byHoldingCurrency[holdingCurl]) {
          byHoldingCurrency[holdingCurl] = {
            currency: holdingCurl,
            holdings: [],
            totalValue: 0,
          };
        }

        byHoldingCurrency[holdingCurl].holdings.push(holding);
        byHoldingCurrency[holdingCurl].totalValue += parseFloat(holding.currentValue);
      }

      // Convert all to base currency
      const currencyAllocations = {};
      
      for (const [currency, data] of Object.entries(byHoldingCurrency)) {
        const rate = await this.getExchangeRate(currency, baseCurrency);
        const valueInBase = data.totalValue * rate;
        totalValueInBaseCurrency += valueInBase;
        
        currencyAllocations[currency] = {
          currency,
          valueInOwnCurrency: data.totalValue,
          exchangeRate: rate,
          valueInBaseCurrency: valueInBase,
          holdings: data.holdings,
        };
      }

      // Calculate allocations
      const allocations = {};
      for (const [currency, data] of Object.entries(currencyAllocations)) {
        allocations[currency] = {
          percent: totalValueInBaseCurrency > 0 
            ? (data.valueInBaseCurrency / totalValueInBaseCurrency) * 100 
            : 0,
          ...data,
        };
      }

      return {
        baseCurrency,
        totalPortfolioValue: totalValueInBaseCurrency,
        currencyAllocations: allocations,
        currencyCount: Object.keys(allocations).length,
      };
    } catch (err) {
      console.error('Multi-currency analysis error:', err);
      throw err;
    }
  }

  /**
   * Get current exchange rate
   */
  async getExchangeRate(fromCurrency, toCurrency, date = new Date()) {
    try {
      if (fromCurrency === toCurrency) {
        return 1.0;
      }

      // Try to get latest rate from database
      const [rate] = await db
        .select()
        .from(fxRates)
        .where(
          and(
            eq(fxRates.fromCurrency, fromCurrency),
            eq(fxRates.toCurrency, toCurrency)
          )
        )
        .orderBy(desc(fxRates.rateDate))
        .limit(1);

      if (rate) {
        return parseFloat(rate.rate);
      }

      // Fallback: try reverse pair
      const [reverseRate] = await db
        .select()
        .from(fxRates)
        .where(
          and(
            eq(fxRates.fromCurrency, toCurrency),
            eq(fxRates.toCurrency, fromCurrency)
          )
        )
        .orderBy(desc(fxRates.rateDate))
        .limit(1);

      if (reverseRate) {
        return 1 / parseFloat(reverseRate.rate);
      }

      // If not found, return 1.0 (should implement real-time pricing API)
      console.warn(`No exchange rate found for ${fromCurrency}/${toCurrency}`);
      return 1.0;
    } catch (err) {
      console.error('Exchange rate retrieval error:', err);
      return 1.0;
    }
  }

  /**
   * Optimize currency conversion for rebalancing
   * Finds cheapest conversion path
   */
  async optimizeCurrencyConversion(fromCurrency, toCurrency, amount) {
    try {
      // Direct conversion
      const directRate = await this.getExchangeRate(fromCurrency, toCurrency);
      const directResult = amount * directRate;

      // Try triangular conversion (via intermediate currency)
      const intermediates = ['USD', 'EUR', 'GBP', 'JPY'];
      let bestRate = directRate;
      let bestPath = `${fromCurrency}→${toCurrency}`;

      for (const intermediate of intermediates) {
        if (intermediate === fromCurrency || intermediate === toCurrency) continue;

        const rate1 = await this.getExchangeRate(fromCurrency, intermediate);
        const rate2 = await this.getExchangeRate(intermediate, toCurrency);
        const triangularRate = rate1 * rate2;

        // Account for typical trading spreads
        const spreadCost = triangularRate * 0.001; // 0.1% typical spread
        const adjustedRate = triangularRate - spreadCost;

        if (adjustedRate > bestRate) {
          bestRate = adjustedRate;
          bestPath = `${fromCurrency}→${intermediate}→${toCurrency}`;
        }
      }

      return {
        fromCurrency,
        toCurrency,
        amount,
        bestPath,
        rate: bestRate,
        resultingAmount: amount * bestRate,
        savings: (amount * bestRate) - directResult,
      };
    } catch (err) {
      console.error('Currency conversion optimization error:', err);
      throw err;
    }
  }

  /**
   * Calculate cross-currency rebalancing moves
   */
  async calculateCrossCurrencyMoves(userId, tenantId, targetAllocations) {
    try {
      const portfolio = await this.analyzeMultiCurrencyPortfolio(userId, tenantId, 'USD');
      const moves = [];

      // Identify which currencies are overweight/underweight
      const currentAlloc = {};
      for (const [currency, data] of Object.entries(portfolio.currencyAllocations)) {
        currentAlloc[currency] = data.percent || 0;
      }

      // Match overweight currencies with underweight ones
      const overweight = [];
      const underweight = [];

      for (const [currency, target] of Object.entries(targetAllocations)) {
        const current = currentAlloc[currency] || 0;
        const deviation = current - target;

        if (Math.abs(deviation) > 0.5) {
          if (deviation > 0) {
            overweight.push({
              currency,
              current,
              target,
              excessPercent: deviation,
              value: portfolio.totalPortfolioValue * (current / 100),
            });
          } else {
            underweight.push({
              currency,
              current,
              target,
              deficitPercent: Math.abs(deviation),
              neededValue: portfolio.totalPortfolioValue * (target / 100),
            });
          }
        }
      }

      // Create conversion moves
      for (const from of overweight) {
        for (const to of underweight) {
          if (from.value <= 0 || to.neededValue <= 0) continue;

          const moveAmount = Math.min(from.value * 0.5, to.neededValue);
          const optimization = await this.optimizeCurrencyConversion(
            from.currency,
            to.currency,
            moveAmount
          );

          moves.push({
            type: 'currency_conversion',
            from: from.currency,
            to: to.currency,
            amountFrom: moveAmount,
            amountTo: optimization.resultingAmount,
            conversionPath: optimization.bestPath,
            conversionRate: optimization.rate,
            savingsVsDirect: optimization.savings,
          });

          from.value -= moveAmount;
          to.neededValue -= moveAmount;
        }
      }

      return {
        portfolioValue: portfolio.totalPortfolioValue,
        currentAllocations: currentAlloc,
        targetAllocations,
        conversions: moves,
        totalSavings: moves.reduce((sum, m) => sum + m.savingsVsDirect, 0),
      };
    } catch (err) {
      console.error('Cross-currency moves calculation error:', err);
      throw err;
    }
  }

  /**
   * Get currency exposure summary
   */
  async getCurrencyExposure(userId, tenantId) {
    try {
      const portfolio = await this.analyzeMultiCurrencyPortfolio(userId, tenantId, 'USD');
      
      const exposure = {
        baseCurrency: portfolio.baseCurrency,
        totalValue: portfolio.totalPortfolioValue,
        currencies: [],
        hedgingNeeded: false,
      };

      // Sort by value
      const sorted = Object.values(portfolio.currencyAllocations)
        .sort((a, b) => b.valueInBaseCurrency - a.valueInBaseCurrency);

      for (const allocation of sorted) {
        exposure.currencies.push({
          currency: allocation.currency,
          valueInBaseCurrency: allocation.valueInBaseCurrency,
          percent: allocation.percent,
          holdingCount: allocation.holdings.length,
          volatility: await this.estimateCurrencyVolatility(allocation.currency),
        });
      }

      // Determine if hedging is needed (high concentration in non-base currency)
      const maxExposure = Math.max(...exposure.currencies.map(c => c.percent));
      exposure.hedgingNeeded = maxExposure > 40 && maxExposure !== exposure.currencies[0].percent;

      return exposure;
    } catch (err) {
      console.error('Currency exposure summary error:', err);
      throw err;
    }
  }

  /**
   * Estimate currency volatility (simplified)
   */
  async estimateCurrencyVolatility(currency) {
    // Typical FX volatilities (in real app, would calculate from historical data)
    const volatilities = {
      'USD': 0,
      'EUR': 0.08,
      'GBP': 0.10,
      'JPY': 0.09,
      'CAD': 0.07,
      'AUD': 0.09,
      'CHF': 0.08,
      'CNY': 0.03,
      'INR': 0.08,
    };

    return volatilities[currency] || 0.08;
  }

  /**
   * Recommend currency hedging strategy
   */
  async recommendHedgingStrategy(userId, tenantId, baseCurrency = 'USD') {
    try {
      const exposure = await this.getCurrencyExposure(userId, tenantId);
      const recommendations = [];

      for (const currency of exposure.currencies) {
        if (currency.currency === baseCurrency) continue;

        if (currency.percent > 30) {
          recommendations.push({
            currency: currency.currency,
            exposure: currency.percent,
            volatility: currency.volatility,
            recommendation: 'CONSIDER_HEDGE',
            suggestedHedge: currency.volatility > 0.08 ? 'CURRENCY_FORWARD' : 'CURRENCY_OPTION',
            hedgePercent: Math.min(50, currency.percent - 20),
          });
        } else if (currency.volatility > 0.12) {
          recommendations.push({
            currency: currency.currency,
            exposure: currency.percent,
            volatility: currency.volatility,
            recommendation: 'MONITOR',
            suggestedHedge: 'NONE_YET',
            note: 'Monitor volatility; may need hedge if exposure increases'
          });
        }
      }

      return {
        baseCurrency,
        totalExposure: Object.keys(exposure.currencies).length,
        highVolatilityCurrencies: recommendations.filter(r => r.volatility > 0.10).length,
        recommendations,
      };
    } catch (err) {
      console.error('Hedging strategy recommendation error:', err);
      throw err;
    }
  }
}

export default new MultiCurrencyRebalancingService();
