import db from '../config/db.js';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { benchmarkPrices, fixedAssets, portfolioSnapshots } from '../db/schema.js';

class PortfolioAnalyticsService {
  constructor() {
    this.riskFreeRate = 0.045;
    this.tradingDays = 252;
  }

  resolveDateRange({ startDate, endDate, period = '1y' }) {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end);

    if (!startDate) {
      if (period === '1m') start.setMonth(end.getMonth() - 1);
      else if (period === '3m') start.setMonth(end.getMonth() - 3);
      else if (period === '6m') start.setMonth(end.getMonth() - 6);
      else if (period === 'ytd') start.setMonth(0, 1);
      else if (period === '3y') start.setFullYear(end.getFullYear() - 3);
      else start.setFullYear(end.getFullYear() - 1);
    }

    return { start, end };
  }

  async getPortfolioSnapshots(userId, start, end) {
    return db
      .select()
      .from(portfolioSnapshots)
      .where(
        and(
          eq(portfolioSnapshots.userId, userId),
          gte(portfolioSnapshots.snapshotDate, start),
          lte(portfolioSnapshots.snapshotDate, end)
        )
      )
      .orderBy(asc(portfolioSnapshots.snapshotDate));
  }

  calculateReturnSeries(snapshots) {
    const series = [];

    for (let index = 1; index < snapshots.length; index += 1) {
      const prev = snapshots[index - 1];
      const curr = snapshots[index];

      const prevValue = parseFloat(prev.totalValue || 0);
      const currValue = parseFloat(curr.totalValue || 0);
      const prevDeposits = parseFloat(prev.netDeposits || 0);
      const currDeposits = parseFloat(curr.netDeposits || 0);
      const flow = currDeposits - prevDeposits;

      if (prevValue <= 0) continue;

      const valueReturn = (currValue - prevValue - flow) / prevValue;
      series.push({
        date: curr.snapshotDate,
        return: valueReturn,
      });
    }

    return series;
  }

  calculateRiskMetrics(returnSeries) {
    if (returnSeries.length < 2) {
      return {
        volatility: 0,
        annualizedVolatility: 0,
        sharpeRatio: 0,
        maxDrawdown: 0,
      };
    }

    const returns = returnSeries.map((point) => point.return);
    const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
    const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
    const volatility = Math.sqrt(Math.max(variance, 0));
    const annualizedVolatility = volatility * Math.sqrt(this.tradingDays);
    const annualizedReturn = mean * this.tradingDays;
    const sharpeRatio = annualizedVolatility > 0
      ? (annualizedReturn - this.riskFreeRate) / annualizedVolatility
      : 0;

    let cumulative = 1;
    let peak = 1;
    let maxDrawdown = 0;

    for (const point of returnSeries) {
      cumulative *= 1 + point.return;
      peak = Math.max(peak, cumulative);
      const drawdown = (cumulative - peak) / peak;
      maxDrawdown = Math.min(maxDrawdown, drawdown);
    }

    return {
      volatility,
      annualizedVolatility,
      sharpeRatio,
      maxDrawdown,
    };
  }

  async getBenchmarkSeries(symbol, start, end) {
    return db
      .select()
      .from(benchmarkPrices)
      .where(
        and(
          eq(benchmarkPrices.benchmarkSymbol, symbol),
          gte(benchmarkPrices.priceDate, start),
          lte(benchmarkPrices.priceDate, end)
        )
      )
      .orderBy(asc(benchmarkPrices.priceDate));
  }

  calculateBenchmarkReturns(prices) {
    const returns = [];

    for (let index = 1; index < prices.length; index += 1) {
      const prev = parseFloat(prices[index - 1].closePrice || 0);
      const curr = parseFloat(prices[index].closePrice || 0);
      if (prev <= 0) continue;

      returns.push({
        date: prices[index].priceDate,
        return: (curr - prev) / prev,
      });
    }

    return returns;
  }

  alignReturnSeries(portfolioReturns, benchmarkReturns) {
    const benchmarkMap = new Map(
      benchmarkReturns.map((point) => [new Date(point.date).toISOString().slice(0, 10), point.return])
    );

    const alignedPortfolio = [];
    const alignedBenchmark = [];

    for (const point of portfolioReturns) {
      const key = new Date(point.date).toISOString().slice(0, 10);
      if (benchmarkMap.has(key)) {
        alignedPortfolio.push(point.return);
        alignedBenchmark.push(benchmarkMap.get(key));
      }
    }

    return { alignedPortfolio, alignedBenchmark };
  }

  calculateCorrelation(valuesA, valuesB) {
    if (valuesA.length !== valuesB.length || valuesA.length < 2) return 0;

    const meanA = valuesA.reduce((sum, value) => sum + value, 0) / valuesA.length;
    const meanB = valuesB.reduce((sum, value) => sum + value, 0) / valuesB.length;

    let covariance = 0;
    let varianceA = 0;
    let varianceB = 0;

    for (let index = 0; index < valuesA.length; index += 1) {
      const deltaA = valuesA[index] - meanA;
      const deltaB = valuesB[index] - meanB;
      covariance += deltaA * deltaB;
      varianceA += deltaA * deltaA;
      varianceB += deltaB * deltaB;
    }

    const denominator = Math.sqrt(varianceA * varianceB);
    if (denominator === 0) return 0;

    return covariance / denominator;
  }

  calculateBeta(portfolioValues, benchmarkValues) {
    if (portfolioValues.length !== benchmarkValues.length || portfolioValues.length < 2) return 0;

    const meanPortfolio = portfolioValues.reduce((sum, value) => sum + value, 0) / portfolioValues.length;
    const meanBenchmark = benchmarkValues.reduce((sum, value) => sum + value, 0) / benchmarkValues.length;

    let covariance = 0;
    let benchmarkVariance = 0;

    for (let index = 0; index < portfolioValues.length; index += 1) {
      covariance += (portfolioValues[index] - meanPortfolio) * (benchmarkValues[index] - meanBenchmark);
      benchmarkVariance += (benchmarkValues[index] - meanBenchmark) ** 2;
    }

    if (benchmarkVariance === 0) return 0;
    return covariance / benchmarkVariance;
  }

  classifyAssetClass(category = '') {
    const normalized = category.toLowerCase();
    if (normalized.includes('stock') || normalized.includes('equity')) return 'equities';
    if (normalized.includes('bond') || normalized.includes('fixed')) return 'fixed_income';
    if (normalized.includes('crypto') || normalized.includes('bitcoin')) return 'crypto';
    if (normalized.includes('cash')) return 'cash';
    if (normalized.includes('real')) return 'real_estate';
    return 'alternatives';
  }

  async buildAttribution(userId) {
    const assets = await db
      .select()
      .from(fixedAssets)
      .where(eq(fixedAssets.userId, userId));

    const totalValue = assets.reduce((sum, item) => sum + parseFloat(item.currentValue || 0), 0);

    const byHolding = assets.map((item) => {
      const beginningValue = parseFloat(item.purchasePrice || 0);
      const endingValue = parseFloat(item.currentValue || 0);
      const gain = endingValue - beginningValue;
      const totalReturn = beginningValue > 0 ? gain / beginningValue : 0;
      const weight = totalValue > 0 ? endingValue / totalValue : 0;
      const contribution = weight * totalReturn;

      return {
        assetId: item.id,
        name: item.name,
        category: item.category,
        beginningValue,
        endingValue,
        gain,
        totalReturn,
        weight,
        contributionToReturn: contribution,
      };
    }).sort((left, right) => right.contributionToReturn - left.contributionToReturn);

    const bySectorMap = new Map();
    const byAssetClassMap = new Map();

    for (const row of byHolding) {
      const sector = row.category || 'other';
      const assetClass = this.classifyAssetClass(sector);

      if (!bySectorMap.has(sector)) {
        bySectorMap.set(sector, {
          categoryName: sector,
          endingValue: 0,
          gain: 0,
          contributionToReturn: 0,
        });
      }

      if (!byAssetClassMap.has(assetClass)) {
        byAssetClassMap.set(assetClass, {
          categoryName: assetClass,
          endingValue: 0,
          gain: 0,
          contributionToReturn: 0,
        });
      }

      const sectorBucket = bySectorMap.get(sector);
      sectorBucket.endingValue += row.endingValue;
      sectorBucket.gain += row.gain;
      sectorBucket.contributionToReturn += row.contributionToReturn;

      const assetClassBucket = byAssetClassMap.get(assetClass);
      assetClassBucket.endingValue += row.endingValue;
      assetClassBucket.gain += row.gain;
      assetClassBucket.contributionToReturn += row.contributionToReturn;
    }

    return {
      totalValue,
      byHolding,
      bySector: Array.from(bySectorMap.values()).sort((left, right) => right.contributionToReturn - left.contributionToReturn),
      byAssetClass: Array.from(byAssetClassMap.values()).sort((left, right) => right.contributionToReturn - left.contributionToReturn),
    };
  }

  async getPerformanceAttribution(userId, { startDate, endDate, period }) {
    const { start, end } = this.resolveDateRange({ startDate, endDate, period });
    const snapshots = await this.getPortfolioSnapshots(userId, start, end);
    const returns = this.calculateReturnSeries(snapshots);
    const attribution = await this.buildAttribution(userId);

    const startValue = snapshots.length > 0 ? parseFloat(snapshots[0].totalValue || 0) : 0;
    const endValue = snapshots.length > 0 ? parseFloat(snapshots[snapshots.length - 1].totalValue || 0) : attribution.totalValue;
    const portfolioReturn = startValue > 0 ? (endValue - startValue) / startValue : 0;

    return {
      period: { start, end },
      portfolio: {
        startValue,
        endValue,
        totalReturn: portfolioReturn,
      },
      snapshotsCount: snapshots.length,
      attribution,
      timeSeries: snapshots.map((row) => ({
        date: row.snapshotDate,
        totalValue: parseFloat(row.totalValue || 0),
        dailyChangePercent: parseFloat(row.dailyChangePercent || 0),
      })),
      dailyReturns: returns,
    };
  }

  async getRiskAndBenchmark(userId, { startDate, endDate, period, benchmark = '^GSPC' }) {
    const { start, end } = this.resolveDateRange({ startDate, endDate, period });

    const snapshots = await this.getPortfolioSnapshots(userId, start, end);
    const portfolioReturns = this.calculateReturnSeries(snapshots);
    const risk = this.calculateRiskMetrics(portfolioReturns);

    let portfolioTotalReturn = 0;
    if (snapshots.length > 1) {
      const first = parseFloat(snapshots[0].totalValue || 0);
      const last = parseFloat(snapshots[snapshots.length - 1].totalValue || 0);
      portfolioTotalReturn = first > 0 ? (last - first) / first : 0;
    }

    const benchmarkSeries = await this.getBenchmarkSeries(benchmark, start, end);
    const benchmarkReturns = this.calculateBenchmarkReturns(benchmarkSeries);

    const { alignedPortfolio, alignedBenchmark } = this.alignReturnSeries(portfolioReturns, benchmarkReturns);
    const correlation = this.calculateCorrelation(alignedPortfolio, alignedBenchmark);
    const beta = this.calculateBeta(alignedPortfolio, alignedBenchmark);

    let benchmarkTotalReturn = 0;
    if (benchmarkSeries.length > 1) {
      const first = parseFloat(benchmarkSeries[0].closePrice || 0);
      const last = parseFloat(benchmarkSeries[benchmarkSeries.length - 1].closePrice || 0);
      benchmarkTotalReturn = first > 0 ? (last - first) / first : 0;
    }

    const alpha = portfolioTotalReturn - (this.riskFreeRate + beta * (benchmarkTotalReturn - this.riskFreeRate));

    return {
      period: { start, end },
      benchmark,
      snapshotsCount: snapshots.length,
      benchmarkPoints: benchmarkSeries.length,
      portfolioReturn: portfolioTotalReturn,
      benchmarkReturn: benchmarkTotalReturn,
      relativeReturn: portfolioTotalReturn - benchmarkTotalReturn,
      riskMetrics: risk,
      marketMetrics: {
        beta,
        alpha,
        correlation,
      },
    };
  }

  async getBenchmarksCatalog() {
    const rows = await db
      .select()
      .from(benchmarkPrices)
      .orderBy(desc(benchmarkPrices.priceDate));

    const seen = new Set();
    const symbols = [];

    for (const row of rows) {
      if (seen.has(row.benchmarkSymbol)) continue;
      seen.add(row.benchmarkSymbol);
      symbols.push({
        symbol: row.benchmarkSymbol,
        name: row.benchmarkName,
      });
    }

    return symbols;
  }
}

export default new PortfolioAnalyticsService();
