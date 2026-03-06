/**
 * One-Click Rebalancing Service
 * Orchestrates automated portfolio rebalancing with tax optimization
 * Executes all recommended trades with a single action
 */

import db from '../config/db.js';
import {
    rebalancingActions,
    portfolioAllocations,
    investments,
    portfolios,
    taxHarvestingOpportunities
} from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { logInfo, logError } from '../utils/logger.js';
import portfolioRebalancingService from './portfolioRebalancingService.js';
import taxLossHarvestingEngine from './taxLossHarvestingEngine.js';
import investmentRecommendationEngine from './investmentRecommendationEngine.js';

class OneClickRebalancingService {
    /**
     * Execute one-click rebalancing with full automation
     */
    async executeOneClickRebalancing(tenantId, userId, portfolioId, options = {}) {
        try {
            logInfo(`Starting one-click rebalancing for portfolio ${portfolioId}`);
            
            const {
                enableTaxOptimization = true,
                minTradeAmount = 100,
                maxTradesPerSecurity = 5,
                allowPartialShares = false,
                dryRun = false
            } = options;
            
            // Step 1: Get current portfolio state
            const portfolio = await db.query.portfolios.findFirst({
                where: and(
                    eq(portfolios.id, portfolioId),
                    eq(portfolios.userId, userId)
                )
            });
            
            if (!portfolio) {
                throw new Error('Portfolio not found');
            }
            
            // Step 2: Generate rebalancing recommendations
            const recommendations = await investmentRecommendationEngine.generateRecommendations(
                tenantId,
                userId,
                portfolioId
            );
            
            const rebalancingRec = recommendations.find(r => r.recommendationType === 'rebalancing');
            
            if (!rebalancingRec) {
                return {
                    success: false,
                    message: 'No rebalancing needed at this time',
                    executedTrades: []
                };
            }
            
            // Step 3: Get pending rebalancing actions
            const actions = await db.query.rebalancingActions.findMany({
                where: and(
                    eq(rebalancingActions.recommendationId, rebalancingRec.id),
                    eq(rebalancingActions.actionStatus, 'pending')
                )
            });
            
            if (actions.length === 0) {
                return {
                    success: false,
                    message: 'No pending rebalancing actions found',
                    executedTrades: []
                };
            }
            
            // Step 4: Apply tax optimization if enabled
            let optimizedActions = actions;
            if (enableTaxOptimization) {
                optimizedActions = await this._applyTaxOptimization(
                    tenantId,
                    userId,
                    portfolioId,
                    actions
                );
            }
            
            // Step 5: Filter by minimum trade amount
            const significantActions = optimizedActions.filter(action => 
                Math.abs(parseFloat(action.tradeAmount || 0)) >= minTradeAmount
            );
            
            if (significantActions.length === 0) {
                return {
                    success: false,
                    message: 'All trades are below minimum trade amount threshold',
                    executedTrades: []
                };
            }
            
            // Step 6: Execute trades (or dry run)
            if (dryRun) {
                return {
                    success: true,
                    message: 'Dry run completed successfully',
                    dryRun: true,
                    plannedTrades: this._formatTradePreview(significantActions),
                    estimatedCost: this._calculateTradingCosts(significantActions),
                    estimatedTaxImpact: this._calculateTaxImpact(significantActions)
                };
            }
            
            // Execute actual trades
            const executedTrades = await this._executeTrades(
                tenantId,
                userId,
                portfolioId,
                significantActions,
                allowPartialShares
            );
            
            // Step 7: Update recommendation status
            await db.update(rebalancingActions)
                .set({
                    actionStatus: 'executed',
                    executedAt: new Date()
                })
                .where(inArray(
                    rebalancingActions.id,
                    executedTrades.map(t => t.actionId)
                ));
            
            // Step 8: Mark recommendation as executed
            await investmentRecommendationEngine.executeRecommendation(
                tenantId,
                userId,
                rebalancingRec.id
            );
            
            logInfo(`One-click rebalancing completed. Executed ${executedTrades.length} trades`);
            
            return {
                success: true,
                message: `Successfully executed ${executedTrades.length} trades`,
                executedTrades,
                totalCost: this._calculateTradingCosts(significantActions),
                taxImpact: this._calculateTaxImpact(significantActions),
                newAllocation: await this._getUpdatedAllocation(tenantId, userId, portfolioId)
            };
            
        } catch (error) {
            logError(`One-click rebalancing failed: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Apply tax-loss harvesting optimization to rebalancing actions
     */
    async _applyTaxOptimization(tenantId, userId, portfolioId, actions) {
        try {
            // Find tax-loss harvesting opportunities
            const opportunities = await db.query.taxHarvestingOpportunities.findMany({
                where: and(
                    eq(taxHarvestingOpportunities.portfolioId, portfolioId),
                    eq(taxHarvestingOpportunities.userId, userId),
                    eq(taxHarvestingOpportunities.opportunityStatus, 'open')
                )
            });
            
            const optimizedActions = [...actions];
            
            // For each sell action, check if we can harvest tax losses
            for (let i = 0; i < optimizedActions.length; i++) {
                const action = optimizedActions[i];
                
                if (action.actionType !== 'sell') continue;
                
                // Find matching opportunity
                const opportunity = opportunities.find(opp => 
                    opp.securitySymbol === action.securitySymbol &&
                    parseFloat(opp.unrealizedLoss) < 0
                );
                
                if (opportunity) {
                    // Prioritize this sell action for tax harvesting
                    optimizedActions[i] = {
                        ...action,
                        taxLossAmount: opportunity.unrealizedLoss,
                        taxOptimized: true,
                        priority: 1 // Higher priority
                    };
                    
                    logInfo(`Tax optimization applied to ${action.securitySymbol}: $${opportunity.unrealizedLoss} loss`);
                }
            }
            
            // Sort by priority (tax-optimized trades first)
            return optimizedActions.sort((a, b) => {
                const priorityA = a.priority || 5;
                const priorityB = b.priority || 5;
                return priorityA - priorityB;
            });
            
        } catch (error) {
            logError(`Tax optimization failed: ${error.message}`);
            return actions; // Return original actions if optimization fails
        }
    }
    
    /**
     * Execute trades in the market
     */
    async _executeTrades(tenantId, userId, portfolioId, actions, allowPartialShares) {
        const executedTrades = [];
        
        for (const action of actions) {
            try {
                const trade = await this._executeSingleTrade(
                    tenantId,
                    userId,
                    portfolioId,
                    action,
                    allowPartialShares
                );
                
                if (trade) {
                    executedTrades.push(trade);
                }
                
            } catch (error) {
                logError(`Failed to execute trade for ${action.securitySymbol}: ${error.message}`);
                // Continue with other trades even if one fails
            }
        }
        
        return executedTrades;
    }
    
    /**
     * Execute a single trade
     */
    async _executeSingleTrade(tenantId, userId, portfolioId, action, allowPartialShares) {
        const {
            securitySymbol,
            actionType,
            targetShares,
            currentShares,
            tradeAmount
        } = action;
        
        const sharesToTrade = parseFloat(targetShares) - parseFloat(currentShares);
        
        // Round shares if partial shares not allowed
        const actualShares = allowPartialShares 
            ? sharesToTrade 
            : Math.floor(Math.abs(sharesToTrade)) * (sharesToTrade < 0 ? -1 : 1);
        
        if (actualShares === 0) {
            return null; // Skip zero-share trades
        }
        
        // In a real system, this would integrate with a brokerage API
        // For now, we'll simulate the trade by updating the investment record
        
        const investment = await db.query.investments.findFirst({
            where: and(
                eq(investments.portfolioId, portfolioId),
                eq(investments.userId, userId),
                eq(investments.symbol, securitySymbol)
            )
        });
        
        if (!investment && actionType === 'buy') {
            // Create new investment
            await db.insert(investments).values({
                tenantId,
                portfolioId,
                userId,
                symbol: securitySymbol,
                quantity: Math.abs(actualShares),
                purchasePrice: Math.abs(parseFloat(tradeAmount)) / Math.abs(actualShares),
                totalCost: Math.abs(parseFloat(tradeAmount)),
                purchaseDate: new Date(),
                assetClass: action.assetClass || 'equities'
            });
            
        } else if (investment) {
            // Update existing investment
            const newQuantity = parseFloat(investment.quantity) + actualShares;
            
            if (newQuantity <= 0) {
                // Sell entire position
                await db.delete(investments)
                    .where(eq(investments.id, investment.id));
            } else {
                // Partial buy/sell
                await db.update(investments)
                    .set({
                        quantity: newQuantity,
                        marketValue: newQuantity * parseFloat(investment.currentPrice || investment.purchasePrice)
                    })
                    .where(eq(investments.id, investment.id));
            }
        }
        
        return {
            actionId: action.id,
            securitySymbol,
            actionType,
            shares: actualShares,
            amount: Math.abs(actualShares) * (parseFloat(tradeAmount) / Math.abs(sharesToTrade)),
            executedAt: new Date(),
            taxOptimized: action.taxOptimized || false,
            taxLossAmount: action.taxLossAmount || 0
        };
    }
    
    /**
     * Format trade preview for dry run
     */
    _formatTradePreview(actions) {
        return actions.map(action => ({
            symbol: action.securitySymbol,
            action: action.actionType,
            shares: Math.abs(parseFloat(action.targetShares) - parseFloat(action.currentShares)),
            amount: Math.abs(parseFloat(action.tradeAmount)),
            reason: action.rebalanceReason || 'Portfolio rebalancing',
            taxOptimized: action.taxOptimized || false,
            estimatedTaxSavings: action.taxLossAmount ? Math.abs(parseFloat(action.taxLossAmount)) * 0.25 : 0
        }));
    }
    
    /**
     * Calculate total trading costs
     */
    _calculateTradingCosts(actions) {
        // Assume $0 commission (most brokers now offer commission-free trading)
        // Add any applicable fees here
        const commissionPerTrade = 0;
        const regulatoryFees = 0.01; // Small regulatory fee per $1000 traded
        
        let totalCost = 0;
        
        actions.forEach(action => {
            const tradeValue = Math.abs(parseFloat(action.tradeAmount || 0));
            totalCost += commissionPerTrade;
            totalCost += (tradeValue / 1000) * regulatoryFees;
        });
        
        return parseFloat(totalCost.toFixed(2));
    }
    
    /**
     * Calculate tax impact of rebalancing
     */
    _calculateTaxImpact(actions) {
        let capitalGains = 0;
        let capitalLosses = 0;
        
        actions.forEach(action => {
            if (action.actionType === 'sell') {
                const taxAmount = parseFloat(action.taxLossAmount || 0);
                if (taxAmount < 0) {
                    capitalLosses += Math.abs(taxAmount);
                } else if (taxAmount > 0) {
                    capitalGains += taxAmount;
                }
            }
        });
        
        // Assume 25% tax rate (simplified)
        const estimatedTaxLiability = capitalGains * 0.25;
        const estimatedTaxSavings = capitalLosses * 0.25;
        const netTaxImpact = estimatedTaxLiability - estimatedTaxSavings;
        
        return {
            capitalGains: parseFloat(capitalGains.toFixed(2)),
            capitalLosses: parseFloat(capitalLosses.toFixed(2)),
            estimatedTaxLiability: parseFloat(estimatedTaxLiability.toFixed(2)),
            estimatedTaxSavings: parseFloat(estimatedTaxSavings.toFixed(2)),
            netTaxImpact: parseFloat(netTaxImpact.toFixed(2))
        };
    }
    
    /**
     * Get updated allocation after rebalancing
     */
    async _getUpdatedAllocation(tenantId, userId, portfolioId) {
        try {
            const holdings = await db.query.investments.findMany({
                where: and(
                    eq(investments.portfolioId, portfolioId),
                    eq(investments.userId, userId)
                )
            });
            
            const totalValue = holdings.reduce((sum, h) => 
                sum + parseFloat(h.marketValue || h.totalCost || 0), 0
            );
            
            const allocation = {};
            holdings.forEach(h => {
                const assetClass = h.assetClass || 'other';
                const value = parseFloat(h.marketValue || h.totalCost || 0);
                allocation[assetClass] = (allocation[assetClass] || 0) + value;
            });
            
            // Convert to percentages
            Object.keys(allocation).forEach(key => {
                allocation[key] = parseFloat((allocation[key] / totalValue * 100).toFixed(2));
            });
            
            return allocation;
            
        } catch (error) {
            logError(`Failed to get updated allocation: ${error.message}`);
            return {};
        }
    }
    
    /**
     * Get rebalancing preview (dry run by default)
     */
    async getRebalancingPreview(tenantId, userId, portfolioId, options = {}) {
        return await this.executeOneClickRebalancing(
            tenantId,
            userId,
            portfolioId,
            { ...options, dryRun: true }
        );
    }
    
    /**
     * Schedule automatic rebalancing
     */
    async scheduleAutomaticRebalancing(tenantId, userId, portfolioId, schedule) {
        try {
            const {
                frequency = 'quarterly', // daily, weekly, monthly, quarterly, annually
                minDriftThreshold = 5, // Minimum % drift to trigger rebalancing
                enableTaxOptimization = true,
                minTradeAmount = 100
            } = schedule;
            
            // Store schedule in robo_advisor_settings
            await db.update(roboAdvisorSettings)
                .set({
                    autoRebalance: true,
                    rebalanceFrequency: frequency,
                    rebalanceThreshold: minDriftThreshold,
                    taxOptimization: enableTaxOptimization,
                    minTradeSize: minTradeAmount,
                    updatedAt: new Date()
                })
                .where(and(
                    eq(roboAdvisorSettings.portfolioId, portfolioId),
                    eq(roboAdvisorSettings.userId, userId)
                ));
            
            logInfo(`Automatic rebalancing scheduled: ${frequency}, drift threshold: ${minDriftThreshold}%`);
            
            return {
                success: true,
                message: `Automatic rebalancing enabled with ${frequency} frequency`,
                schedule: {
                    frequency,
                    minDriftThreshold,
                    enableTaxOptimization,
                    minTradeAmount
                }
            };
            
        } catch (error) {
            logError(`Failed to schedule automatic rebalancing: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Check if portfolio needs rebalancing based on drift threshold
     */
    async checkRebalancingNeeded(tenantId, userId, portfolioId, thresholdPercent = 5) {
        try {
            const allocation = await db.query.portfolioAllocations.findFirst({
                where: and(
                    eq(portfolioAllocations.portfolioId, portfolioId),
                    eq(portfolioAllocations.userId, userId)
                )
            });
            
            if (!allocation) {
                return { needed: false, reason: 'No allocation found' };
            }
            
            const driftPercent = Math.abs(parseFloat(allocation.driftPercent || 0));
            
            return {
                needed: driftPercent >= thresholdPercent,
                driftPercent,
                thresholdPercent,
                reason: driftPercent >= thresholdPercent 
                    ? `Portfolio has drifted ${driftPercent.toFixed(2)}% from target`
                    : 'Portfolio is within acceptable drift range'
            };
            
        } catch (error) {
            logError(`Failed to check rebalancing need: ${error.message}`);
            throw error;
        }
    }
}

export default new OneClickRebalancingService();
