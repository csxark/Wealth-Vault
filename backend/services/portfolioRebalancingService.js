import { eq, and, desc, sql, gt, lt } from 'drizzle-orm';
import db from '../config/db.js';
import { 
  portfolios, 
  investments, 
  portfolioRebalancing,
  investmentRiskProfiles 
} from '../db/schema.js';
import { logAuditEventAsync, AuditActions, ResourceTypes } from './auditService.js';
import portfolioService from './portfolioService.js';
import riskProfileService from './riskProfileService.js';

/**
 * Portfolio Rebalancing Service
 * Handles automated portfolio monitoring, threshold-based alerts, and intelligent rebalancing recommendations
 */

// Default threshold for rebalancing (5% drift)
const DEFAULT_REBALANCING_THRESHOLD = 5;
// Maximum recommended drift before triggering high-priority alert
const HIGH_PRIORITY_THRESHOLD = 10;

/**
 * Check if portfolio allocation has drifted beyond threshold
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID
 * @param {number} threshold - Drift threshold percentage
 * @returns {Promise<Object>} - Drift analysis result
 */
export const checkPortfolioDrift = async (portfolioId, userId, threshold = DEFAULT_REBALANCING_THRESHOLD) => {
  try {
    const portfolio = await portfolioService.getPortfolioById(portfolioId, userId);
    if (!portfolio) {
      throw new Error('Portfolio not found or access denied');
    }

    // Get current allocation
    const allocation = await portfolioService.getPortfolioAllocation(portfolioId, userId);
    
    // Get target allocation from portfolio or risk profile
    let targetAllocation = portfolio.targetAllocation || {};
    
    // If no target allocation set, use risk profile recommendations
    if (Object.keys(targetAllocation).length === 0) {
      const riskProfile = await riskProfileService.getRiskProfile(userId);
      if (riskProfile?.metadata?.recommendation?.allocation) {
        targetAllocation = riskProfile.metadata.recommendation.allocation;
      } else {
        // Default target allocation
        targetAllocation = {
          stocks: 60,
          bonds: 30,
          cash: 10,
          alternatives: 0
        };
      }
    }

    // Calculate drift for each asset class
    const driftAnalysis = [];
    const assetClasses = ['stocks', 'bonds', 'cash', 'alternatives', 'equity', 'fixed_income', 'alternative'];
    
    for (const assetClass of assetClasses) {
      const currentPct = allocation.byAssetClass[assetClass]?.percentage || 0;
      const targetPct = targetAllocation[assetClass] || 0;
      const drift = currentPct - targetPct;
      
      if (Math.abs(drift) > 0.5) { // Only include if there's meaningful difference
        driftAnalysis.push({
          assetClass: mapAssetClass(assetClass),
          currentPercentage: currentPct,
          targetPercentage: targetPct,
          drift: drift,
          isOverThreshold: Math.abs(drift) >= threshold,
          isHighPriority: Math.abs(drift) >= HIGH_PRIORITY_THRESHOLD,
          currentValue: allocation.byAssetClass[assetClass]?.value || 0,
          targetValue: (targetPct / 100) * allocation.totalValue,
          adjustmentNeeded: ((drift / 100) * allocation.totalValue)
        });
      }
    }

    // Sort by absolute drift (highest first)
    driftAnalysis.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

    // Determine overall portfolio status
    const overThreshold = driftAnalysis.filter(d => d.isOverThreshold);
    const needsRebalancing = overThreshold.length > 0;
    const highPriorityDrift = driftAnalysis.filter(d => d.isHighPriority);

    return {
      portfolioId,
      portfolioName: portfolio.name,
      totalValue: allocation.totalValue,
      threshold,
      needsRebalancing,
      priority: highPriorityDrift.length > 0 ? 'high' : (overThreshold.length > 0 ? 'medium' : 'low'),
      driftAnalysis,
      targetAllocation,
      currentAllocation: Object.fromEntries(
        Object.entries(allocation.byAssetClass).map(([k, v]) => [k, v.percentage])
      ),
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error checking portfolio drift:', error);
    throw error;
  }
};

/**
 * Map various asset class names to standardized names
 */
const mapAssetClass = (assetClass) => {
  const mapping = {
    'equity': 'stocks',
    'fixed_income': 'bonds',
    'alternative': 'alternatives',
    'Stock': 'stocks',
    'Bond': 'bonds',
    'ETF': 'stocks',
    'Mutual Fund': 'stocks',
    'Crypto': 'alternatives'
  };
  return mapping[assetClass] || assetClass;
};

/**
 * Get rebalancing alerts for a portfolio
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of rebalancing alerts
 */
export const getRebalancingAlerts = async (portfolioId, userId, options = {}) => {
  try {
    const { threshold = DEFAULT_REBALANCING_THRESHOLD, includeResolved = false } = options;
    
    // Check current drift
    const driftResult = await checkPortfolioDrift(portfolioId, userId, threshold);
    
    // Convert drift analysis to alerts
    const alerts = driftResult.driftAnalysis
      .filter(d => d.isOverThreshold)
      .map(drift => ({
        id: `alert-${drift.assetClass}-${Date.now()}`,
        portfolioId,
        portfolioName: driftResult.portfolioName,
        assetClass: drift.assetClass,
        type: 'drift',
        priority: drift.isHighPriority ? 'high' : 'medium',
        status: 'active',
        currentAllocation: drift.currentPercentage,
        targetAllocation: drift.targetPercentage,
        drift: drift.drift,
        amount: drift.adjustmentNeeded,
        message: drift.drift > 0 
          ? `${drift.assetClass} is ${Math.abs(drift.drift).toFixed(1)}% over target. Consider selling $${Math.abs(drift.adjustmentNeeded).toFixed(2)} to rebalance.`
          : `${drift.assetClass} is ${Math.abs(drift.drift).toFixed(1)}% under target. Consider buying $${Math.abs(drift.adjustmentNeeded).toFixed(2)} to rebalance.`,
        createdAt: new Date().toISOString(),
        metadata: {
          threshold,
          totalValue: driftResult.totalValue,
          currentValue: drift.currentValue,
          targetValue: drift.targetValue
        }
      }));

    // Sort by priority (high first) then by drift amount
    alerts.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (b.priority === 'high' && a.priority !== 'high') return 1;
      return Math.abs(b.drift) - Math.abs(a.drift);
    });

    return {
      alerts,
      summary: {
        total: alerts.length,
        highPriority: alerts.filter(a => a.priority === 'high').length,
        mediumPriority: alerts.filter(a => a.priority === 'medium').length,
        needsRebalancing: driftResult.needsRebalancing,
        overallPriority: driftResult.priority
      }
    };
  } catch (error) {
    console.error('Error getting rebalancing alerts:', error);
    throw error;
  }
};

/**
 * Generate intelligent rebalancing recommendations
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID
 * @param {Object} options - Recommendation options
 * @returns {Promise<Object>} - Rebalancing recommendations
 */
export const getRebalancingRecommendations = async (portfolioId, userId, options = {}) => {
  try {
    const { 
      threshold = DEFAULT_REBALANCING_THRESHOLD,
      optimizationEnabled = true,
      taxEfficient = false
    } = options;

    // Get portfolio summary
    const summary = await portfolioService.getPortfolioSummary(portfolioId, userId);
    if (!summary) {
      throw new Error('Portfolio not found or access denied');
    }

    // Get current drift analysis
    const driftResult = await checkPortfolioDrift(portfolioId, userId, threshold);
    
    // Get risk profile for additional context
    const riskProfile = await riskProfileService.getRiskProfileWithAnalysis(userId);

    // Generate recommendations based on drift analysis
    const recommendations = [];
    
    // Process each asset class that needs rebalancing
    for (const drift of driftResult.driftAnalysis.filter(d => d.isOverThreshold)) {
      const recommendation = {
        id: `rec-${drift.assetClass}-${Date.now()}`,
        type: drift.drift > 0 ? 'sell' : 'buy',
        assetClass: drift.assetClass,
        priority: drift.isHighPriority ? 'high' : 'medium',
        currentAllocation: drift.currentPercentage,
        targetAllocation: drift.targetPercentage,
        drift: drift.drift,
        amount: Math.abs(drift.adjustmentNeeded),
        
        // Find specific investments to trade
        trades: [],
        
        // Reasoning
        reasoning: generateRebalancingReasoning(drift, riskProfile, summary),
        
        // Risk assessment
        riskAssessment: assessRebalancingRisk(drift, riskProfile),
        
        // Estimated impact
        estimatedImpact: {
          portfolioValue: driftResult.totalValue,
          rebalancingAmount: Math.abs(drift.adjustmentNeeded),
          percentageOfPortfolio: (Math.abs(drift.adjustmentNeeded) / driftResult.totalValue) * 100
        },
        
        createdAt: new Date().toISOString()
      };

      // Find specific investments to trade for this asset class
      const assetClassInvestments = summary.investments.filter(inv => {
        const invAssetClass = mapAssetClass(inv.assetClass || inv.type);
        return invAssetClass === drift.assetClass;
      });

      if (recommendation.type === 'sell' && assetClassInvestments.length > 0) {
        // Recommend selling from overweight asset class
        const totalValue = assetClassInvestments.reduce((sum, inv) => sum + parseFloat(inv.marketValue || 0), 0);
        
        for (const investment of assetClassInvestments) {
          const invValue = parseFloat(investment.marketValue || 0);
          const proportion = totalValue > 0 ? invValue / totalValue : 0;
          const sellAmount = Math.abs(drift.adjustmentNeeded) * proportion;
          
          if (sellAmount > 0 && invValue > 0) {
            recommendation.trades.push({
              investmentId: investment.id,
              symbol: investment.symbol,
              name: investment.name,
              action: 'sell',
              quantity: sellAmount / parseFloat(investment.currentPrice || investment.averageCost),
              amount: sellAmount,
              currentAllocation: (invValue / driftResult.totalValue) * 100
            });
          }
        }
      } else if (recommendation.type === 'buy' && summary.investments.length > 0) {
        // Recommend buying - suggest adding to existing positions or new positions
        recommendation.trades.push({
          action: 'buy',
          assetClass: drift.assetClass,
          amount: Math.abs(drift.adjustmentNeeded),
          suggestion: getBuyingSuggestion(drift.assetClass, riskProfile)
        });
      }

      recommendations.push(recommendation);
    }

    // Sort by priority and amount
    recommendations.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (b.priority === 'high' && a.priority !== 'high') return 1;
      return b.amount - a.amount;
    });

    // Add general recommendations if portfolio doesn't need rebalancing
    if (recommendations.length === 0) {
      recommendations.push({
        id: `rec-maintain-${Date.now()}`,
        type: 'maintain',
        priority: 'low',
        message: 'Your portfolio is well-balanced. Continue monitoring to maintain your target allocation.',
        reasoning: 'All asset classes are within the acceptable threshold range.',
        createdAt: new Date().toISOString()
      });
    }

    return {
      portfolioId,
      portfolioName: summary.name,
      totalValue: summary.totalValue,
      needsRebalancing: driftResult.needsRebalancing,
      recommendations,
      riskProfile: riskProfile.hasProfile ? {
        riskTolerance: riskProfile.profile.riskTolerance,
        investmentHorizon: riskProfile.profile.investmentHorizon,
        score: riskProfile.profile.riskScore
      } : null,
      settings: {
        threshold,
        optimizationEnabled,
        taxEfficient
      },
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error generating rebalancing recommendations:', error);
    throw error;
  }
};

/**
 * Generate reasoning for rebalancing recommendation
 */
const generateRebalancingReasoning = (drift, riskProfile, summary) => {
  const reasons = [];
  
  if (drift.drift > 0) {
    reasons.push(`Your ${drift.assetClass} allocation is ${Math.abs(drift.drift).toFixed(1)}% above your target.`);
    
    if (riskProfile.hasProfile) {
      if (riskProfile.profile.riskTolerance === 'conservative' && drift.assetClass === 'stocks') {
        reasons.push('This exceeds the conservative allocation recommended for your risk profile.');
      } else if (riskProfile.profile.riskTolerance === 'aggressive' && drift.assetClass === 'cash') {
        reasons.push('Holding too much cash may limit your growth potential based on your aggressive risk tolerance.');
      }
    }
    
    reasons.push(`Consider reducing your ${drift.assetClass} exposure to rebalance your portfolio.`);
  } else {
    reasons.push(`Your ${drift.assetClass} allocation is ${Math.abs(drift.drift).toFixed(1)}% below your target.`);
    
    if (riskProfile.hasProfile && drift.assetClass === 'stocks') {
      reasons.push('Increasing stock allocation can help achieve long-term growth targets.');
    }
    
    reasons.push(`Consider increasing your ${drift.assetClass} exposure to achieve your target allocation.`);
  }
  
  return reasons.join(' ');
};

/**
 * Assess risk of rebalancing action
 */
const assessRebalancingRisk = (drift, riskProfile) => {
  const riskFactors = [];
  let riskLevel = 'low';
  
  // Check drift magnitude
  if (Math.abs(drift.drift) > 15) {
    riskFactors.push('Large drift requires significant trades');
    riskLevel = 'medium';
  }
  
  // Check if it's a sell recommendation (generally higher risk)
  if (drift.drift > 0) {
    riskFactors.push('Selling may trigger capital gains taxes');
    if (riskLevel === 'low') riskLevel = 'medium';
  }
  
  // Check risk profile alignment
  if (riskProfile.hasProfile) {
    if (riskProfile.profile.riskTolerance === 'conservative' && drift.assetClass === 'stocks') {
      riskFactors.push('Reducing stocks aligns with conservative profile');
    } else if (riskProfile.profile.riskTolerance === 'aggressive' && drift.assetClass === 'cash') {
      riskFactors.push('Adding to stocks aligns with aggressive profile');
    }
  }
  
  return {
    level: riskLevel,
    factors: riskFactors
  };
};

/**
 * Get buying suggestion based on asset class and risk profile
 */
const getBuyingSuggestion = (assetClass, riskProfile) => {
  const suggestions = {
    stocks: {
      lowCost: ['Index ETFs (SPY, VTI)', 'Total Market Funds'],
      specific: riskProfile?.profile?.riskTolerance === 'aggressive' 
        ? 'Growth ETFs, Sector ETFs'
        : 'Dividend ETFs, Blue Chip Stocks'
    },
    bonds: {
      lowCost: ['Bond ETFs (BND, AGG)', 'Treasury Bonds'],
      specific: 'Investment Grade Corporate Bonds, Municipal Bonds'
    },
    cash: {
      lowCost: ['High-Yield Savings', 'Money Market Funds'],
      specific: 'Short-Term CDs, Treasury Bills'
    },
    alternatives: {
      lowCost: ['Real Estate ETFs', 'Commodity ETFs'],
      specific: 'Gold ETFs, International Real Estate'
    }
  };
  
  return suggestions[assetClass] || { lowCost: ['Diversified Fund'], specific: 'Consult financial advisor' };
};

/**
 * Record rebalancing action in history
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID
 * @param {Object} rebalanceData - Rebalancing data
 * @returns {Promise<Object>} - Created rebalancing record
 */
export const recordRebalancing = async (portfolioId, userId, rebalanceData) => {
  try {
    const portfolio = await portfolioService.getPortfolioById(portfolioId, userId);
    if (!portfolio) {
      throw new Error('Portfolio not found or access denied');
    }

    // Get current allocation before rebalancing
    const beforeAllocation = await portfolioService.getPortfolioAllocation(portfolioId, userId);
    
    // Create rebalancing record
    const [record] = await db
      .insert(portfolioRebalancing)
      .values({
        userId,
        portfolioId,
        rebalanceType: rebalanceData.type || 'manual',
        triggerReason: rebalanceData.triggerReason || 'user_initiated',
        beforeAllocation: {
          totalValue: beforeAllocation.totalValue,
          byAssetClass: Object.fromEntries(
            Object.entries(beforeAllocation.byAssetClass).map(([k, v]) => [k, v.percentage])
          )
        },
        beforeValue: beforeAllocation.totalValue.toString(),
        afterAllocation: rebalanceData.afterAllocation,
        afterValue: rebalanceData.afterValue,
        actions: rebalanceData.actions || [],
        status: 'completed',
        completedAt: new Date(),
        expectedImprovement: rebalanceData.expectedImprovement,
        notes: rebalanceData.notes,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.REBALANCE,
      resourceType: ResourceTypes.PORTFOLIO,
      resourceId: portfolioId,
      metadata: {
        portfolioName: portfolio.name,
        type: rebalanceData.type,
        actions: rebalanceData.actions?.length || 0
      },
      status: 'success'
    });

    return record;
  } catch (error) {
    console.error('Error recording rebalancing:', error);
    throw error;
  }
};

/**
 * Get rebalancing history for a portfolio
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Rebalancing history
 */
export const getRebalancingHistory = async (portfolioId, userId, options = {}) => {
  try {
    const { limit = 10, offset = 0 } = options;

    const history = await db
      .select()
      .from(portfolioRebalancing)
      .where(
        and(
          eq(portfolioRebalancing.portfolioId, portfolioId),
          eq(portfolioRebalancing.userId, userId)
        )
      )
      .orderBy(desc(portfolioRebalancing.completedAt))
      .limit(limit)
      .offset(offset);

    return history;
  } catch (error) {
    console.error('Error getting rebalancing history:', error);
    throw error;
  }
};

/**
 * Get rebalancing settings for a portfolio
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Rebalancing settings
 */
export const getRebalancingSettings = async (portfolioId, userId) => {
  try {
    const portfolio = await portfolioService.getPortfolioById(portfolioId, userId);
    if (!portfolio) {
      throw new Error('Portfolio not found or access denied');
    }

    // Get settings from portfolio metadata or use defaults
    const settings = portfolio.metadata?.rebalancingSettings || {
      threshold: DEFAULT_REBALANCING_THRESHOLD,
      autoRebalance: false,
      rebalanceFrequency: 'monthly',
      notifyOnDrift: true,
      highPriorityThreshold: HIGH_PRIORITY_THRESHOLD
    };

    return {
      portfolioId,
      portfolioName: portfolio.name,
      settings
    };
  } catch (error) {
    console.error('Error getting rebalancing settings:', error);
    throw error;
  }
};

/**
 * Update rebalancing settings for a portfolio
 * @param {string} portfolioId - Portfolio ID
 * @param {string} userId - User ID
 * @param {Object} settings - New settings
 * @returns {Promise<Object>} - Updated portfolio
 */
export const updateRebalancingSettings = async (portfolioId, userId, settings) => {
  try {
    const portfolio = await portfolioService.getPortfolioById(portfolioId, userId);
    if (!portfolio) {
      throw new Error('Portfolio not found or access denied');
    }

    // Validate settings
    if (settings.threshold !== undefined) {
      if (settings.threshold < 1 || settings.threshold > 20) {
        throw new Error('Threshold must be between 1 and 20 percent');
      }
    }

    // Merge with existing metadata
    const currentMetadata = portfolio.metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      rebalancingSettings: {
        ...(currentMetadata.rebalancingSettings || {}),
        ...settings,
        lastUpdated: new Date().toISOString()
      }
    };

    // Update portfolio
    const [updated] = await db
      .update(portfolios)
      .set({
        metadata: updatedMetadata,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(portfolios.id, portfolioId),
          eq(portfolios.userId, userId)
        )
      )
      .returning();

    // Log audit event
    await logAuditEventAsync({
      userId,
      action: AuditActions.UPDATE,
      resourceType: ResourceTypes.PORTFOLIO,
      resourceId: portfolioId,
      metadata: {
        updatedFields: Object.keys(settings),
        rebalancingSettings: true
      },
      status: 'success'
    });

    return {
      portfolioId,
      portfolioName: updated.name,
      settings: updatedMetadata.rebalancingSettings
    };
  } catch (error) {
    console.error('Error updating rebalancing settings:', error);
    throw error;
  }
};

/**
 * Check all user portfolios for drift (for scheduled jobs)
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of portfolios needing attention
 */
export const checkAllPortfoliosDrift = async (userId) => {
  try {
    const userPortfolios = await portfolioService.getPortfolios(userId);
    
    const results = [];
    
    for (const portfolio of userPortfolios) {
      try {
        const driftResult = await checkPortfolioDrift(portfolio.id, userId);
        if (driftResult.needsRebalancing) {
          results.push({
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            ...driftResult
          });
        }
      } catch (error) {
        console.error(`Error checking drift for portfolio ${portfolio.id}:`, error);
      }
    }
    
    // Sort by priority
    results.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    
    return results;
  } catch (error) {
    console.error('Error checking all portfolios drift:', error);
    throw error;
  }
};

export default {
  checkPortfolioDrift,
  getRebalancingAlerts,
  getRebalancingRecommendations,
  recordRebalancing,
  getRebalancingHistory,
  getRebalancingSettings,
  updateRebalancingSettings,
  checkAllPortfoliosDrift
};
