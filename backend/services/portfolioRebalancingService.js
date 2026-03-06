/**
 * Portfolio Rebalancing Service
 * 
 * Issue #613: Multi-Currency Portfolio Rebalancing with Tax-Loss Harvesting
 * 
 * Core functionality:
 * - Multi-currency portfolio analysis
 * - Allocation drift detection
 * - Rebalancing optimization
 * - Tax-loss harvesting identification
 * - Transaction cost minimization
 */

import db from '../config/db.js';
import {
  portfolioHoldings,
  allocationTargets,
  rebalancingRecommendations,
  rebalancingTransactions,
  taxLots,
  rebalancingMetrics,
} from '../db/schema.js';
import { eq, and, or, sql, desc, gte, lte } from 'drizzle-orm';
import cacheService from './cacheService.js';
import outboxService from './outboxService.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Portfolio Rebalancing Service
 * Handles multi-currency rebalancing with tax optimization
 */
class PortfolioRebalancingService {
  /**
   * Analyze portfolio and generate rebalancing recommendations
   * Main entry point for rebalancing analysis
   */
  async analyzePortfolioAndRecommend(userId, tenantId, allocationTargetId) {
    try {
      // Get allocation target
      const [target] = await db
        .select()
        .from(allocationTargets)
        .where(
          and(
            eq(allocationTargets.id, allocationTargetId),
            eq(allocationTargets.userId, userId)
          )
        );

      if (!target) {
        throw new Error('Allocation target not found');
      }

      // Get current portfolio
      const holdings = await this.getPortfolioHoldings(userId, tenantId);
      const portfolioValue = this.calculatePortfolioValue(holdings);
      
      if (portfolioValue === 0) {
        return null; // No portfolio to rebalance
      }

      // Calculate current allocations
      const currentAllocations = this.calculateAllocations(holdings, portfolioValue);
      
      // Get target allocations from strategy
      const targetAllocations = this.parseTargetAllocations(target.allocations, portfolioValue);
      
      // Calculate deviations
      const deviations = this.calculateDeviations(currentAllocations, targetAllocations);
      
      // Check if rebalancing is needed
      const maxDrift = Math.max(...Object.values(deviations).map(d => Math.abs(d.deviation)));
      
      if (maxDrift < target.rebalancingThreshold) {
        return null; // Below threshold, no rebalancing needed
      }

      // Calculate rebalancing moves
      const moves = await this.calculateRebalancingMoves(
        userId,
        tenantId,
        currentAllocations,
        targetAllocations,
        target
      );

      // Calculate transaction costs
      const costAnalysis = await this.estimateTransactionCosts(
        moves,
        target.preferredExchanges,
        target.maxSlippage
      );

      // Identify tax-loss harvesting opportunities
      const taxHarvestingMoves = await this.identifyTaxHarvestingOpportunities(
        userId,
        tenantId,
        target.preferTaxLoss ? moves : []
      );

      // Calculate tax impact
      const taxImpact = await this.calculateTaxImpact(
        userId,
        tenantId,
        moves,
        taxHarvestingMoves
      );

      // Determine priority based on drift
      const priority = maxDrift > 0.20 ? 'urgent' : maxDrift > 0.10 ? 'high' : 'medium';

      // Create recommendation record
      const recommendation = await db
        .insert(rebalancingRecommendations)
        .values({
          id: uuidv4(),
          tenantId,
          userId,
          allocationTargetId,
          
          portfolioValue,
          currentAllocations,
          targetAllocations,
          deviations,
          
          moves,
          estimatedCost: costAnalysis.totalCost,
          estimatedSlippage: costAnalysis.totalSlippage,
          taxImpact,
          
          taxHarvestingMoves,
          harvestableLosses: this.calculateHarvestableLosses(taxHarvestingMoves),
          
          status: 'pending',
          priority,
          
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hour validity
        })
        .returning();

      // Cache the recommendation
      await cacheService.set(
        `rebalancing:${userId}:${allocationTargetId}`,
        recommendation[0],
        3600 // 1 hour TTL
      );

      // Publish outbox event for notifications
      await outboxService.publishEvent({
        tenantId,
        userId,
        eventType: 'portfolio.rebalancing_recommended',
        payload: {
          recommendationId: recommendation[0].id,
          priority,
          estimatedCost: costAnalysis.totalCost,
          maxDrift,
        },
      });

      return recommendation[0];
    } catch (err) {
      console.error('Portfolio analysis error:', err);
      throw err;
    }
  }

  /**
   * Get portfolio holdings with current valuations
   */
  async getPortfolioHoldings(userId, tenantId) {
    const holdings = await db
      .select()
      .from(portfolioHoldings)
      .where(
        and(
          eq(portfolioHoldings.userId, userId),
          eq(portfolioHoldings.tenantId, tenantId)
        )
      );

    return holdings;
  }

  /**
   * Calculate total portfolio value
   */
  calculatePortfolioValue(holdings) {
    return holdings.reduce((sum, h) => sum + parseFloat(h.currentValue || 0), 0);
  }

  /**
   * Calculate current allocation percentages
   */
  calculateAllocations(holdings, totalValue) {
    const allocations = {};

    holdings.forEach(h => {
      const percent = totalValue > 0 ? (parseFloat(h.currentValue) / totalValue) * 100 : 0;
      allocations[h.assetSymbol] = {
        value: parseFloat(h.currentValue),
        quantity: parseFloat(h.quantity),
        percent: Math.round(percent * 100) / 100,
      };
    });

    return allocations;
  }

  /**
   * Parse target allocations from strategy
   */
  parseTargetAllocations(allocations, portfolioValue) {
    const targets = {};

    Object.entries(allocations).forEach(([asset, config]) => {
      const targetPercent = config.target * 100;
      const targetValue = portfolioValue * config.target;
      
      targets[asset] = {
        target: config.target * 100,
        minBound: config.minBound ? config.minBound * 100 : targetPercent - 5,
        maxBound: config.maxBound ? config.maxBound * 100 : targetPercent + 5,
        value: targetValue,
      };
    });

    return targets;
  }

  /**
   * Calculate allocation deviations
   */
  calculateDeviations(current, target) {
    const deviations = {};

    Object.entries(target).forEach(([asset, targetConfig]) => {
      const currentPercent = current[asset]?.percent ?? 0;
      const targetPercent = targetConfig.target;
      const deviation = (currentPercent - targetPercent) / 100; // Decimal form

      deviations[asset] = {
        current: currentPercent,
        target: targetPercent,
        deviation,
        direction: deviation > 0 ? 'overweight' : 'underweight',
        withinBounds: 
          currentPercent >= targetConfig.minBound && 
          currentPercent <= targetConfig.maxBound,
      };
    });

    return deviations;
  }

  /**
   * Calculate rebalancing moves needed
   * Uses greedy algorithm: sell overweight assets to buy underweight
   */
  async calculateRebalancingMoves(userId, tenantId, current, target, strategy) {
    const moves = [];

    // Identify overweight and underweight positions
    const overweight = [];
    const underweight = [];

    Object.entries(target).forEach(([asset, config]) => {
      const currentAlloc = current[asset]?.percent ?? 0;
      const deviation = currentAlloc - config.target;

      if (Math.abs(deviation) > 0.5) { // Only if deviation > 0.5%
        if (deviation > 0) {
          overweight.push({
            asset,
            currentPercent: currentAlloc,
            targetPercent: config.target,
            excessPercent: deviation,
            value: current[asset]?.value,
          });
        } else {
          underweight.push({
            asset,
            currentPercent: currentAlloc,
            targetPercent: config.target,
            deficitPercent: Math.abs(deviation),
            value: current[asset]?.value,
          });
        }
      }
    });

    // Match overweight with underweight
    while (overweight.length > 0 && underweight.length > 0) {
      const from = overweight[0];
      const to = underweight[0];

      const moveAmount = Math.min(from.value, to.value, from.value * 0.9); // Max 90% of position

      moves.push({
        from: from.asset,
        to: to.asset,
        amount: Math.round(moveAmount * 100) / 100,
        reason: 'rebalance',
      });

      from.value -= moveAmount;
      to.value -= moveAmount;

      if (from.value < 10) overweight.shift();
      if (to.value < 10) underweight.shift();
    }

    return moves;
  }

  /**
   * Estimate transaction costs for rebalancing
   */
  async estimateTransactionCosts(moves, preferredExchanges, maxSlippage) {
    let totalCost = 0;
    let totalSlippage = 0;

    for (const move of moves) {
      // Estimate fees (simplified - in production, would query exchange APIs)
      const feePercent = 0.001; // 0.1% average fee
      const fee = move.amount * feePercent;

      // Estimate slippage (depends on trade size)
      const slippagePercent = Math.min(move.amount / 100000, maxSlippage || 0.005);
      const slippage = move.amount * slippagePercent;

      totalCost += fee;
      totalSlippage += slippage;
    }

    return {
      totalCost: Math.round(totalCost * 100) / 100,
      totalSlippage: Math.round(totalSlippage * 100) / 100,
      averageCostPerMove: Math.round((totalCost / moves.length) * 100) / 100,
    };
  }

  /**
   * Identify tax-loss harvesting opportunities
   */
  async identifyTaxHarvestingOpportunities(userId, tenantId, moves) {
    try {
      const taxLots_ = await db
        .select()
        .from(taxLots)
        .where(
          and(
            eq(taxLots.userId, userId),
            eq(taxLots.tenantId, tenantId),
            eq(taxLots.canBeHarvested, true)
          )
        )
        .orderBy(taxLots.harvestPriority, taxLots.unrealizedGain);

      const harvestingMoves = [];

      for (const lot of taxLots_) {
        // Only harvest losses
        if (parseFloat(lot.unrealizedGain) >= 0) continue;

        // Check wash sale rule
        if (lot.washSaleExcludeUntil && lot.washSaleExcludeUntil > new Date()) {
          continue;
        }

        // Find similar asset to switch to (avoid wash sale)
        const similarAsset = this.findSimilarAsset(lot.assetSymbol);

        harvestingMoves.push({
          sell: lot.assetSymbol,
          buy: similarAsset,
          loss: Math.abs(parseFloat(lot.unrealizedGain)),
          lotId: lot.id,
          purpose: 'harvest',
        });
      }

      return harvestingMoves;
    } catch (err) {
      console.error('Tax harvesting identification error:', err);
      return [];
    }
  }

  /**
   * Find similar asset for wash sale avoidance
   */
  findSimilarAsset(assetSymbol) {
    const similarAssets = {
      'BTC': 'ETH',
      'ETH': 'BTC',
      'AAPL': 'MSFT',
      'MSFT': 'AAPL',
      'SPY': 'VOO',
      'VOO': 'VTI',
      'EUR': 'GBP',
      'GBP': 'EUR',
    };

    return similarAssets[assetSymbol] || assetSymbol;
  }

  /**
   * Calculate tax impact of rebalancing moves
   */
  async calculateTaxImpact(userId, tenantId, moves, harvestingMoves) {
    let realizedGains = 0;
    let realizedLosses = 0;

    // Get tax lots to calculate gains/losses
    const lots = await db
      .select()
      .from(taxLots)
      .where(
        and(
          eq(taxLots.userId, userId),
          eq(taxLots.tenantId, tenantId),
          eq(taxLots.status, 'open')
        )
      );

    // Sum up realized gains from moves
    for (const move of moves) {
      const relatedLots = lots.filter(l => l.assetSymbol === move.from);
      for (const lot of relatedLots) {
        if (parseFloat(lot.unrealizedGain) > 0) {
          realizedGains += Math.min(parseFloat(lot.unrealizedGain), move.amount);
        }
      }
    }

    // Sum up harvestable losses
    for (const move of harvestingMoves) {
      realizedLosses += move.loss;
    }

    // Estimate tax cost (simplified: 35% combined fed + state rate)
    const netGains = realizedGains - realizedLosses;
    const estimatedTaxRate = 0.35;
    const netTaxCost = netGains > 0 ? netGains * estimatedTaxRate : -realizedLosses * estimatedTaxRate;

    return {
      realizedGains: Math.round(realizedGains * 100) / 100,
      realizedLosses: Math.round(realizedLosses * 100) / 100,
      netGains: Math.round(netGains * 100) / 100,
      estimatedTaxCost: Math.round(netTaxCost * 100) / 100,
    };
  }

  /**
   * Calculate total harvestable losses
   */
  calculateHarvestableLosses(moves) {
    return moves.reduce((sum, m) => sum + m.loss, 0);
  }

  /**
   * Execute rebalancing recommendation
   */
  async executeRebalancing(recommendationId, userId, tenantId, approvalNotes = null) {
    try {
      // Get recommendation
      const [recommendation] = await db
        .select()
        .from(rebalancingRecommendations)
        .where(
          and(
            eq(rebalancingRecommendations.id, recommendationId),
            eq(rebalancingRecommendations.userId, userId)
          )
        );

      if (!recommendation) {
        throw new Error('Recommendation not found');
      }

      // Update status to approved
      await db
        .update(rebalancingRecommendations)
        .set({
          status: 'approved',
          actionedAt: new Date(),
        })
        .where(eq(rebalancingRecommendations.id, recommendationId));

      // Create transactions for each move
      const txns = [];
      for (const move of recommendation.moves) {
        const txn = await db
          .insert(rebalancingTransactions)
          .values({
            id: uuidv4(),
            tenantId,
            userId,
            recommendationId,
            
            transactionType: 'swap',
            fromAsset: move.from,
            toAsset: move.to,
            fromQuantity: 0, // Would be calculated from current price
            toQuantity: 0,
            executionPrice: 1, // Would be actual market price
            
            baseCurrency: 'USD',
            transactionFee: recommendation.estimatedCost / recommendation.moves.length,
            slippage: recommendation.estimatedSlippage / recommendation.moves.length,
            
            status: 'pending',
          })
          .returning();
        
        txns.push(txn[0]);
      }

      // Publish execution event
      await outboxService.publishEvent({
        tenantId,
        userId,
        eventType: 'portfolio.rebalancing_executed',
        payload: {
          recommendationId,
          transactionCount: txns.length,
          totalCost: recommendation.estimatedCost,
        },
      });

      return {
        recommendation: recommendation[0],
        transactions: txns,
      };
    } catch (err) {
      console.error('Rebalancing execution error:', err);
      throw err;
    }
  }

  /**
   * Get rebalancing history
   */
  async getRebalancingHistory(userId, tenantId, limit = 20) {
    const transactions = await db
      .select()
      .from(rebalancingTransactions)
      .where(
        and(
          eq(rebalancingTransactions.userId, userId),
          eq(rebalancingTransactions.tenantId, tenantId)
        )
      )
      .orderBy(desc(rebalancingTransactions.executedAt))
      .limit(limit);

    return transactions;
  }

  /**
   * Get portfolio analytics
   */
  async getPortfolioAnalytics(userId, tenantId, allocationTargetId, periodType = 'monthly') {
    const metrics = await db
      .select()
      .from(rebalancingMetrics)
      .where(
        and(
          eq(rebalancingMetrics.userId, userId),
          eq(rebalancingMetrics.allocationTargetId, allocationTargetId),
          eq(rebalancingMetrics.periodType, periodType)
        )
      )
      .orderBy(desc(rebalancingMetrics.periodStart))
      .limit(12); // Last 12 periods

    return metrics;
  }

  /**
   * Get tax optimization summary
   */
  async getTaxOptimizationSummary(userId, tenantId) {
    try {
      const lots = await db
        .select()
        .from(taxLots)
        .where(
          and(
            eq(taxLots.userId, userId),
            eq(taxLots.tenantId, tenantId)
          )
        );

      const summary = {
        totalHoldings: lots.length,
        unrealizedGains: 0,
        unrealizedLosses: 0,
        harvestablelosses: 0,
        longTermGains: 0,
        shortTermGains: 0,
        daysUntilLongTerm: 0,
      };

      for (const lot of lots) {
        const gain = parseFloat(lot.unrealizedGain);

        if (gain > 0) {
          summary.unrealizedGains += gain;
          if (lot.isLongTerm) {
            summary.longTermGains += gain;
          } else {
            summary.shortTermGains += gain;
          }
        } else {
          summary.unrealizedLosses += Math.abs(gain);
          if (lot.canBeHarvested) {
            summary.harvestablelosses += Math.abs(gain);
          }
        }

        // Calculate days until long-term
        if (!lot.isLongTerm) {
          const daysToLongTerm = 365 - lot.daysHeld;
          if (summary.daysUntilLongTerm === 0 || daysToLongTerm < summary.daysUntilLongTerm) {
            summary.daysUntilLongTerm = daysToLongTerm;
          }
        }
      }

      return summary;
    } catch (err) {
      console.error('Tax summary error:', err);
      throw err;
    }
  }
}

export default new PortfolioRebalancingService();
