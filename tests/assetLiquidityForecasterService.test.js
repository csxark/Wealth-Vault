/**
 * Asset Liquidity Forecaster Service Test Suite
 * Uses Jest for unit testing
 */

const AssetLiquidityForecasterService = require('../backend/services/assetLiquidityForecasterService');

describe('AssetLiquidityForecasterService', () => {
    const assetData = [
        { assetId: 'a1', name: 'Checking', type: 'cash', value: 5000 },
        { assetId: 'a2', name: 'Stocks', type: 'stocks', value: 15000 },
        { assetId: 'a3', name: 'Real Estate', type: 'real estate', value: 250000 }
    ];
    const marketData = {
        cash: { volatility: 0 },
        stocks: { volatility: 0.2 },
        'real estate': { volatility: 0.5 }
    };
    const userNeeds = { a1: 'emergency', a2: 'growth', a3: 'long-term' };

    it('should analyze assets and categorize types', () => {
        const service = new AssetLiquidityForecasterService(assetData, marketData, userNeeds);
        const analysis = service.analyzeAssets();
        expect(analysis.length).toBe(3);
        expect(analysis[0].typeCategory).toBe('liquid');
        expect(analysis[1].typeCategory).toBe('semi-liquid');
        expect(analysis[2].typeCategory).toBe('illiquid');
    });

    it('should forecast liquidity timelines', () => {
        const service = new AssetLiquidityForecasterService(assetData, marketData, userNeeds);
        service.analysisResults = service.analyzeAssets();
        const forecast = service.forecastLiquidity();
        expect(forecast.length).toBe(3);
        expect(forecast[0].liquidityTimeline.estimatedDays).toBeLessThanOrEqual(2);
        expect(forecast[2].liquidityTimeline.estimatedDays).toBeGreaterThanOrEqual(60);
    });

    it('should recommend rebalancing for illiquid assets', () => {
        const service = new AssetLiquidityForecasterService(assetData, marketData, userNeeds);
        service.analysisResults = service.analyzeAssets();
        const recommendations = service.recommendRebalancing();
        expect(recommendations.some(r => r.includes('rebalancing'))).toBe(true);
    });

    it('should generate risk alerts for poor liquidity', () => {
        const service = new AssetLiquidityForecasterService(assetData, marketData, userNeeds);
        service.analysisResults = service.analyzeAssets();
        const alerts = service.generateRiskAlerts();
        expect(alerts.some(a => a.message.includes('High risk'))).toBe(true);
    });

    it('should generate trend data', () => {
        const service = new AssetLiquidityForecasterService(assetData, marketData, userNeeds);
        service.analysisResults = service.analyzeAssets();
        const trends = service.generateTrendData();
        expect(trends.length).toBe(3);
        expect(trends[0].liquidityTrend.length).toBe(6);
    });

    it('should run full analysis and return summary', () => {
        const service = new AssetLiquidityForecasterService(assetData, marketData, userNeeds);
        const result = service.runAnalysis();
        expect(result.analysis.length).toBe(3);
        expect(result.forecast.length).toBe(3);
        expect(result.recommendations.length).toBe(3);
        expect(result.riskAlerts.length).toBeGreaterThanOrEqual(1);
        expect(result.trends.length).toBe(3);
        expect(result.summary.totalAssets).toBe(3);
    });
});
