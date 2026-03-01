import db from '../config/db.js';
import { investments, portfolios, investmentTransactions } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import riskProfileService from './riskProfileService.js';

/**
 * Investment Advisor Service
 * Provides personalized investment recommendations, portfolio analysis, and market insights
 */

/**
 * Get personalized investment recommendations
 * @param {string} userId - User ID
 * @param {string} portfolioId - Optional portfolio ID
 * @param {number} limit - Maximum number of recommendations
 * @returns {Promise<Array>} - Array of recommendations
 */
export const getPersonalizedRecommendations = async (userId, portfolioId, limit = 10) => {
  try {
    // Get user's risk profile
    const riskProfile = await riskProfileService.getRiskProfileWithAnalysis(userId);
    
    // Get user's investments
    let query = db
      .select()
      .from(investments)
      .where(eq(investments.userId, userId));
    
    if (portfolioId) {
      query = query.where(eq(investments.portfolioId, portfolioId));
    }
    
    const userInvestments = await query;
    
    // Generate recommendations based on risk profile and portfolio
    const recommendations = [];
    
    // Recommendation 1: Diversification check
    const assetClassCounts = {};
    userInvestments.forEach(inv => {
      const assetClass = inv.assetClass || 'other';
      assetClassCounts[assetClass] = (assetClassCounts[assetClass] || 0) + 1;
    });
    
    const uniqueAssetClasses = Object.keys(assetClassCounts).length;
    if (uniqueAssetClasses < 3) {
      recommendations.push({
        id: `rec-div-${Date.now()}`,
        userId,
        portfolioId,
        type: 'diversify',
        reasoning: `Your portfolio has only ${uniqueAssetClasses} asset class(es). Consider diversifying across stocks, bonds, and other asset classes to reduce risk.`,
        riskLevel: riskProfile.riskTolerance === 'conservative' ? 'low' : 'medium',
        confidence: 85,
        timeHorizon: 'medium',
        priority: uniqueAssetClasses === 1 ? 'high' : 'medium',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }
    
    // Recommendation 2: Rebalancing check
    if (userInvestments.length >= 3) {
      const totalValue = userInvestments.reduce((sum, inv) => {
        return sum + parseFloat(inv.marketValue || inv.totalCost || 0);
      }, 0);
      
      const weights = userInvestments.map(inv => ({
        symbol: inv.symbol,
        weight: totalValue > 0 ? (parseFloat(inv.marketValue || inv.totalCost || 0) / totalValue) : 0
      }));
      
      const maxWeight = Math.max(...weights.map(w => w.weight));
      if (maxWeight > 0.4) {
        const overweight = weights.find(w => w.weight === maxWeight);
        recommendations.push({
          id: `rec-reb-${Date.now()}`,
          userId,
          portfolioId,
          type: 'rebalance',
          symbol: overweight.symbol,
          reasoning: `${overweight.symbol} represents ${(maxWeight * 100).toFixed(1)}% of your portfolio. Consider rebalancing to reduce concentration risk.`,
          riskLevel: 'medium',
          confidence: 80,
          timeHorizon: 'short',
          priority: maxWeight > 0.6 ? 'high' : 'medium',
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      }
    }
    
    // Recommendation 3: Risk tolerance alignment
    if (riskProfile.riskTolerance === 'conservative' && userInvestments.length > 0) {
      const hasHighRisk = userInvestments.some(inv => 
        inv.type === 'crypto' || (inv.type === 'stock' && parseFloat(inv.dividendYield || 0) < 2)
      );
      
      if (hasHighRisk) {
        recommendations.push({
          id: `rec-risk-${Date.now()}`,
          userId,
          portfolioId,
          type: 'sell',
          reasoning: 'Your risk profile indicates a conservative investment strategy, but your portfolio contains high-risk assets. Consider reducing exposure to align with your risk tolerance.',
          riskLevel: 'high',
          confidence: 75,
          timeHorizon: 'medium',
          priority: 'medium',
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      }
    }
    
    // Recommendation 4: Emergency fund check
    recommendations.push({
      id: `rec-cash-${Date.now()}`,
      userId,
      portfolioId,
      type: 'buy',
      reasoning: 'Maintain 3-6 months of expenses in liquid, low-risk investments as an emergency fund.',
      expectedReturn: 0.03,
      riskLevel: 'low',
      confidence: 90,
      timeHorizon: 'short',
      priority: 'high',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    
    // Recommendation 5: Long-term growth for young investors
    if (riskProfile.investmentHorizon === 'long' || (riskProfile.age && riskProfile.age < 40)) {
      recommendations.push({
        id: `rec-growth-${Date.now()}`,
        userId,
        portfolioId,
        type: 'buy',
        name: 'Index Fund / ETF',
        reasoning: 'With a long investment horizon, consider investing in low-cost index funds or ETFs for broad market exposure and compounding growth.',
        expectedReturn: 0.08,
        riskLevel: 'medium',
        confidence: 85,
        timeHorizon: 'long',
        priority: 'medium',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }
    
    // Recommendation 6: Income generation for retirees
    if (riskProfile.primaryGoal === 'income' || (riskProfile.retirementAge && riskProfile.retirementAge < 60)) {
      recommendations.push({
        id: `rec-income-${Date.now()}`,
        userId,
        portfolioId,
        type: 'buy',
        name: 'Dividend Stocks / Bonds',
        reasoning: 'Consider adding dividend-paying stocks or bonds to generate steady income while preserving capital.',
        expectedReturn: 0.05,
        riskLevel: 'low',
        confidence: 80,
        timeHorizon: 'medium',
        priority: 'medium',
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }
    
    return recommendations.slice(0, limit);
  } catch (error) {
    console.error('Error generating recommendations:', error);
    throw error;
  }
};

/**
 * Analyze user's portfolio
 * @param {string} userId - User ID
 * @param {string} portfolioId - Optional portfolio ID
 * @returns {Promise<Object>} - Portfolio analysis
 */
export const analyzePortfolio = async (userId, portfolioId) => {
  try {
    // Get user's risk profile
    const riskProfile = await riskProfileService.getRiskProfileWithAnalysis(userId);
    
    // Get investments
    let query = db
      .select()
      .from(investments)
      .where(eq(investments.userId, userId));
    
    if (portfolioId) {
      query = query.where(eq(investments.portfolioId, portfolioId));
    }
    
    const userInvestments = await query;
    
    // Calculate portfolio metrics
    const totalValue = userInvestments.reduce((sum, inv) => {
      return sum + parseFloat(inv.marketValue || inv.totalCost || 0);
    }, 0);
    
    const totalCost = userInvestments.reduce((sum, inv) => {
      return sum + parseFloat(inv.totalCost || 0);
    }, 0);
    
    // Asset allocation
    const allocation = {};
    userInvestments.forEach(inv => {
      const assetClass = inv.assetClass || 'other';
      const value = parseFloat(inv.marketValue || inv.totalCost || 0);
      allocation[assetClass] = (allocation[assetClass] || 0) + value;
    });
    
    // Convert to percentages
    const allocationPercentages = {};
    Object.keys(allocation).forEach(key => {
      allocationPercentages[key] = totalValue > 0 
        ? (allocation[key] / totalValue) * 100 
        : 0;
    });
    
    // Performance metrics
    const totalReturn = totalValue - totalCost;
    const returnPercent = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;
    
    // Risk assessment
    const riskLevel = userInvestments.length < 3 ? 'high' : 
                      Object.keys(allocationPercentages).some(k => allocationPercentages[k] > 40) ? 'medium' : 'low';
    
    // Recommendations based on analysis
    const recommendations = [];
    
    if (Object.keys(allocationPercentages).length < 3) {
      recommendations.push({
        type: 'diversify',
        priority: 'high',
        message: 'Portfolio lacks diversification across asset classes'
      });
    }
    
    if (riskProfile.riskTolerance === 'conservative' && riskLevel === 'high') {
      recommendations.push({
        type: 'reduce_risk',
        priority: 'high',
        message: 'Portfolio risk level exceeds your risk tolerance'
      });
    }
    
    if (totalValue > 0 && returnPercent < -10) {
      recommendations.push({
        type: 'hold',
        priority: 'medium',
        message: 'Portfolio has experienced significant losses - consider holding for recovery'
      });
    }
    
    return {
      summary: {
        totalValue,
        totalCost,
        totalReturn,
        returnPercent,
        investmentCount: userInvestments.length,
        riskLevel,
      },
      allocation: allocationPercentages,
      riskAlignment: {
        userRiskTolerance: riskProfile.riskTolerance || 'moderate',
        portfolioRisk: riskLevel,
        aligned: riskLevel === 'low' || 
                (riskLevel === 'medium' && riskProfile.riskTolerance !== 'conservative'),
      },
      recommendations,
      riskProfile: {
        score: riskProfile.analysis?.score || 50,
        tolerance: riskProfile.analysis?.tolerance || 'moderate',
      },
    };
  } catch (error) {
    console.error('Error analyzing portfolio:', error);
    throw error;
  }
};

/**
 * Get current market insights
 * @returns {Promise<Array>} - Array of market insights
 */
export const getMarketInsights = async () => {
  try {
    // Generate mock market insights
    // In production, this would integrate with real market data APIs
    const insights = [
      {
        id: `insight-${Date.now()}-1`,
        title: 'Federal Reserve Policy Outlook',
        summary: 'The Federal Reserve has indicated a potential pause in rate hikes. This could benefit bond prices and growth stocks.',
        category: 'economy',
        sentiment: 'neutral',
        source: 'Market Analysis',
        publishedAt: new Date().toISOString(),
        relatedSymbols: ['SPY', 'TLT', 'QQQ'],
        impact: 'high',
      },
      {
        id: `insight-${Date.now()}-2`,
        title: 'Technology Sector Outlook',
        summary: 'Tech stocks continue to show resilience despite macroeconomic concerns. AI-related investments remain in focus.',
        category: 'stocks',
        sentiment: 'bullish',
        source: 'Sector Analysis',
        publishedAt: new Date().toISOString(),
        relatedSymbols: ['NVDA', 'MSFT', 'GOOGL'],
        impact: 'medium',
      },
      {
        id: `insight-${Date.now()}-3`,
        title: 'Bond Market Update',
        summary: 'Yields have stabilized, making bonds more attractive for income-focused investors.',
        category: 'bonds',
        sentiment: 'bullish',
        source: 'Fixed Income Analysis',
        publishedAt: new Date().toISOString(),
        relatedSymbols: ['BND', 'AGG', 'VCIT'],
        impact: 'medium',
      },
      {
        id: `insight-${Date.now()}-4`,
        title: 'Cryptocurrency Market Trends',
        summary: 'Cryptocurrency markets remain volatile. Consider limiting crypto exposure to a small portion of your portfolio.',
        category: 'crypto',
        sentiment: 'neutral',
        source: 'Crypto Analysis',
        publishedAt: new Date().toISOString(),
        relatedSymbols: ['BTC', 'ETH'],
        impact: 'low',
      },
    ];
    
    return insights;
  } catch (error) {
    console.error('Error fetching market insights:', error);
    throw error;
  }
};

export default {
  getPersonalizedRecommendations,
  analyzePortfolio,
  getMarketInsights,
};
