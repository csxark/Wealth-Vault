/**
 * Asset Liquidity Forecaster Service
 * Analyzes asset types, market conditions, and user needs to project liquidity timelines and recommend rebalancing strategies.
 * Author: Ayaanshaikh12243
 * Date: 2026-03-04
 */

class AssetLiquidityForecasterService {
    constructor(assetData, marketData, userNeeds, options = {}) {
        this.assetData = assetData || [];
        this.marketData = marketData || {};
        this.userNeeds = userNeeds || {};
        this.options = options;
        this.analysisResults = null;
        this.liquidityForecast = null;
        this.rebalancingRecommendations = null;
        this.riskAlerts = null;
        this.trendData = null;
    }

    /**
     * Main entry point: runs full analysis and forecasting
     */
    runAnalysis() {
        this.analysisResults = this.analyzeAssets();
        this.liquidityForecast = this.forecastLiquidity();
        this.rebalancingRecommendations = this.recommendRebalancing();
        this.riskAlerts = this.generateRiskAlerts();
        this.trendData = this.generateTrendData();
        return {
            analysis: this.analysisResults,
            forecast: this.liquidityForecast,
            recommendations: this.rebalancingRecommendations,
            riskAlerts: this.riskAlerts,
            trends: this.trendData,
            summary: this.generateSummary()
        };
    }

    /**
     * Analyze asset types and liquidity characteristics
     */
    analyzeAssets() {
        return this.assetData.map(asset => {
            const liquidityScore = this.calculateLiquidityScore(asset);
            const typeCategory = this.categorizeAssetType(asset);
            return {
                assetId: asset.assetId,
                name: asset.name,
                type: asset.type,
                value: asset.value,
                liquidityScore,
                typeCategory,
                marketFactors: this.marketData[asset.type] || {},
                userPriority: this.userNeeds[asset.assetId] || null
            };
        });
    }

    /**
     * Forecast liquidity timelines for each asset
     */
    forecastLiquidity() {
        return this.analysisResults.map(result => {
            const timeline = this.projectLiquidityTimeline(result);
            return {
                assetId: result.assetId,
                name: result.name,
                liquidityTimeline: timeline,
                liquidityScore: result.liquidityScore,
                typeCategory: result.typeCategory
            };
        });
    }

    /**
     * Recommend rebalancing strategies to improve liquidity
     */
    recommendRebalancing() {
        const recommendations = [];
        for (const result of this.analysisResults) {
            if (result.liquidityScore < 0.5) {
                recommendations.push(`Consider rebalancing ${result.name} (${result.type}) to improve emergency liquidity.`);
            } else if (result.typeCategory === 'illiquid') {
                recommendations.push(`Explore options to convert ${result.name} to more liquid assets.`);
            } else {
                recommendations.push(`Maintain current allocation for ${result.name}.`);
            }
        }
        return recommendations;
    }

    /**
     * Generate risk alerts for assets with poor liquidity
     */
    generateRiskAlerts() {
        return this.analysisResults.filter(result => result.liquidityScore < 0.3).map(result => ({
            assetId: result.assetId,
            name: result.name,
            message: `High risk: ${result.name} is difficult to liquidate quickly in emergencies.`
        }));
    }

    /**
     * Generate trend data for liquidity over time
     */
    generateTrendData() {
        // Simulate trend data for demonstration
        return this.analysisResults.map(result => ({
            assetId: result.assetId,
            name: result.name,
            liquidityTrend: this.simulateTrend(result)
        }));
    }

    /**
     * Generate overall summary
     */
    generateSummary() {
        const totalAssets = this.assetData.length;
        const highRiskAssets = this.riskAlerts.length;
        return {
            totalAssets,
            highRiskAssets,
            recommendations: this.rebalancingRecommendations
        };
    }

    /**
     * Helper: Categorize asset type
     */
    categorizeAssetType(asset) {
        const type = asset.type.toLowerCase();
        if (["cash", "checking", "savings"].includes(type)) return "liquid";
        if (["stocks", "bonds", "mutual funds"].includes(type)) return "semi-liquid";
        if (["real estate", "private equity", "collectibles"].includes(type)) return "illiquid";
        return "unknown";
    }

    /**
     * Helper: Calculate liquidity score (0-1)
     */
    calculateLiquidityScore(asset) {
        // Example scoring logic
        const type = asset.type.toLowerCase();
        if (["cash", "checking", "savings"].includes(type)) return 1.0;
        if (["stocks", "bonds", "mutual funds"].includes(type)) return 0.7;
        if (["real estate", "private equity", "collectibles"].includes(type)) return 0.2;
        return 0.5;
    }

    /**
     * Helper: Project liquidity timeline
     */
    projectLiquidityTimeline(result) {
        // Simulate based on type and market factors
        const baseDays = {
            liquid: 1,
            "semi-liquid": 7,
            illiquid: 60,
            unknown: 30
        };
        const type = result.typeCategory;
        let days = baseDays[type] || 30;
        // Adjust for market volatility
        const volatility = result.marketFactors.volatility || 0;
        days += Math.round(volatility * 10);
        // Adjust for user priority
        if (result.userPriority && result.userPriority === "emergency") days = Math.max(1, days - 5);
        return {
            estimatedDays: days,
            comment: days <= 7 ? "Quickly liquidatable" : days <= 30 ? "Moderate liquidity" : "Difficult to liquidate"
        };
    }

    /**
     * Helper: Simulate liquidity trend
     */
    simulateTrend(result) {
        // Simulate trend as array of monthly liquidity scores
        const months = 6;
        const base = result.liquidityScore;
        const volatility = result.marketFactors.volatility || 0.1;
        const trend = [];
        for (let i = 0; i < months; i++) {
            const score = Math.max(0, Math.min(1, base + (Math.random() - 0.5) * volatility));
            trend.push({ month: i + 1, liquidityScore: score });
        }
        return trend;
    }
}

module.exports = AssetLiquidityForecasterService;
