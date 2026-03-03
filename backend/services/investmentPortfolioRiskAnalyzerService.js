const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, decimals = 2) => {
  const factor = 10 ** decimals;
  return Math.round((toNumber(value, 0) + Number.EPSILON) * factor) / factor;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const VOL_BY_ASSET_CLASS = {
  equity: 0.18,
  stock: 0.18,
  etf: 0.14,
  mutual_fund: 0.12,
  bond: 0.06,
  fixed_income: 0.06,
  crypto: 0.55,
  cash: 0.01,
  commodity: 0.2,
  reit: 0.16,
  alternative: 0.22
};

const DRAWDOWN_BY_ASSET_CLASS = {
  equity: { mild: -0.1, moderate: -0.2, severe: -0.35 },
  stock: { mild: -0.1, moderate: -0.2, severe: -0.35 },
  etf: { mild: -0.08, moderate: -0.18, severe: -0.3 },
  mutual_fund: { mild: -0.07, moderate: -0.15, severe: -0.25 },
  bond: { mild: -0.03, moderate: -0.07, severe: -0.12 },
  fixed_income: { mild: -0.03, moderate: -0.07, severe: -0.12 },
  crypto: { mild: -0.25, moderate: -0.45, severe: -0.7 },
  cash: { mild: 0, moderate: 0, severe: 0 },
  commodity: { mild: -0.12, moderate: -0.25, severe: -0.4 },
  reit: { mild: -0.12, moderate: -0.24, severe: -0.4 },
  alternative: { mild: -0.11, moderate: -0.22, severe: -0.35 }
};

const TARGET_LIMITS = {
  conservative: { maxSingle: 0.15, maxSector: 0.28, maxClass: 0.65 },
  moderate: { maxSingle: 0.2, maxSector: 0.35, maxClass: 0.75 },
  aggressive: { maxSingle: 0.28, maxSector: 0.45, maxClass: 0.88 }
};

class InvestmentPortfolioRiskAnalyzerService {
  normalizeHolding(raw = {}) {
    const currentValue = toNumber(
      raw.currentValue,
      toNumber(raw.marketValue, toNumber(raw.quantity, 0) * toNumber(raw.currentPrice, toNumber(raw.averageCost, 0)))
    );

    return {
      id: raw.id || raw.symbol || `asset_${Math.random().toString(36).slice(2, 8)}`,
      symbol: String(raw.symbol || raw.ticker || raw.name || 'ASSET').toUpperCase(),
      assetClass: String(raw.assetClass || raw.type || 'equity').toLowerCase(),
      sector: String(raw.sector || 'unclassified').toLowerCase(),
      country: String(raw.country || 'us').toLowerCase(),
      currentValue: Math.max(0, currentValue)
    };
  }

  bucketWeights(holdings, key) {
    const total = holdings.reduce((sum, h) => sum + h.currentValue, 0) || 1;
    return holdings.reduce((acc, h) => {
      const bucket = h[key] || 'unknown';
      acc[bucket] = (acc[bucket] || 0) + (h.currentValue / total);
      return acc;
    }, {});
  }

  hhi(weightsObj) {
    return Object.values(weightsObj).reduce((sum, w) => sum + (w * w), 0);
  }

  portfolioVolatility(holdings) {
    const total = holdings.reduce((sum, h) => sum + h.currentValue, 0) || 1;
    const variance = holdings.reduce((sum, h) => {
      const w = h.currentValue / total;
      const vol = VOL_BY_ASSET_CLASS[h.assetClass] ?? 0.18;
      return sum + (w * w * vol * vol);
    }, 0);

    return Math.sqrt(variance);
  }

  stressTest(holdings) {
    const total = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const scenarios = ['mild', 'moderate', 'severe'];
    const results = {};

    scenarios.forEach((scenario) => {
      const loss = holdings.reduce((sum, h) => {
        const dd = (DRAWDOWN_BY_ASSET_CLASS[h.assetClass] || DRAWDOWN_BY_ASSET_CLASS.equity)[scenario];
        return sum + (h.currentValue * Math.abs(dd));
      }, 0);

      results[scenario] = {
        estimatedLoss: round(loss, 2),
        estimatedLossPct: total > 0 ? round((loss / total) * 100, 2) : 0,
        estimatedPostStressValue: round(total - loss, 2)
      };
    });

    return results;
  }

  buildRiskClusters(weights) {
    return Object.entries(weights)
      .filter(([, w]) => w >= 0.25)
      .sort((a, b) => b[1] - a[1])
      .map(([bucket, w]) => ({
        bucket,
        exposurePct: round(w * 100, 2),
        severity: w >= 0.4 ? 'high' : 'medium'
      }));
  }

  buildRecommendations(analysis, riskTolerance) {
    const limits = TARGET_LIMITS[riskTolerance] || TARGET_LIMITS.moderate;
    const recs = [];

    if (analysis.concentration.maxSinglePositionPct / 100 > limits.maxSingle) {
      recs.push('Reduce the largest single position and spread exposure across at least 2-4 additional holdings.');
    }
    if (analysis.riskClusters.bySector.some((c) => c.exposurePct / 100 > limits.maxSector)) {
      recs.push('Lower sector concentration by reallocating to underweight sectors or broad-market funds.');
    }
    if (analysis.riskClusters.byAssetClass.some((c) => c.exposurePct / 100 > limits.maxClass)) {
      recs.push('Rebalance asset-class concentration to align with your risk tolerance profile.');
    }
    if (analysis.volatility.annualizedVolatilityPct > (riskTolerance === 'conservative' ? 10 : riskTolerance === 'moderate' ? 16 : 24)) {
      recs.push('Portfolio volatility is elevated for your profile; increase stabilizers like bonds/cash.');
    }
    if (analysis.diversification.effectiveHoldings < 8) {
      recs.push('Increase diversification; effective holdings are low and concentration risk is high.');
    }
    if (analysis.stressScenarios.severe.estimatedLossPct > (riskTolerance === 'conservative' ? 20 : 30)) {
      recs.push('Severe stress test loss is high; consider defensive hedges and gradual de-risking.');
    }

    if (!recs.length) {
      recs.push('Portfolio risk appears aligned; monitor monthly and rebalance on drift thresholds.');
    }

    return recs;
  }

  analyze(holdingsInput = [], options = {}) {
    const riskTolerance = String(options.riskTolerance || 'moderate').toLowerCase();
    const holdings = (holdingsInput || []).map((h) => this.normalizeHolding(h)).filter((h) => h.currentValue > 0);

    if (!holdings.length) {
      return {
        success: true,
        summary: null,
        riskScore: 0,
        diversification: null,
        volatility: null,
        concentration: null,
        riskClusters: { byAssetClass: [], bySector: [], byCountry: [] },
        stressScenarios: {},
        rebalancingRecommendations: [],
        message: 'No holdings available for risk analysis.'
      };
    }

    const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
    const assetClassWeights = this.bucketWeights(holdings, 'assetClass');
    const sectorWeights = this.bucketWeights(holdings, 'sector');
    const countryWeights = this.bucketWeights(holdings, 'country');

    const singleWeights = holdings
      .map((h) => ({ symbol: h.symbol, weight: h.currentValue / totalValue }))
      .sort((a, b) => b.weight - a.weight);

    const maxSingle = singleWeights[0]?.weight || 0;
    const hhiAssets = this.hhi(assetClassWeights);
    const hhiSectors = this.hhi(sectorWeights);
    const hhiPositions = singleWeights.reduce((sum, p) => sum + (p.weight * p.weight), 0);

    const effectiveHoldings = hhiPositions > 0 ? (1 / hhiPositions) : holdings.length;
    const annualVol = this.portfolioVolatility(holdings);

    const diversificationScore = clamp(
      100
      - (maxSingle * 120)
      - (Math.max(0, hhiSectors - 0.2) * 90)
      - (Math.max(0, hhiAssets - 0.3) * 70),
      0,
      100
    );

    const volatilityScore = clamp(100 - (annualVol * 350), 0, 100);
    const stress = this.stressTest(holdings);
    const severeLossPct = stress.severe.estimatedLossPct;

    const stressScore = clamp(100 - (severeLossPct * 2.2), 0, 100);
    const concentrationScore = clamp(100 - ((maxSingle * 100) * 1.9), 0, 100);

    const riskScore = round(100 - (
      (diversificationScore * 0.25) +
      (volatilityScore * 0.3) +
      (stressScore * 0.25) +
      (concentrationScore * 0.2)
    ), 2);

    const analysis = {
      success: true,
      summary: {
        holdingCount: holdings.length,
        totalValue: round(totalValue, 2),
        riskTolerance,
        topHoldings: singleWeights.slice(0, 5).map((h) => ({
          symbol: h.symbol,
          weightPct: round(h.weight * 100, 2)
        }))
      },
      riskScore,
      diversification: {
        diversificationScore: round(diversificationScore, 2),
        effectiveHoldings: round(effectiveHoldings, 2),
        hhiByAssetClass: round(hhiAssets, 4),
        hhiBySector: round(hhiSectors, 4),
        hhiByPosition: round(hhiPositions, 4)
      },
      volatility: {
        annualizedVolatilityPct: round(annualVol * 100, 2),
        volatilityScore: round(volatilityScore, 2)
      },
      concentration: {
        maxSinglePositionPct: round(maxSingle * 100, 2),
        concentrationScore: round(concentrationScore, 2)
      },
      riskClusters: {
        byAssetClass: this.buildRiskClusters(assetClassWeights),
        bySector: this.buildRiskClusters(sectorWeights),
        byCountry: this.buildRiskClusters(countryWeights)
      },
      stressScenarios: stress
    };

    return {
      ...analysis,
      rebalancingRecommendations: this.buildRecommendations(analysis, riskTolerance)
    };
  }
}

export default new InvestmentPortfolioRiskAnalyzerService();
