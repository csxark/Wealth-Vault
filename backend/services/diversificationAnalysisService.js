/**
 * Diversification Analysis Service
 * Analyzes portfolio diversification across asset classes, sectors, and geographies
 * Provides actionable insights to reduce concentration risk
 */

import db from '../config/db.js';
import {
    diversificationAnalysis,
    portfolios,
    investments
} from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';

class DiversificationAnalysisService {
    /**
     * Perform comprehensive diversification analysis
     */
    async analyzeDiversification(tenantId, userId, portfolioId) {
        try {
            logInfo(`Analyzing diversification for portfolio ${portfolioId}`);
            
            // Get portfolio holdings
            const holdings = await db.query.investments.findMany({
                where: and(
                    eq(investments.portfolioId, portfolioId),
                    eq(investments.userId, userId)
                )
            });
            
            if (holdings.length === 0) {
                return {
                    diversificationScore: 0,
                    message: 'Portfolio has no holdings to analyze'
                };
            }
            
            const totalValue = holdings.reduce((sum, h) => 
                sum + parseFloat(h.marketValue || h.totalCost || 0), 0
            );
            
            // Calculate all diversification metrics
            const metrics = {
                // Overall diversification
                ...this._calculateOverallDiversification(holdings, totalValue),
                
                // Asset class diversification
                ...this._calculateAssetClassDiversification(holdings, totalValue),
                
                // Sector diversification
                ...this._calculateSectorDiversification(holdings, totalValue),
                
                // Geographic diversification
                ...this._calculateGeographicDiversification(holdings, totalValue),
                
                // Position sizing
                ...this._calculatePositionSizing(holdings, totalValue),
                
                // Risk metrics
                ...this._calculateRiskMetrics(holdings, totalValue)
            };
            
            // Calculate gaps and opportunities
            const analysis = this._analyzeGapsAndOpportunities(metrics, holdings);
            
            // Assign grade
            const grade = this._assignDiversificationGrade(metrics.diversificationScore);
            const riskLevel = this._assessRiskLevel(metrics);
            
            // Store analysis
            const [storedAnalysis] = await db.insert(diversificationAnalysis).values({
                tenantId,
                portfolioId,
                userId,
                ...metrics,
                underweightedSectors: analysis.underweightedSectors,
                overweightedSectors: analysis.overweightedSectors,
                missingAssetClasses: analysis.missingAssetClasses,
                diversificationRecommendations: analysis.recommendations,
                diversificationGrade: grade,
                riskLevel,
                analyzedAt: new Date(),
                benchmarkIndex: 'S&P 500'
            }).returning();
            
            logInfo(`Diversification analysis complete. Score: ${metrics.diversificationScore}`);
            
            return {
                ...storedAnalysis,
                analysis
            };
            
        } catch (error) {
            logError(`Diversification analysis failed: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Calculate overall diversification metrics
     */
    _calculateOverallDiversification(holdings, totalValue) {
        // Calculate Herfindahl-Hirschman Index (HHI)
        // HHI = sum of squared market shares
        let herfindahlIndex = 0;
        holdings.forEach(h => {
            const weight = parseFloat(h.marketValue || h.totalCost || 0) / totalValue;
            herfindahlIndex += weight * weight;
        });
        
        // Effective number of assets
        const effectiveNumberOfAssets = totalValue > 0 ? 1 / herfindahlIndex : 0;
        
        // Diversification score (0-100, higher is better)
        // Perfect diversification would have low HHI
        const diversificationScore = Math.min(100, Math.max(0, 100 - (herfindahlIndex * 100)));
        
        return {
            diversificationScore: parseFloat(diversificationScore.toFixed(2)),
            herfindahlIndex: parseFloat(herfindahlIndex.toFixed(6)),
            effectiveNumberOfAssets: parseFloat(effectiveNumberOfAssets.toFixed(2))
        };
    }
    
    /**
     * Calculate asset class diversification
     */
    _calculateAssetClassDiversification(holdings, totalValue) {
        const assetClassTotals = {};
        
        holdings.forEach(h => {
            const assetClass = h.assetClass || 'other';
            const value = parseFloat(h.marketValue || h.totalCost || 0);
            assetClassTotals[assetClass] = (assetClassTotals[assetClass] || 0) + value;
        });
        
        const assetClassCount = Object.keys(assetClassTotals).length;
        const largestAssetClassWeight = totalValue > 0 
            ? Math.max(...Object.values(assetClassTotals)) / totalValue * 100 
            : 0;
        
        // Calculate Shannon entropy for asset classes
        let assetClassEntropy = 0;
        Object.values(assetClassTotals).forEach(value => {
            const p = value / totalValue;
            if (p > 0) assetClassEntropy -= p * Math.log2(p);
        });
        
        return {
            assetClassCount,
            assetClassEntropy: parseFloat(assetClassEntropy.toFixed(6)),
            largestAssetClassWeight: parseFloat(largestAssetClassWeight.toFixed(2))
        };
    }
    
    /**
     * Calculate sector diversification
     */
    _calculateSectorDiversification(holdings, totalValue) {
        const sectorTotals = {};
        
        holdings.forEach(h => {
            const sector = h.sector || 'unknown';
            const value = parseFloat(h.marketValue || h.totalCost || 0);
            sectorTotals[sector] = (sectorTotals[sector] || 0) + value;
        });
        
        const sectorCount = Object.keys(sectorTotals).filter(s => s !== 'unknown').length;
        const sectorConcentration = totalValue > 0 
            ? Math.max(...Object.values(sectorTotals)) / totalValue * 100 
            : 0;
        
        // Calculate Shannon entropy for sectors
        let sectorEntropy = 0;
        Object.values(sectorTotals).forEach(value => {
            const p = value / totalValue;
            if (p > 0) sectorEntropy -= p * Math.log2(p);
        });
        
        return {
            sectorCount,
            sectorConcentration: parseFloat(sectorConcentration.toFixed(2)),
            sectorEntropy: parseFloat(sectorEntropy.toFixed(6))
        };
    }
    
    /**
     * Calculate geographic diversification
     */
    _calculateGeographicDiversification(holdings, totalValue) {
        const geographyTotals = {
            domestic: 0,
            international: 0,
            emergingMarkets: 0
        };
        
        holdings.forEach(h => {
            const value = parseFloat(h.marketValue || h.totalCost || 0);
            const geography = h.geography || 'domestic';
            
            if (geography === 'domestic' || geography === 'US') {
                geographyTotals.domestic += value;
            } else if (geography === 'emerging') {
                geographyTotals.emergingMarkets += value;
            } else {
                geographyTotals.international += value;
            }
        });
        
        return {
            geographyCount: Object.values(geographyTotals).filter(v => v > 0).length,
            domesticAllocation: totalValue > 0 ? parseFloat((geographyTotals.domestic / totalValue * 100).toFixed(2)) : 0,
            internationalAllocation: totalValue > 0 ? parseFloat((geographyTotals.international / totalValue * 100).toFixed(2)) : 0,
            emergingMarketsAllocation: totalValue > 0 ? parseFloat((geographyTotals.emergingMarkets / totalValue * 100).toFixed(2)) : 0
        };
    }
    
    /**
     * Calculate position sizing metrics
     */
    _calculatePositionSizing(holdings, totalValue) {
        // Sort holdings by value
        const sortedHoldings = holdings
            .map(h => parseFloat(h.marketValue || h.totalCost || 0))
            .sort((a, b) => b - a);
        
        const largestPositionWeight = totalValue > 0 
            ? (sortedHoldings[0] / totalValue * 100) 
            : 0;
        
        const top10Total = sortedHoldings.slice(0, 10).reduce((sum, v) => sum + v, 0);
        const top10Concentration = totalValue > 0 ? (top10Total / totalValue * 100) : 0;
        
        const positionsOver5Percent = sortedHoldings.filter(v => 
            totalValue > 0 && (v / totalValue * 100) > 5
        ).length;
        
        return {
            largestPositionWeight: parseFloat(largestPositionWeight.toFixed(2)),
            top10Concentration: parseFloat(top10Concentration.toFixed(2)),
            positionsOver5Percent
        };
    }
    
    /**
     * Calculate risk metrics
     */
    _calculateRiskMetrics(holdings, totalValue) {
        // Simplified risk metrics
        // In production, this would use historical data and covariance matrices
        
        const assetBetas = {
            equities: 1.0,
            bonds: 0.2,
            cash: 0.0,
            alternatives: 0.8,
            real_estate: 0.6,
            commodities: 0.9
        };
        
        let portfolioBeta = 0;
        holdings.forEach(h => {
            const weight = totalValue > 0 ? parseFloat(h.marketValue || h.totalCost || 0) / totalValue : 0;
            const beta = assetBetas[h.assetClass] || 0.7;
            portfolioBeta += weight * beta;
        });
        
        // Estimate unsystematic risk based on diversification
        const unsystematicRisk = holdings.length > 0 ? 0.15 / Math.sqrt(holdings.length) : 0.15;
        
        // Correlation to benchmark (simplified)
        const equityWeight = holdings
            .filter(h => h.assetClass === 'equities')
            .reduce((sum, h) => sum + parseFloat(h.marketValue || h.totalCost || 0), 0) / totalValue * 100;
        const correlationToBenchmark = equityWeight / 100;
        
        return {
            portfolioBeta: parseFloat(portfolioBeta.toFixed(4)),
            unsystematicRisk: parseFloat(unsystematicRisk.toFixed(4)),
            correlationToBenchmark: parseFloat(correlationToBenchmark.toFixed(2))
        };
    }
    
    /**
     * Analyze gaps and opportunities
     */
    _analyzeGapsAndOpportunities(metrics, holdings) {
        const recommendations = [];
        const underweightedSectors = [];
        const overweightedSectors = [];
        const missingAssetClasses = [];
        
        // Check asset class gaps
        const standardAssetClasses = ['equities', 'bonds', 'cash', 'alternatives'];
        const currentAssetClasses = [...new Set(holdings.map(h => h.assetClass))];
        
        standardAssetClasses.forEach(assetClass => {
            if (!currentAssetClasses.includes(assetClass)) {
                missingAssetClasses.push(assetClass);
            }
        });
        
        if (missingAssetClasses.length > 0) {
            recommendations.push({
                type: 'missing_asset_classes',
                severity: 'high',
                message: `Consider adding ${missingAssetClasses.join(', ')} to improve diversification`
            });
        }
        
        // Check sector concentration
        if (metrics.sectorConcentration > 30) {
            recommendations.push({
                type: 'sector_concentration',
                severity: 'medium',
                message: `Largest sector is ${metrics.sectorConcentration.toFixed(1)}% of portfolio. Consider diversifying.`
            });
        }
        
        // Check position sizing
        if (metrics.largestPositionWeight > 15) {
            recommendations.push({
                type: 'position_sizing',
                severity: 'high',
                message: `Largest position is ${metrics.largestPositionWeight.toFixed(1)}%. Consider reducing to under 10%.`
            });
        }
        
        // Check geographic diversification
        if (metrics.domesticAllocation > 80) {
            recommendations.push({
                type: 'geographic_concentration',
                severity: 'medium',
                message: `${metrics.domesticAllocation.toFixed(1)}% domestic allocation. Consider international exposure.`
            });
        }
        
        // Check asset count
        if (holdings.length < 10) {
            recommendations.push({
                type: 'low_asset_count',
                severity: 'high',
                message: `Only ${holdings.length} holdings. Consider adding more positions for better diversification.`
            });
        }
        
        return {
            recommendations,
            underweightedSectors,
            overweightedSectors,
            missingAssetClasses
        };
    }
    
    /**
     * Assign diversification grade
     */
    _assignDiversificationGrade(score) {
        if (score >= 90) return 'A+';
        if (score >= 85) return 'A';
        if (score >= 80) return 'A-';
        if (score >= 75) return 'B+';
        if (score >= 70) return 'B';
        if (score >= 65) return 'B-';
        if (score >= 60) return 'C+';
        if (score >= 55) return 'C';
        if (score >= 50) return 'C-';
        if (score >= 45) return 'D+';
        if (score >= 40) return 'D';
        return 'F';
    }
    
    /**
     * Assess risk level
     */
    _assessRiskLevel(metrics) {
        let riskScore = 0;
        
        // High concentration = high risk
        if (metrics.herfindahlIndex > 0.15) riskScore += 2;
        else if (metrics.herfindahlIndex > 0.10) riskScore += 1;
        
        // Large position = high risk
        if (metrics.largestPositionWeight > 20) riskScore += 2;
        else if (metrics.largestPositionWeight > 10) riskScore += 1;
        
        // Few asset classes = high risk
        if (metrics.assetClassCount < 3) riskScore += 2;
        else if (metrics.assetClassCount < 4) riskScore += 1;
        
        // Geographic concentration = moderate risk
        if (metrics.domesticAllocation > 90) riskScore += 1;
        
        if (riskScore >= 5) return 'very_high';
        if (riskScore >= 3) return 'high';
        if (riskScore >= 2) return 'moderate';
        return 'low';
    }
    
    /**
     * Get latest diversification analysis
     */
    async getLatestAnalysis(tenantId, userId, portfolioId) {
        try {
            return await db.query.diversificationAnalysis.findFirst({
                where: and(
                    eq(diversificationAnalysis.portfolioId, portfolioId),
                    eq(diversificationAnalysis.userId, userId)
                ),
                orderBy: [desc(diversificationAnalysis.analyzedAt)]
            });
        } catch (error) {
            logError(`Failed to get diversification analysis: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Compare diversification over time
     */
    async getDiversificationTrend(tenantId, userId, portfolioId, months = 6) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setMonth(cutoffDate.getMonth() - months);
            
            const analyses = await db.query.diversificationAnalysis.findMany({
                where: and(
                    eq(diversificationAnalysis.portfolioId, portfolioId),
                    eq(diversificationAnalysis.userId, userId)
                ),
                orderBy: [desc(diversificationAnalysis.analyzedAt)]
            });
            
            return analyses
                .filter(a => new Date(a.analyzedAt) >= cutoffDate)
                .map(a => ({
                    date: a.analyzedAt,
                    score: a.diversificationScore,
                    grade: a.diversificationGrade,
                    riskLevel: a.riskLevel,
                    assetClassCount: a.assetClassCount,
                    herfindahlIndex: a.herfindahlIndex
                }));
                
        } catch (error) {
            logError(`Failed to get diversification trend: ${error.message}`);
            throw error;
        }
    }
}

export default new DiversificationAnalysisService();
