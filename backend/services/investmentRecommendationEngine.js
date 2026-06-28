/**
 * Investment Recommendation Engine Service
 * AI-powered robo-advisor that generates personalized investment recommendations
 * 
 * Features:
 * - Asset allocation optimization
 * - Rebalancing recommendations
 * - Tax-loss harvesting opportunities
 * - Diversification analysis
 * - Risk-adjusted portfolio suggestions
 */

import db from '../config/db.js';
import {
    investmentRecommendations,
    portfolioAllocations,
    assetAllocationModels,
    rebalancingActions,
    taxHarvestingOpportunities,
    diversificationAnalysis,
    roboAdvisorSettings,
    portfolios,
    investments
} from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import riskProfileService from './riskProfileService.js';
import taxLossHarvestingEngine from './taxLossHarvestingEngine.js';
import portfolioRebalancingService from './portfolioRebalancingService.js';
import { logInfo, logError } from '../utils/logger.js';

class InvestmentRecommendationEngine {
    /**
     * Generate comprehensive recommendations for a user's portfolio
     */
    async generateRecommendations(tenantId, userId, portfolioId) {
        try {
            logInfo(`Generating recommendations for user ${userId}, portfolio ${portfolioId}`);
            
            const recommendations = [];
            
            // Get user's robo-advisor settings
            const settings = await this.getRoboSettings(tenantId, userId);
            
            // Get portfolio data
            const portfolio = await db.query.portfolios.findFirst({
                where: and(eq(portfolios.id, portfolioId), eq(portfolios.userId, userId))
            });
            
            if (!portfolio) throw new Error('Portfolio not found');
            
            // Get current holdings
            const holdings = await db.query.investments.findMany({
                where: and(eq(investments.portfolioId, portfolioId), eq(investments.userId, userId))
            });
            
            if (holdings.length === 0) {
                return this._generateInitialPortfolioRecommendation(tenantId, userId, portfolioId, settings);
            }
            
            // 1. Check asset allocation and drift
            const allocationRec = await this._generateAllocationRecommendation(tenantId, userId, portfolioId, holdings, settings);
            if (allocationRec) recommendations.push(allocationRec);
            
            // 2. Check rebalancing needs
            const rebalanceRec = await this._generateRebalancingRecommendation(tenantId, userId, portfolioId, holdings, settings);
            if (rebalanceRec) recommendations.push(rebalanceRec);
            
            // 3. Check for tax-loss harvesting opportunities
            if (settings.taxOptimizationEnabled) {
                const taxRecs = await this._generateTaxHarvestingRecommendations(tenantId, userId, portfolioId, holdings, settings);
                recommendations.push(...taxRecs);
            }
            
            // 4. Check diversification
            const diversificationRec = await this._generateDiversificationRecommendation(tenantId, userId, portfolioId, holdings, settings);
            if (diversificationRec) recommendations.push(diversificationRec);
            
            // 5. Check risk alignment
            const riskRec = await this._generateRiskAlignmentRecommendation(tenantId, userId, portfolioId, holdings, settings);
            if (riskRec) recommendations.push(riskRec);
            
            // Store recommendations in database
            for (const rec of recommendations) {
                await db.insert(investmentRecommendations).values({
                    tenantId,
                    userId,
                    portfolioId,
                    ...rec
                });
            }
            
            logInfo(`Generated ${recommendations.length} recommendations`);
            return recommendations;
            
        } catch (error) {
            logError(`Failed to generate recommendations: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Generate asset allocation recommendation
     */
    async _generateAllocationRecommendation(tenantId, userId, portfolioId, holdings, settings) {
        try {
            // Calculate current allocation
            const totalValue = holdings.reduce((sum, h) => sum + parseFloat(h.marketValue || h.totalCost || 0), 0);
            
            const assetClassTotals = {};
            holdings.forEach(h => {
                const assetClass = h.assetClass || 'other';
                const value = parseFloat(h.marketValue || h.totalCost || 0);
                assetClassTotals[assetClass] = (assetClassTotals[assetClass] || 0) + value;
            });
            
            // Calculate percentages
            const currentAllocation = {};
            Object.keys(assetClassTotals).forEach(assetClass => {
                currentAllocation[assetClass] = totalValue > 0 ? (assetClassTotals[assetClass] / totalValue) * 100 : 0;
            });
            
            // Get target allocation model
            const targetModel = settings.targetAllocationModelId 
                ? await db.query.assetAllocationModels.findFirst({
                    where: eq(assetAllocationModels.id, settings.targetAllocationModelId)
                })
                : await this._getDefaultAllocationModel(settings.riskTolerance);
            
            if (!targetModel) return null;
            
            // Calculate drift
            const drifts = {
                equities: Math.abs((currentAllocation.equities || 0) - targetModel.targetEquities),
                bonds: Math.abs((currentAllocation.bonds || 0) - targetModel.targetBonds),
                cash: Math.abs((currentAllocation.cash || 0) - targetModel.targetCash),
                alternatives: Math.abs((currentAllocation.alternatives || 0) - (targetModel.targetAlternatives || 0))
            };
            
            const totalDrift = Object.values(drifts).reduce((sum, d) => sum + d, 0);
            const maxDrift = Math.max(...Object.values(drifts));
            
            // Store allocation snapshot
            await db.insert(portfolioAllocations).values({
                tenantId,
                portfolioId,
                userId,
                currentEquities: currentAllocation.equities || 0,
                currentBonds: currentAllocation.bonds || 0,
                currentCash: currentAllocation.cash || 0,
                currentAlternatives: currentAllocation.alternatives || 0,
                targetModelId: targetModel.id,
                totalDrift,
                maxDrift,
                requiresRebalancing: maxDrift > settings.rebalanceThreshold,
                computedAt: new Date()
            });
            
            // Generate recommendation if drift exceeds threshold
            if (maxDrift > settings.rebalanceThreshold) {
                const overweightClasses = [];
                const underweightClasses = [];
                
                Object.keys(drifts).forEach(assetClass => {
                    const current = currentAllocation[assetClass] || 0;
                    const target = targetModel[`target${assetClass.charAt(0).toUpperCase() + assetClass.slice(1)}`] || 0;
                    
                    if (current > target + settings.rebalanceThreshold) {
                        overweightClasses.push(`${assetClass} (+${(current - target).toFixed(1)}%)`);
                    } else if (current < target - settings.rebalanceThreshold) {
                        underweightClasses.push(`${assetClass} (-${(target - current).toFixed(1)}%)`);
                    }
                });
                
                return {
                    recommendationType: 'asset_allocation',
                    title: 'Asset Allocation Adjustment Recommended',
                    description: `Your portfolio has drifted ${totalDrift.toFixed(1)}% from your target allocation`,
                    reasoning: `Overweight: ${overweightClasses.join(', ')}. Underweight: ${underweightClasses.join(', ')}. Rebalancing will restore your target risk-return profile.`,
                    actionType: 'rebalance',
                    suggestedActions: [
                        { action: 'rebalance', targetModel: targetModel.modelName }
                    ],
                    confidenceScore: 90,
                    expectedReturnIncrease: 0.5,
                    riskReduction: totalDrift * 0.1,
                    priority: maxDrift > 10 ? 'high' : 'medium',
                    urgency: maxDrift > 15 ? 'time_sensitive' : 'normal',
                    timeHorizon: 'medium_term',
                    generatedBy: 'ai',
                    generationModel: 'allocation_optimizer_v1'
                };
            }
            
            return null;
            
        } catch (error) {
            logError(`Allocation recommendation error: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Generate rebalancing recommendation
     */
    async _generateRebalancingRecommendation(tenantId, userId, portfolioId, holdings, settings) {
        try {
            // Check if portfolio needs rebalancing
            const allocation = await db.query.portfolioAllocations.findFirst({
                where: eq(portfolioAllocations.portfolioId, portfolioId),
                orderBy: [desc(portfolioAllocations.computedAt)]
            });
            
            if (!allocation || !allocation.requiresRebalancing) return null;
            
            // Calculate specific rebalancing actions
            const actions = await portfolioRebalancingService.calculateRebalancingActions(
                tenantId,
                userId,
                portfolioId
            );
            
            if (actions.length === 0) return null;
            
            const totalTradeValue = actions.reduce((sum, a) => sum + Math.abs(a.tradeValue || 0), 0);
            const taxSensitiveActions = actions.filter(a => a.hasTaxImplications);
            
            return {
                recommendationType: 'rebalance',
                title: 'Rebalance Your Portfolio',
                description: `${actions.length} trades recommended to rebalance your portfolio`,
                reasoning: `Your portfolio has drifted ${allocation.totalDrift.toFixed(1)}% from target. Executing ${actions.length} trades will restore optimal allocation with estimated total trade value of $${totalTradeValue.toFixed(2)}.`,
                actionType: 'rebalance',
                suggestedActions: actions.slice(0, 10), // Top 10 actions
                confidenceScore: 85,
                expectedReturnIncrease: 0.3,
                riskReduction: allocation.totalDrift * 0.12,
                taxSavings: taxSensitiveActions.length > 0 ? -500 : 0, // Potential tax cost
                priority: allocation.maxDrift > 10 ? 'high' : 'medium',
                urgency: 'normal',
                timeHorizon: 'short_term',
                generatedBy: 'ai',
                generationModel: 'rebalance_optimizer_v1',
                estimatedImpact: {
                    tradeCount: actions.length,
                    totalTradeValue: totalTradeValue.toFixed(2),
                    taxSensitiveActions: taxSensitiveActions.length
                }
            };
            
        } catch (error) {
            logError(`Rebalancing recommendation error: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Generate tax-loss harvesting recommendations
     */
    async _generateTaxHarvestingRecommendations(tenantId, userId, portfolioId, holdings, settings) {
        try {
            const recommendations = [];
            
            // Identify holdings with unrealized losses
            const lossPositions = holdings.filter(h => {
                const currentValue = parseFloat(h.marketValue || 0);
                const costBasis = parseFloat(h.totalCost || 0);
                return currentValue < costBasis;
            });
            
            for (const position of lossPositions) {
                const currentValue = parseFloat(position.marketValue || 0);
                const costBasis = parseFloat(position.totalCost || 0);
                const unrealizedLoss = costBasis - currentValue;
                
                // Only recommend if loss exceeds minimum threshold
                if (unrealizedLoss >= settings.taxHarvestMinLoss) {
                    const taxBenefit = unrealizedLoss * (settings.marginalTaxRate || 0.22);
                    
                    // Find replacement securities
                    const replacement = await this._findReplacementSecurity(position);
                    
                    // Store opportunity
                    await db.insert(taxHarvestingOpportunities).values({
                        tenantId,
                        userId,
                        portfolioId,
                        assetSymbol: position.symbol,
                        assetName: position.name,
                        assetClass: position.assetClass,
                        currentPrice: position.currentPrice,
                        costBasis: costBasis / (position.quantity || 1),
                        unrealizedLoss,
                        unrealizedLossPercentage: (unrealizedLoss / costBasis) * 100,
                        taxBenefit,
                        marginalTaxRate: settings.marginalTaxRate,
                        suggestedReplacementSymbol: replacement?.symbol,
                        suggestedReplacementName: replacement?.name,
                        replacementRationale: replacement?.rationale,
                        priorityScore: Math.min(100, taxBenefit / 10),
                        confidence: replacement ? 'high' : 'medium',
                        status: 'identified'
                    });
                    
                    recommendations.push({
                        recommendationType: 'tax_harvest',
                        title: `Tax-Loss Harvest: ${position.symbol}`,
                        description: `Realize $${unrealizedLoss.toFixed(2)} loss for $${taxBenefit.toFixed(2)} tax benefit`,
                        reasoning: `Sell ${position.symbol} to realize tax loss of $${unrealizedLoss.toFixed(2)}, providing $${taxBenefit.toFixed(2)} in tax savings. ${replacement ? `Replace with ${replacement.symbol} to maintain market exposure.` : ''}`,
                        actionType: 'sell',
                        suggestedActions: [
                            { action: 'sell', symbol: position.symbol, shares: position.quantity },
                            ...(replacement ? [{ action: 'buy', symbol: replacement.symbol, estimatedShares: position.quantity }] : [])
                        ],
                        confidenceScore: replacement ? 85 : 70,
                        taxSavings: taxBenefit,
                        priority: taxBenefit > 1000 ? 'high' : 'medium',
                        urgency: 'time_sensitive',
                        timeHorizon: 'short_term',
                        generatedBy: 'ai',
                        generationModel: 'tax_harvest_v1'
                    });
                }
            }
            
            return recommendations;
            
        } catch (error) {
            logError(`Tax harvesting recommendation error: ${error.message}`);
            return [];
        }
    }
    
    /**
     * Generate diversification recommendation
     */
    async _generateDiversificationRecommendation(tenantId, userId, portfolioId, holdings, settings) {
        try {
            // Calculate diversification metrics
            const totalValue = holdings.reduce((sum, h) => sum + parseFloat(h.marketValue || h.totalCost || 0), 0);
            
            // Calculate Herfindahl index (concentration)
            let herfindahl = 0;
            holdings.forEach(h => {
                const weight = parseFloat(h.marketValue || h.totalCost || 0) / totalValue;
                herfindahl += weight * weight;
            });
            
            // Calculate effective number of assets
            const effectiveAssets = totalValue > 0 ? 1 / herfindahl : 0;
            
            // Diversification score (0-100, higher is better)
            const diversificationScore = Math.min(100, effectiveAssets * 10);
            
            // Count asset classes and sectors
            const assetClasses = new Set(holdings.map(h => h.assetClass)).size;
            const sectors = new Set(holdings.map(h => h.sector || 'unknown')).size;
            
            // Find largest position
            const largestPosition = Math.max(...holdings.map(h => {
                return (parseFloat(h.marketValue || h.totalCost || 0) / totalValue) * 100;
            }));
            
            // Generate recommendation if poorly diversified
            if (diversificationScore < 60 || largestPosition > settings.maxSinglePositionWeight || assetClasses < 3) {
                const issues = [];
                if (diversificationScore < 60) issues.push('low overall diversification');
                if (largestPosition > settings.maxSinglePositionWeight) issues.push(`largest position is ${largestPosition.toFixed(1)}%`);
                if (assetClasses < 3) issues.push(`only ${assetClasses} asset class(es)`);
                if (sectors < 5) issues.push(`only ${sectors} sector(s)`);
                
                return {
                    recommendationType: 'diversify',
                    title: 'Improve Portfolio Diversification',
                    description: 'Your portfolio concentration risk is elevated',
                    reasoning: `Diversification issues detected: ${issues.join(', ')}. Diversification score: ${diversificationScore.toFixed(1)}/100. Consider adding holdings across different asset classes and sectors.`,
                    actionType: 'buy',
                    suggestedActions: [
                        { action: 'diversify', targetAssetClasses: ['bonds', 'international', 'alternatives'] }
                    ],
                    confidenceScore: 80,
                    riskReduction: (100 - diversificationScore) * 0.15,
                    priority: diversificationScore < 40 ? 'high' : 'medium',
                    urgency: 'normal',
                    timeHorizon: 'medium_term',
                    generatedBy: 'ai',
                    generationModel: 'diversification_analyzer_v1',
                    estimatedImpact: {
                        currentDiversificationScore: diversificationScore.toFixed(1),
                        targetDiversificationScore: 80,
                        currentAssetClasses: assetClasses,
                        targetAssetClasses: Math.max(5, assetClasses)
                    }
                };
            }
            
            return null;
            
        } catch (error) {
            logError(`Diversification recommendation error: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Generate risk alignment recommendation
     */
    async _generateRiskAlignmentRecommendation(tenantId, userId, portfolioId, holdings, settings) {
        try {
            // Get user's risk profile
            const riskProfile = await riskProfileService.getRiskProfile(userId);
            if (!riskProfile) return null;
            
            // Calculate portfolio risk score based on asset allocation
            const totalValue = holdings.reduce((sum, h) => sum + parseFloat(h.marketValue || h.totalCost || 0), 0);
            
            let weightedRiskScore = 0;
            const assetRiskScores = {
                equities: 8,
                bonds: 3,
                cash: 1,
                alternatives: 7,
                real_estate: 6,
                commodities: 9,
                crypto: 10
            };
            
            holdings.forEach(h => {
                const weight = (parseFloat(h.marketValue || h.totalCost || 0) / totalValue);
                const riskScore = assetRiskScores[h.assetClass] || 5;
                weightedRiskScore += weight * riskScore;
            });
            
            // Compare to user's risk tolerance
            const targetRiskScores = {
                conservative: 3,
                moderate: 5,
                aggressive: 8
            };
            
            const targetRisk = targetRiskScores[settings.riskTolerance] || 5;
            const riskGap = Math.abs(weightedRiskScore - targetRisk);
            
            // Generate recommendation if significant mismatch
            if (riskGap > 2) {
                const direction = weightedRiskScore > targetRisk ? 'too aggressive' : 'too conservative';
                const adjustment = weightedRiskScore > targetRisk ? 'reduce' : 'increase';
                
                return {
                    recommendationType: 'risk_adjust',
                    title: 'Adjust Portfolio Risk Level',
                    description: `Your portfolio is ${direction} for your risk tolerance`,
                    reasoning: `Your portfolio has a risk score of ${weightedRiskScore.toFixed(1)}/10, but your stated risk tolerance is ${settings.riskTolerance} (target: ${targetRisk}/10). Consider adjusting your asset allocation to ${adjustment} risk.`,
                    actionType: 'rebalance',
                    suggestedActions: [
                        { action: 'adjust_risk', direction: adjustment, targetRiskScore: targetRisk }
                    ],
                    confidenceScore: 75,
                    priority: riskGap > 3 ? 'high' : 'medium',
                    urgency: 'normal',
                    timeHorizon: 'medium_term',
                    generatedBy: 'ai',
                    generationModel: 'risk_alignment_v1'
                };
            }
            
            return null;
            
        } catch (error) {
            logError(`Risk alignment recommendation error: ${error.message}`);
            return null;
        }
    }
    
    /**
     * Generate initial portfolio recommendation for new users
     */
    async _generateInitialPortfolioRecommendation(tenantId, userId, portfolioId, settings) {
        const targetModel = await this._getDefaultAllocationModel(settings.riskTolerance);
        
        return [{
            recommendationType: 'asset_allocation',
            title: 'Build Your Initial Portfolio',
            description: 'Set up a diversified portfolio aligned with your risk tolerance',
            reasoning: `As a ${settings.riskTolerance} investor, we recommend starting with a balanced allocation across asset classes to optimize risk-adjusted returns.`,
            actionType: 'buy',
            suggestedActions: [
                { action: 'allocate', model: targetModel?.modelName || settings.riskTolerance }
            ],
            confidenceScore: 85,
            priority: 'high',
            urgency: 'normal',
            timeHorizon: 'long_term',
            generatedBy: 'ai',
            generationModel: 'initial_portfolio_v1'
        }];
    }
    
    /**
     * Get robo-advisor settings for user
     */
    async getRoboSettings(tenantId, userId) {
        let settings = await db.query.roboAdvisorSettings.findFirst({
            where: and(eq(roboAdvisorSettings.userId, userId), eq(roboAdvisorSettings.tenantId, tenantId))
        });
        
        // Create default settings if none exist
        if (!settings) {
            const [created] = await db.insert(roboAdvisorSettings).values({
                tenantId,
                userId,
                autoGenerateRecommendations: true,
                autoRebalance: false,
                autoTaxHarvest: false,
                rebalanceThreshold: 5.0,
                minTradeAmount: 100,
                taxHarvestMinLoss: 500,
                riskTolerance: 'moderate',
                maxSinglePositionWeight: 10.0,
                allowInternational: true,
                allowAlternatives: false,
                taxOptimizationEnabled: true,
                marginalTaxRate: 0.22
            }).returning();
            settings = created;
        }
        
        return settings;
    }
    
    /**
     * Get default allocation model for risk tolerance
     */
    async _getDefaultAllocationModel(riskTolerance) {
        const modelTypeMap = {
            conservative: 'conservative',
            moderate: 'moderate',
            aggressive: 'aggressive'
        };
        
        const modelType = modelTypeMap[riskTolerance] || 'moderate';
        
        return await db.query.assetAllocationModels.findFirst({
            where: and(
                eq(assetAllocationModels.modelType, modelType),
                eq(assetAllocationModels.isTemplate, true)
            )
        });
    }
    
    /**
     * Find replacement security for tax-loss harvesting
     */
    async _findReplacementSecurity(originalPosition) {
        // Simplified replacement logic
        // In production, this would use market data and correlation analysis
        
        const sectorReplacements = {
            'Technology': { symbol: 'VGT', name: 'Vanguard Information Technology ETF', rationale: 'Similar sector exposure' },
            'Healthcare': { symbol: 'VHT', name: 'Vanguard Health Care ETF', rationale: 'Similar sector exposure' },
            'Financial': { symbol: 'VFH', name: 'Vanguard Financials ETF', rationale: 'Similar sector exposure' }
        };
        
        return sectorReplacements[originalPosition.sector] || null;
    }
    
    /**
     * Get active recommendations for user
     */
    async getActiveRecommendations(tenantId, userId, portfolioId = null) {
        try {
            const where = portfolioId
                ? and(
                    eq(investmentRecommendations.userId, userId),
                    eq(investmentRecommendations.portfolioId, portfolioId),
                    eq(investmentRecommendations.status, 'active')
                )
                : and(
                    eq(investmentRecommendations.userId, userId),
                    eq(investmentRecommendations.status, 'active')
                );
            
            return await db.query.investmentRecommendations.findMany({
                where,
                orderBy: [desc(investmentRecommendations.createdAt)]
            });
            
        } catch (error) {
            logError(`Failed to get recommendations: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Execute a recommendation
     */
    async executeRecommendation(tenantId, userId, recommendationId) {
        try {
            const recommendation = await db.query.investmentRecommendations.findFirst({
                where: and(
                    eq(investmentRecommendations.id, recommendationId),
                    eq(investmentRecommendations.userId, userId)
                )
            });
            
            if (!recommendation) throw new Error('Recommendation not found');
            if (recommendation.status !== 'active') throw new Error('Recommendation not active');
            
            // Update status
            await db.update(investmentRecommendations)
                .set({ status: 'executed', executedAt: new Date() })
                .where(eq(investmentRecommendations.id, recommendationId));
            
            logInfo(`Executed recommendation ${recommendationId}`);
            return { success: true, message: 'Recommendation executed' };
            
        } catch (error) {
            logError(`Failed to execute recommendation: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Dismiss a recommendation
     */
    async dismissRecommendation(tenantId, userId, recommendationId, reason) {
        try {
            await db.update(investmentRecommendations)
                .set({ 
                    status: 'dismissed', 
                    dismissedAt: new Date(),
                    dismissalReason: reason
                })
                .where(and(
                    eq(investmentRecommendations.id, recommendationId),
                    eq(investmentRecommendations.userId, userId)
                ));
            
            logInfo(`Dismissed recommendation ${recommendationId}`);
            return { success: true };
            
        } catch (error) {
            logError(`Failed to dismiss recommendation: ${error.message}`);
            throw error;
        }
    }
}

export default new InvestmentRecommendationEngine();
