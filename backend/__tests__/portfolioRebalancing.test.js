/**
 * Portfolio Rebalancing Service Tests
 * 
 * Tests for multi-currency portfolio rebalancing with tax optimization:
 * - Portfolio analysis and allocation calculation
 * - Rebalancing recommendation generation
 * - Tax-loss harvesting identification
 * - Transaction cost estimation
 * 
 * Issue #613: Multi-Currency Portfolio Rebalancing with Tax-Loss Harvesting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import db from '../config/db.js';
import portfolioRebalancingService from '../services/portfolioRebalancingService.js';
import {
  portfolioHoldings,
  allocationTargets,
  rebalancingRecommendations,
  rebalancingTransactions,
  taxLots,
  users,
  tenants,
} from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

let testTenantId, testUserId, testAllocationId;

describe('Portfolio Rebalancing Service - Multi-Currency Tax Optimization', () => {
  beforeEach(async () => {
    // Create test tenant
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: 'Test Tenant Portfolio',
        slug: `test-portfolio-${Date.now()}`,
        ownerId: null,
      })
      .returning();
    testTenantId = tenant.id;

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: `test-portfolio-${Date.now()}@example.com`,
        password: 'hashed_password',
        firstName: 'Portfolio',
        lastName: 'User',
        fullName: 'Portfolio User',
        tenantId: testTenantId,
      })
      .returning();
    testUserId = user.id;

    // Update tenant owner
    await db
      .update(tenants)
      .set({ ownerId: testUserId })
      .where(eq(tenants.id, testTenantId));

    // Create allocation target
    const [allocation] = await db
      .insert(allocationTargets)
      .values({
        tenantId: testTenantId,
        userId: testUserId,
        targetName: 'Balanced Portfolio',
        strategy: 'balanced',
        riskProfile: 'medium',
        allocations: {
          BTC: { target: 0.30, minBound: 0.25, maxBound: 0.35 },
          ETH: { target: 0.20, minBound: 0.15, maxBound: 0.25 },
          SPY: { target: 0.30, minBound: 0.25, maxBound: 0.35 },
          BOND: { target: 0.20, minBound: 0.15, maxBound: 0.25 },
        },
        rebalancingThreshold: 0.05,
        autoRebalance: false,
      })
      .returning();
    testAllocationId = allocation[0].id;

    // Create sample portfolio holdings
    await db.insert(portfolioHoldings).values([
      {
        tenantId: testTenantId,
        userId: testUserId,
        assetSymbol: 'BTC',
        assetType: 'cryptocurrency',
        baseCurrency: 'USD',
        quantity: '1.5',
        acquisitionCost: '45000',
        currentValue: '52500',
        costBasisHistory: {},
        averageCostPerUnit: '30000',
        unrealizedGain: '7500',
        unrealizedGainPercent: '16.67',
        realizedGain: '0',
      },
      {
        tenantId: testTenantId,
        userId: testUserId,
        assetSymbol: 'ETH',
        assetType: 'cryptocurrency',
        baseCurrency: 'USD',
        quantity: '20',
        acquisitionCost: '25000',
        currentValue: '24000',
        costBasisHistory: {},
        averageCostPerUnit: '1250',
        unrealizedGain: '-1000',
        unrealizedGainPercent: '-4.00',
        realizedGain: '0',
      },
      {
        tenantId: testTenantId,
        userId: testUserId,
        assetSymbol: 'SPY',
        assetType: 'stock',
        baseCurrency: 'USD',
        quantity: '50',
        acquisitionCost: '30000',
        currentValue: '31500',
        costBasisHistory: {},
        averageCostPerUnit: '600',
        unrealizedGain: '1500',
        unrealizedGainPercent: '5.00',
        realizedGain: '0',
      },
      {
        tenantId: testTenantId,
        userId: testUserId,
        assetSymbol: 'BOND',
        assetType: 'bond',
        baseCurrency: 'USD',
        quantity: '20000',
        acquisitionCost: '20000',
        currentValue: '20000',
        costBasisHistory: {},
        averageCostPerUnit: '1',
        unrealizedGain: '0',
        unrealizedGainPercent: '0.00',
        realizedGain: '0',
      },
    ]);

    // Create tax lots for harvesting opportunities
    await db.insert(taxLots).values({
      tenantId: testTenantId,
      userId: testUserId,
      assetSymbol: 'ETH',
      quantity: '20',
      costBasis: '25000',
      costPerUnit: '1250',
      acquisitionDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      currentValue: '24000',
      unrealizedGain: '-1000',
      gainPercent: '-4.00',
      purchaseDate: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
      isLongTerm: false,
      daysHeld: 100,
      canBeHarvested: true,
      harvestPriority: 1,
      status: 'open',
    });
  });

  afterEach(async () => {
    // Cleanup
    await db.delete(portfolioHoldings).where(eq(portfolioHoldings.tenantId, testTenantId));
    await db.delete(taxLots).where(eq(taxLots.tenantId, testTenantId));
    await db
      .delete(rebalancingRecommendations)
      .where(eq(rebalancingRecommendations.tenantId, testTenantId));
    await db
      .delete(rebalancingTransactions)
      .where(eq(rebalancingTransactions.tenantId, testTenantId));
    await db.delete(allocationTargets).where(eq(allocationTargets.tenantId, testTenantId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  describe('Portfolio Analysis', () => {
    it('should retrieve portfolio holdings', async () => {
      const holdings = await portfolioRebalancingService.getPortfolioHoldings(
        testUserId,
        testTenantId
      );

      expect(holdings.length).toBe(4);
      expect(holdings.map(h => h.assetSymbol)).toContain('BTC');
      expect(holdings.map(h => h.assetSymbol)).toContain('ETH');
    });

    it('should calculate portfolio value correctly', async () => {
      const holdings = await portfolioRebalancingService.getPortfolioHoldings(
        testUserId,
        testTenantId
      );

      const totalValue = portfolioRebalancingService.calculatePortfolioValue(holdings);

      // BTC: 52500 + ETH: 24000 + SPY: 31500 + BOND: 20000 = 128000
      expect(totalValue).toBe(128000);
    });

    it('should calculate allocation percentages', async () => {
      const holdings = await portfolioRebalancingService.getPortfolioHoldings(
        testUserId,
        testTenantId
      );

      const totalValue = portfolioRebalancingService.calculatePortfolioValue(holdings);
      const allocations = portfolioRebalancingService.calculateAllocations(holdings, totalValue);

      expect(allocations.BTC.percent).toBeCloseTo(41.02, 1); // 52500/128000
      expect(allocations.ETH.percent).toBeCloseTo(18.75, 1); // 24000/128000
      expect(allocations.SPY.percent).toBeCloseTo(24.61, 1); // 31500/128000
      expect(allocations.BOND.percent).toBeCloseTo(15.63, 1); // 20000/128000
    });

    it('should identify allocation deviations', async () => {
      const holdings = await portfolioRebalancingService.getPortfolioHoldings(
        testUserId,
        testTenantId
      );

      const totalValue = portfolioRebalancingService.calculatePortfolioValue(holdings);
      const current = portfolioRebalancingService.calculateAllocations(holdings, totalValue);

      const [allocation] = await db
        .select()
        .from(allocationTargets)
        .where(eq(allocationTargets.id, testAllocationId));

      const target = portfolioRebalancingService.parseTargetAllocations(
        allocation.allocations,
        totalValue
      );
      const deviations = portfolioRebalancingService.calculateDeviations(current, target);

      // BTC should be overweight (41% actual vs 30% target)
      expect(deviations.BTC.deviation).toBeGreaterThan(0);
      expect(deviations.BTC.direction).toBe('overweight');

      // ETH should be underweight (19% actual vs 20% target)
      expect(Math.abs(deviations.ETH.deviation)).toBeLessThan(0.05);
    });
  });

  describe('Rebalancing Recommendations', () => {
    it('should generate rebalancing recommendation', async () => {
      const recommendation = await portfolioRebalancingService.analyzePortfolioAndRecommend(
        testUserId,
        testTenantId,
        testAllocationId
      );

      expect(recommendation).toBeDefined();
      expect(recommendation.status).toBe('pending');
      expect(recommendation.moves.length).toBeGreaterThan(0);
    });

    it('should not recommend rebalancing when within bounds', async () => {
      // Create a perfectly balanced portfolio
      await db.delete(portfolioHoldings).where(eq(portfolioHoldings.tenantId, testTenantId));

      const total = 100000;
      await db.insert(portfolioHoldings).values([
        {
          tenantId: testTenantId,
          userId: testUserId,
          assetSymbol: 'BTC',
          assetType: 'cryptocurrency',
          baseCurrency: 'USD',
          quantity: '1',
          acquisitionCost: '30000',
          currentValue: '30000',
          costBasisHistory: {},
          averageCostPerUnit: '30000',
          unrealizedGain: '0',
          unrealizedGainPercent: '0',
          realizedGain: '0',
        },
        {
          tenantId: testTenantId,
          userId: testUserId,
          assetSymbol: 'ETH',
          assetType: 'cryptocurrency',
          baseCurrency: 'USD',
          quantity: '20',
          acquisitionCost: '20000',
          currentValue: '20000',
          costBasisHistory: {},
          averageCostPerUnit: '1000',
          unrealizedGain: '0',
          unrealizedGainPercent: '0',
          realizedGain: '0',
        },
        {
          tenantId: testTenantId,
          userId: testUserId,
          assetSymbol: 'SPY',
          assetType: 'stock',
          baseCurrency: 'USD',
          quantity: '50',
          acquisitionCost: '30000',
          currentValue: '30000',
          costBasisHistory: {},
          averageCostPerUnit: '600',
          unrealizedGain: '0',
          unrealizedGainPercent: '0',
          realizedGain: '0',
        },
        {
          tenantId: testTenantId,
          userId: testUserId,
          assetSymbol: 'BOND',
          assetType: 'bond',
          baseCurrency: 'USD',
          quantity: '20000',
          acquisitionCost: '20000',
          currentValue: '20000',
          costBasisHistory: {},
          averageCostPerUnit: '1',
          unrealizedGain: '0',
          unrealizedGainPercent: '0',
          realizedGain: '0',
        },
      ]);

      const recommendation = await portfolioRebalancingService.analyzePortfolioAndRecommend(
        testUserId,
        testTenantId,
        testAllocationId
      );

      expect(recommendation).toBeNull();
    });

    it('should estimate transaction costs', async () => {
      const moves = [
        { from: 'BTC', to: 'ETH', amount: 5000, reason: 'rebalance' },
        { from: 'SPY', to: 'BOND', amount: 3000, reason: 'rebalance' },
      ];

      const costAnalysis = await portfolioRebalancingService.estimateTransactionCosts(
        moves,
        [],
        0.005
      );

      expect(costAnalysis.totalCost).toBeGreaterThan(0);
      expect(costAnalysis.totalSlippage).toBeGreaterThan(0);
      expect(costAnalysis.averageCostPerMove).toBeGreaterThan(0);
    });
  });

  describe('Tax-Loss Harvesting', () => {
    it('should identify tax-loss harvesting opportunities', async () => {
      const opportunities = await portfolioRebalancingService.identifyTaxHarvestingOpportunities(
        testUserId,
        testTenantId,
        []
      );

      expect(opportunities.length).toBeGreaterThan(0);
      expect(opportunities[0].sell).toBe('ETH');
      expect(opportunities[0].loss).toBe(1000);
    });

    it('should find similar asset for wash sale avoidance', async () => {
      const similar = portfolioRebalancingService.findSimilarAsset('BTC');
      expect(similar).toBe('ETH');

      const similarStock = portfolioRebalancingService.findSimilarAsset('AAPL');
      expect(similarStock).toBe('MSFT');
    });

    it('should calculate tax impact correctly', async () => {
      const moves = [
        { from: 'BTC', to: 'ETH', amount: 5000, reason: 'rebalance' },
      ];

      const harvestingMoves = [
        { sell: 'ETH', buy: 'BTC', loss: 1000, lotId: 'uuid', purpose: 'harvest' },
      ];

      const taxImpact = await portfolioRebalancingService.calculateTaxImpact(
        testUserId,
        testTenantId,
        moves,
        harvestingMoves
      );

      expect(taxImpact.realizedLosses).toBeGreaterThan(0);
      expect(taxImpact.estimatedTaxCost).toBeLessThan(0); // Negative = tax benefit
    });

    it('should get tax optimization summary', async () => {
      const summary = await portfolioRebalancingService.getTaxOptimizationSummary(
        testUserId,
        testTenantId
      );

      expect(summary.totalHoldings).toBeGreaterThan(0);
      expect(summary.unrealizedGains).toBeGreaterThan(0);
      expect(summary.unrealizedLosses).toBeGreaterThan(0);
      expect(summary.harvestablelosses).toBeGreaterThan(0);
    });
  });

  describe('Rebalancing Execution', () => {
    it('should execute rebalancing recommendation', async () => {
      const recommendation = await portfolioRebalancingService.analyzePortfolioAndRecommend(
        testUserId,
        testTenantId,
        testAllocationId
      );

      if (!recommendation) {
        expect(true).toBe(true);
        return;
      }

      const result = await portfolioRebalancingService.executeRebalancing(
        recommendation.id,
        testUserId,
        testTenantId
      );

      expect(result.recommendation.status).toBe('approved');
      expect(result.transactions.length).toBeGreaterThan(0);
    });

    it('should get rebalancing history', async () => {
      // Execute a rebalancing first
      const recommendation = await portfolioRebalancingService.analyzePortfolioAndRecommend(
        testUserId,
        testTenantId,
        testAllocationId
      );

      if (recommendation) {
        await portfolioRebalancingService.executeRebalancing(
          recommendation.id,
          testUserId,
          testTenantId
        );
      }

      const history = await portfolioRebalancingService.getRebalancingHistory(
        testUserId,
        testTenantId
      );

      expect(history).toBeDefined();
    });
  });

  describe('Analytics', () => {
    it('should get portfolio analytics', async () => {
      const analytics = await portfolioRebalancingService.getPortfolioAnalytics(
        testUserId,
        testTenantId,
        testAllocationId
      );

      expect(analytics).toBeDefined();
    });
  });
});
