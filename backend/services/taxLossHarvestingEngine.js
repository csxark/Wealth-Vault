/**
 * Advanced Tax-Loss Harvesting Engine
 * 
 * Issue #613: Multi-Currency Portfolio Rebalancing with Tax-Loss Harvesting
 * 
 * Implements:
 * - Intelligent tax-loss harvesting identification
 * - Wash-sale rule compliance (IRS 30-day rule)
 * - Tax bracket optimization
 * - Year-end harvesting strategy
 * - Capital loss carryforward tracking
 */

import db from '../config/db.js';
import { taxLots, portfolioHoldings, rebalancingTransactions } from '../db/schema.js';
import { eq, and, lt, gt, lte, gte, or, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

class TaxLossHarvestingEngine {
  /**
   * Find all tax-loss harvesting opportunities
   * Prioritizes based on loss magnitude and urgency (year-end)
   */
  async findHarvestingOpportunities(userId, tenantId) {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      // Get all harvestable tax lots with losses
      const harvestableLots = await db
        .select()
        .from(taxLots)
        .where(
          and(
            eq(taxLots.userId, userId),
            eq(taxLots.tenantId, tenantId),
            eq(taxLots.canBeHarvested, true),
            lt(taxLots.unrealizedGain, 0), // Only losses
            or(
              // Not wash-sale restricted OR (wash-sale period expired)
              eq(taxLots.washSaleExcludeUntil, null),
              lt(taxLots.washSaleExcludeUntil, now)
            ),
            eq(taxLots.status, 'open')
          )
        )
        .orderBy(
          // Prioritize: largest losses first, then oldest positions
          [
            { column: taxLots.unrealizedGain, direction: 'asc' },
            { column: taxLots.acquisitionDate, direction: 'asc' }
          ]
        );

      // Enrich with replacement asset recommendations
      const enrichedLots = harvestableLots.map(lot => ({
        ...lot,
        replacementAssets: this.findReplacementAssets(lot.assetSymbol),
        harvestValue: Math.abs(parseFloat(lot.unrealizedGain)),
        daysHeld: Math.floor((now - new Date(lot.acquisitionDate)) / (1000 * 60 * 60 * 24)),
        washSaleRiskUntil: lot.washSaleExcludeUntil,
      }));

      return enrichedLots;
    } catch (err) {
      console.error('Tax harvesting identification error:', err);
      throw err;
    }
  }

  /**
   * Get replacement assets for a given asset (avoid wash sales)
   * Returns similar assets that would maintain portfolio exposure
   */
  findReplacementAssets(assetSymbol) {
    const assetFamilies = {
      // Equity indices/ETFs
      'SPY': ['VOO', 'VTI', 'SPLG', 'IVV'], // S&P 500 alternatives
      'VOO': ['SPY', 'VTI', 'SPLG', 'IVV'],
      'VTI': ['VTSAX', 'SWTSX', 'EUSA'], // Total market alternatives
      'QQQ': ['TQQQ/3', 'NASDAQ', 'XQQ'], // Nasdaq 100 alternatives
      
      // Crypto assets
      'BTC': ['GBTC', 'IBIT', 'FBTC'], // Bitcoin exposure alternatives
      'ETH': ['ETHE', 'IETH', 'FETH'], // Ethereum exposure alternatives
      'DOGE': ['MSTR', 'RIOT', 'MARA'], // Crypto-adjacent alternatives
      
      // International equities
      'EFA': ['IEMG', 'VXUS', 'IXUS'], // Emerging markets alternatives
      'VXUS': ['EFA', 'IEMG', 'IXUS'],
      
      // Bonds
      'BND': ['AGG', 'SCHB', 'VBTLX'], // Total bond alternatives
      'AGG': ['BND', 'SCHB', 'VBTLX'],
      'LQD': ['VCIT', 'VCLT', 'VCPU'], // Corporate bond alternatives
      
      // Real estate
      'VNQ': ['SCHH', 'XLRE', 'REM'], // REIT alternatives
      
      // Individual stocks (by sector/similarity)
      'AAPL': ['MSFT', 'GOOGL', 'NVDA'], // Tech giants
      'MSFT': ['AAPL', 'GOOGL', 'NVDA'],
      'TSLA': ['RIVN', 'XPEV', 'NIO'], // EV manufacturers
      'AMZN': ['SHOP', 'EBAY', 'WMT'], // E-commerce
      'JPM': ['BAC', 'WFC', 'GS'], // Financial services
    };

    return assetFamilies[assetSymbol] || [assetSymbol];
  }

  /**
   * Calculate optimal harvest strategy for year-end
   * Minimizes tax liability based on realized gains/losses
   */
  async calculateYearEndStrategy(userId, tenantId, taxBracket = 0.35) {
    try {
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      
      // Get current year transactions
      const yearTransactions = await db
        .select()
        .from(rebalancingTransactions)
        .where(
          and(
            eq(rebalancingTransactions.userId, userId),
            eq(rebalancingTransactions.tenantId, tenantId),
            gte(rebalancingTransactions.executedAt, yearStart)
          )
        );

      // Sum realized gains and losses
      let realizedGains = 0;
      let realizedLosses = 0;
      let shortTermGains = 0;
      let longTermGains = 0;

      for (const tx of yearTransactions) {
        if (tx.realizedGain > 0) {
          realizedGains += parseFloat(tx.realizedGain || 0);
          if (tx.gainType === 'short-term') {
            shortTermGains += parseFloat(tx.realizedGain || 0);
          } else {
            longTermGains += parseFloat(tx.realizedGain || 0);
          }
        }
        if (tx.realizedLoss > 0) {
          realizedLosses += parseFloat(tx.realizedLoss || 0);
        }
      }

      // Find harvestable losses
      const harvestingOps = await this.findHarvestingOpportunities(userId, tenantId);
      const totalHarvestable = harvestingOps.reduce((sum, op) => sum + op.harvestValue, 0);

      // Calculate optimal harvest amount
      let optimaldHarvestAmount = 0;
      const netGains = realizedGains - realizedLosses;

      if (netGains > 0) {
        // Harvest enough to offset gains (or max available)
        optimaldHarvestAmount = Math.min(netGains, totalHarvestable);
      } else if (netGains === 0 && totalHarvestable > 3000) {
        // No gains this year, harvest up to $3,000 (annual limit)
        optimaldHarvestAmount = Math.min(totalHarvestable, 3000);
      }

      // Estimate tax savings
      const taxSavings = optimaldHarvestAmount * taxBracket;

      return {
        currentYearSummary: {
          realizedGains: Math.round(realizedGains * 100) / 100,
          realizedLosses: Math.round(realizedLosses * 100) / 100,
          netGains: Math.round(netGains * 100) / 100,
          shortTermGains: Math.round(shortTermGains * 100) / 100,
          longTermGains: Math.round(longTermGains * 100) / 100,
        },
        harvestingStrategy: {
          totalHarvestable: Math.round(totalHarvestable * 100) / 100,
          recommendedHarvest: Math.round(optimaldHarvestAmount * 100) / 100,
          estimatedTaxSavings: Math.round(taxSavings * 100) / 100,
          annualCarryforwardLimit: 3000, // IRS limit for deductible losses
          opportunityCount: harvestingOps.length,
        },
        harvestingOpportunities: harvestingOps.slice(0, 10), // Top 10 opportunities
      };
    } catch (err) {
      console.error('Year-end strategy calculation error:', err);
      throw err;
    }
  }

  /**
   * Check wash-sale compliance before selling
   */
  async checkWashSaleCompliance(userId, tenantId, assetSymbol, saleDate) {
    try {
      const thirtyDaysAfter = new Date(saleDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const thirtyDaysBefore = new Date(saleDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Check for purchases of same/substantially identical asset within 60-day window
      const conflictingTransactions = await db
        .select()
        .from(rebalancingTransactions)
        .where(
          and(
            eq(rebalancingTransactions.userId, userId),
            eq(rebalancingTransactions.tenantId, tenantId),
            or(
              eq(rebalancingTransactions.fromAsset, assetSymbol),
              eq(rebalancingTransactions.toAsset, assetSymbol)
            ),
            gte(rebalancingTransactions.executedAt, thirtyDaysBefore),
              lte(rebalancingTransactions.executedAt, thirtyDaysAfter)
          )
        );

      return {
        compliant: conflictingTransactions.length === 0,
        conflictingTransactions,
        washSaleRestrictedUntil: thirtyDaysAfter,
        message: conflictingTransactions.length > 0 
          ? `Found ${conflictingTransactions.length} conflicting transactions within wash-sale window`
          : 'No wash-sale violations detected'
      };
    } catch (err) {
      console.error('Wash-sale compliance check error:', err);
      throw err;
    }
  }

  /**
   * Track capital loss carryforwards
   * The IRS allows unlimited carryforward of unused capital losses
   */
  async getCapitalLossCarryforward(userId, tenantId, currentYear = new Date().getFullYear()) {
    try {
      let totalUnusedLosses = 0;

      // Check each past year for unused losses
      for (let year = currentYear - 10; year < currentYear; year++) {
        const yearStart = new Date(year, 0, 1);
        const yearEnd = new Date(year + 1, 0, 1);

        const yearTransactions = await db
          .select()
          .from(rebalancingTransactions)
          .where(
            and(
              eq(rebalancingTransactions.userId, userId),
              eq(rebalancingTransactions.tenantId, tenantId),
              gte(rebalancingTransactions.executedAt, yearStart),
              lt(rebalancingTransactions.executedAt, yearEnd)
            )
          );

        let yearGains = 0;
        let yearLosses = 0;

        for (const tx of yearTransactions) {
          yearGains += parseFloat(tx.realizedGain || 0);
          yearLosses += parseFloat(tx.realizedLoss || 0);
        }

        const yearNetLoss = yearLosses - yearGains;
        if (yearNetLoss > 0) {
          // Can only deduct $3,000 per year
          totalUnusedLosses += Math.max(yearNetLoss - 3000, 0);
        }
      }

      return {
        carryforwardAmount: Math.round(totalUnusedLosses * 100) / 100,
        availableToUse: Math.min(3000, totalUnusedLosses), // Can use up to $3k this year
        message: totalUnusedLosses > 0 
          ? `You have $${totalUnusedLosses.toFixed(2)} in capital loss carryforward`
          : 'No capital loss carryforward available'
      };
    } catch (err) {
      console.error('Capital loss carryforward calculation error:', err);
      throw err;
    }
  }

  /**
   * Apply wash-sale restriction after harvesting
   */
  async applyWashSaleRestriction(tenantId, taxLotId, saleDate) {
    try {
      const restrictionUntil = new Date(saleDate.getTime() + 30 * 24 * 60 * 60 * 1000);

      await db
        .update(taxLots)
        .set({
          washSaleExcludeUntil: restrictionUntil,
          status: 'harvested',
          lastHarvestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(taxLots.id, taxLotId));

      return {
        success: true,
        taxLotId,
        restrictionUntil,
        message: `Wash-sale restriction applied until ${restrictionUntil.toISOString().split('T')[0]}`,
      };
    } catch (err) {
      console.error('Wash-sale restriction application error:', err);
      throw err;
    }
  }

  /**
   * Get tax-lot specific tax implications
   */
  async getTaxLotTaxImplications(userId, tenantId, taxLotId) {
    try {
      const [lot] = await db
        .select()
        .from(taxLots)
        .where(
          and(
            eq(taxLots.id, taxLotId),
            eq(taxLots.userId, userId)
          )
        );

      if (!lot) {
        throw new Error('Tax lot not found');
      }

      const isLongTerm = lot.isLongTerm;
      const unrealizedGain = parseFloat(lot.unrealizedGain);
      
      // Tax rates (simplified - actual rates vary by filing status)
      const shortTermRate = 0.37; // Taxed as ordinary income
      const longTermRate = unrealizedGain > 0 ? 0.20 : 0; // 20% for long-term gains, or harvested
      const harvestBenefit = Math.abs(unrealizedGain) * 0.35; // 35% combined rate

      return {
        taxLotId,
        assetSymbol: lot.assetSymbol,
        acquisitionDate: lot.acquisitionDate,
        daysHeld: lot.daysHeld,
        isLongTerm,
        quantity: parseFloat(lot.quantity),
        costBasis: parseFloat(lot.costBasis),
        currentValue: parseFloat(lot.currentValue),
        unrealizedGain,
        taxRate: isLongTerm ? longTermRate : shortTermRate,
        estimatedTax: unrealizedGain > 0 ? unrealizedGain * (isLongTerm ? longTermRate : shortTermRate) : 0,
        harvestBenefit: unrealizedGain < 0 ? harvestBenefit : 0,
        recommendation: unrealizedGain < 0 && lot.canBeHarvested 
          ? 'HARVEST_NOW' 
          : unrealizedGain > 0 && !isLongTerm
            ? 'HOLD_FOR_LONG_TERM'
            : 'HOLD',
      };
    } catch (err) {
      console.error('Tax lot implications calculation error:', err);
      throw err;
    }
  }
}

export default new TaxLossHarvestingEngine();
