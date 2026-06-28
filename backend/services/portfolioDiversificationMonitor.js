// Portfolio Diversification Monitor Service
// Issue #878: Detect over-concentration and recommend diversification


import { AllocationRecommender } from './allocationRecommender.js';
import { db } from '../db/index.js';
import { userProfiles, assetClassAllocations, diversificationTrends } from '../db/schema.js';

/**
 * Portfolio Diversification Monitor - Comprehensive Service
 * Issue #878: Detect over-concentration, analyze trends, risk, and recommend actions
 */
class PortfolioDiversificationMonitor {
    constructor() {
        this.recommender = new AllocationRecommender();
        this.concentrationThreshold = 0.4; // 40%
        this.riskThresholds = {
            equities: 0.5,
            bonds: 0.5,
            cash: 0.5,
            alternatives: 0.3,
            real_estate: 0.3,
            commodities: 0.3,
        };
    }

    /**
     * Analyze user's portfolio for diversification
     * @param {object} assetAllocations - { equities: 0.5, bonds: 0.3, ... }
     * @returns {object} Diversification analysis and recommendations
     */
    analyzeDiversification(assetAllocations) {
        const overConcentrated = [];
        for (const [asset, percent] of Object.entries(assetAllocations)) {
            if (percent > (this.riskThresholds[asset] || this.concentrationThreshold)) {
                overConcentrated.push({ asset, percent });
            }
        }
        const isDiversified = overConcentrated.length === 0;
        let recommendation = null;
        if (!isDiversified) {
            recommendation = 'Reduce exposure to: ' + overConcentrated.map(a => `${a.asset} (${(a.percent*100).toFixed(1)}%)`).join(', ') + '. Consider rebalancing.';
        } else {
            recommendation = 'Portfolio is well diversified.';
        }
        return {
            isDiversified,
            overConcentrated,
            recommendation,
            trendData: assetAllocations, // For visualization
        };
    }

    /**
     * Calculate risk exposure for each asset class
     * @param {object} assetAllocations
     * @returns {object} Risk exposure details
     */
    calculateRiskExposure(assetAllocations) {
        const exposures = {};
        for (const asset in assetAllocations) {
            const percent = assetAllocations[asset];
            const volatility = this.recommender.assetVolatility[asset] || 0.1;
            exposures[asset] = {
                percent,
                volatility,
                riskScore: percent * volatility,
            };
        }
        return exposures;
    }

    /**
     * Analyze sector concentration
     * @param {object} sectorAllocations - { tech: 0.4, finance: 0.2, ... }
     */
    analyzeSectorConcentration(sectorAllocations) {
        const threshold = 0.35;
        const overConcentrated = Object.entries(sectorAllocations)
            .filter(([sector, percent]) => percent > threshold)
            .map(([sector, percent]) => ({ sector, percent }));
        return {
            overConcentrated,
            isDiversified: overConcentrated.length === 0,
        };
    }

    /**
     * Analyze region concentration
     * @param {object} regionAllocations - { US: 0.5, EU: 0.3, Asia: 0.2 }
     */
    analyzeRegionConcentration(regionAllocations) {
        const threshold = 0.5;
        const overConcentrated = Object.entries(regionAllocations)
            .filter(([region, percent]) => percent > threshold)
            .map(([region, percent]) => ({ region, percent }));
        return {
            overConcentrated,
            isDiversified: overConcentrated.length === 0,
        };
    }

    /**
     * Analyze currency concentration
     * @param {object} currencyAllocations - { USD: 0.7, EUR: 0.2, JPY: 0.1 }
     */
    analyzeCurrencyConcentration(currencyAllocations) {
        const threshold = 0.6;
        const overConcentrated = Object.entries(currencyAllocations)
            .filter(([currency, percent]) => percent > threshold)
            .map(([currency, percent]) => ({ currency, percent }));
        return {
            overConcentrated,
            isDiversified: overConcentrated.length === 0,
        };
    }

    /**
     * Stress test portfolio under market scenarios
     * @param {object} assetAllocations
     * @returns {object} Stress test results
     */
    stressTestPortfolio(assetAllocations) {
        // Example scenarios: market crash, bond rally, commodity spike
        const scenarios = [
            {
                name: 'Equity Market Crash',
                impact: { equities: -0.3, bonds: 0.05, cash: 0.01, alternatives: -0.1, real_estate: -0.15, commodities: 0.02 },
            },
            {
                name: 'Bond Rally',
                impact: { equities: -0.05, bonds: 0.15, cash: 0.01, alternatives: 0.02, real_estate: 0.01, commodities: -0.01 },
            },
            {
                name: 'Commodity Spike',
                impact: { equities: -0.02, bonds: -0.01, cash: 0, alternatives: 0.03, real_estate: 0.01, commodities: 0.2 },
            },
        ];
        const results = scenarios.map(scenario => {
            let totalImpact = 0;
            for (const asset in assetAllocations) {
                totalImpact += (assetAllocations[asset] || 0) * (scenario.impact[asset] || 0);
            }
            return {
                scenario: scenario.name,
                estimatedPortfolioChange: totalImpact,
            };
        });
        return results;
    }

    /**
     * Automated alert if over-concentration detected
     * @param {object} analysis
     * @returns {string|null} Alert message
     */
    generateAlert(analysis) {
        if (!analysis.isDiversified && analysis.overConcentrated.length > 0) {
            return `Alert: Over-concentration detected in ${analysis.overConcentrated.map(a => a.asset).join(', ')}.`;
        }
        return null;
    }

    /**
     * Integration hook for external data sources (stub)
     * @param {string} sourceName
     * @returns {Promise<object>} External data
     */
    async fetchExternalData(sourceName) {
        // Stub: Replace with actual API call
        return { source: sourceName, data: {} };
    }

    /**
     * Detailed logging utility
     * @param {string} message
     * @param {object} [data]
     */
    log(message, data = null) {
        if (data) {
            console.log(`[PortfolioMonitor] ${message}`, data);
        } else {
            console.log(`[PortfolioMonitor] ${message}`);
        }
    }

    /**
     * Extended unit test: test all analytics
     */
    static extendedTest() {
        const monitor = new PortfolioDiversificationMonitor();
        const mockAlloc = {
            equities: 0.65,
            bonds: 0.15,
            cash: 0.1,
            alternatives: 0.05,
            real_estate: 0.03,
            commodities: 0.02,
        };
        const sectorAlloc = { tech: 0.4, finance: 0.2, healthcare: 0.2, energy: 0.2 };
        const regionAlloc = { US: 0.5, EU: 0.3, Asia: 0.2 };
        const currencyAlloc = { USD: 0.7, EUR: 0.2, JPY: 0.1 };
        const analysis = monitor.analyzeDiversification(mockAlloc);
        const sectorAnalysis = monitor.analyzeSectorConcentration(sectorAlloc);
        const regionAnalysis = monitor.analyzeRegionConcentration(regionAlloc);
        const currencyAnalysis = monitor.analyzeCurrencyConcentration(currencyAlloc);
        const stress = monitor.stressTestPortfolio(mockAlloc);
        const alert = monitor.generateAlert(analysis);
        monitor.log('Unit test log', { analysis, sectorAnalysis, regionAnalysis, currencyAnalysis, stress, alert });
        return { analysis, sectorAnalysis, regionAnalysis, currencyAnalysis, stress, alert };
    }

    /**
     * Recommend diversification actions
     * @param {object} assetAllocations
     * @param {string} riskLevel
     * @returns {string[]} List of recommended actions
     */
    recommendActions(assetAllocations, riskLevel) {
        const actions = [];
        for (const [asset, percent] of Object.entries(assetAllocations)) {
            if (percent > (this.riskThresholds[asset] || this.concentrationThreshold)) {
                actions.push(`Reduce ${asset} to below ${(this.riskThresholds[asset]||this.concentrationThreshold)*100}%`);
            }
        }
        if (actions.length === 0) {
            actions.push('Maintain current allocation.');
        }
        // Suggest new asset classes if missing
        for (const asset of Object.keys(this.riskThresholds)) {
            if (!(asset in assetAllocations)) {
                actions.push(`Consider adding ${asset} for better diversification.`);
            }
        }
        return actions;
    }

    /**
     * Analyze historical diversification trends
     * @param {string} userId
     * @returns {Promise<object[]>} Array of trend data
     */
    async getDiversificationTrends(userId) {
        // Fetch from DB (mocked for now)
        // Replace with actual DB query
        return [
            { date: '2026-02-01', equities: 0.6, bonds: 0.2, cash: 0.1, alternatives: 0.05, real_estate: 0.03, commodities: 0.02 },
            { date: '2026-03-01', equities: 0.5, bonds: 0.3, cash: 0.1, alternatives: 0.05, real_estate: 0.03, commodities: 0.02 },
        ];
    }

    /**
     * Prepare data for visualization (e.g., pie, line charts)
     * @param {object} assetAllocations
     * @returns {object} Chart-ready data
     */
    getVisualizationData(assetAllocations) {
        return {
            labels: Object.keys(assetAllocations),
            values: Object.values(assetAllocations),
        };
    }

    /**
     * Full monitor: fetch allocation, analyze, recommend, and visualize
     * @param {string} userId
     * @param {string} vaultId
     */
    async monitorUserPortfolio(userId, vaultId = null) {
        // Get recommended allocation
        const rec = await this.recommender.recommendAllocation(userId, vaultId);
        const allocation = rec.recommendation.allocation;
        const analysis = this.analyzeDiversification(allocation);
        const riskExposure = this.calculateRiskExposure(allocation);
        const actions = this.recommendActions(allocation, rec.analysis.riskLevel);
        const trends = await this.getDiversificationTrends(userId);
        const visualization = this.getVisualizationData(allocation);
        return {
            ...analysis,
            metrics: rec.recommendation.metrics,
            riskLevel: rec.analysis.riskLevel,
            riskExposure,
            actions,
            trends,
            visualization,
        };
    }

    /**
     * API stub: get monitor report for user
     * @param {string} userId
     * @param {string} vaultId
     * @returns {Promise<object>}
     */
    async getMonitorReport(userId, vaultId = null) {
        return await this.monitorUserPortfolio(userId, vaultId);
    }

    /**
     * Save diversification trend to DB (stub)
     * @param {string} userId
     * @param {object} assetAllocations
     */
    async saveDiversificationTrend(userId, assetAllocations) {
        // Replace with actual DB insert
        // await db.insert(diversificationTrends).values({ userId, ...assetAllocations, date: new Date() });
        return true;
    }

    /**
     * Unit test: mock analysis
     */
    static test() {
        const monitor = new PortfolioDiversificationMonitor();
        const mockAlloc = {
            equities: 0.65,
            bonds: 0.15,
            cash: 0.1,
            alternatives: 0.05,
            real_estate: 0.03,
            commodities: 0.02,
        };
        const analysis = monitor.analyzeDiversification(mockAlloc);
        const risk = monitor.calculateRiskExposure(mockAlloc);
        const actions = monitor.recommendActions(mockAlloc, 'moderate');
        const viz = monitor.getVisualizationData(mockAlloc);
        return { analysis, risk, actions, viz };
    }
}

// --- Documentation ---
/**
 * Usage:
 *   const monitor = new PortfolioDiversificationMonitor();
 *   const report = await monitor.getMonitorReport(userId);
 *
 * Methods:
 *   analyzeDiversification(assetAllocations)
 *   calculateRiskExposure(assetAllocations)
 *   recommendActions(assetAllocations, riskLevel)
 *   getDiversificationTrends(userId)
 *   getVisualizationData(assetAllocations)
 *   monitorUserPortfolio(userId, vaultId)
 *   getMonitorReport(userId, vaultId)
 *   saveDiversificationTrend(userId, assetAllocations)
 *   static test()
 */

// --- Unit Test Example ---
if (require.main === module) {
    console.log('PortfolioDiversificationMonitor Test Output:');
    const result = PortfolioDiversificationMonitor.test();
    console.dir(result, { depth: null });
    console.log('PortfolioDiversificationMonitor Extended Test Output:');
    const extResult = PortfolioDiversificationMonitor.extendedTest();
    console.dir(extResult, { depth: null });
}

export { PortfolioDiversificationMonitor };