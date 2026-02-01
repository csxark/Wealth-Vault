/**
 * Anomaly Detection Service
 * Detects suspicious transactions based on 90-day spending profile
 * Uses statistical analysis to identify patterns outside normal behavior
 */

import { db } from '../config/db.js';
import { expenses, securityMarkers, categories } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql, ne } from 'drizzle-orm';

/**
 * Calculate baseline spending profile for the last 90 days
 * @param {string} userId - User ID
 * @param {string} categoryId - Optional category ID for category-specific analysis
 * @returns {Promise<Object>} Baseline spending profile
 */
export async function calculateSpendingBaseline(userId, categoryId = null) {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const conditions = [
      eq(expenses.userId, userId),
      gte(expenses.date, ninetyDaysAgo),
      eq(expenses.status, 'completed')
    ];

    if (categoryId) {
      conditions.push(eq(expenses.categoryId, categoryId));
    }

    // Get all expenses for the period
    const recentExpenses = await db
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.date));

    if (recentExpenses.length === 0) {
      return {
        hasData: false,
        transactionCount: 0,
        meanAmount: 0,
        medianAmount: 0,
        stdDev: 0,
        maxAmount: 0,
        minAmount: 0,
        avgTransactionsPerDay: 0,
        commonCategories: [],
        commonPaymentMethods: [],
        timePatterns: {}
      };
    }

    // Convert amounts to numbers
    const amounts = recentExpenses.map(exp => parseFloat(exp.amount));
    
    // Calculate statistics
    const meanAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const sortedAmounts = [...amounts].sort((a, b) => a - b);
    const medianAmount = sortedAmounts[Math.floor(sortedAmounts.length / 2)];
    const maxAmount = Math.max(...amounts);
    const minAmount = Math.min(...amounts);

    // Calculate standard deviation
    const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - meanAmount, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // Analyze transaction frequency
    const dayCount = 90;
    const avgTransactionsPerDay = recentExpenses.length / dayCount;
    
    // Analyze by hour of day
    const timePatterns = {
      hourDistribution: {},
      dayOfWeekDistribution: {}
    };

    recentExpenses.forEach(exp => {
      const date = new Date(exp.date);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();

      timePatterns.hourDistribution[hour] = (timePatterns.hourDistribution[hour] || 0) + 1;
      timePatterns.dayOfWeekDistribution[dayOfWeek] = (timePatterns.dayOfWeekDistribution[dayOfWeek] || 0) + 1;
    });

    // Most common categories
    const categoryFrequency = {};
    recentExpenses.forEach(exp => {
      if (exp.categoryId) {
        categoryFrequency[exp.categoryId] = (categoryFrequency[exp.categoryId] || 0) + 1;
      }
    });

    const commonCategories = Object.entries(categoryFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([catId, count]) => ({ categoryId: catId, count }));

    // Most common payment methods
    const paymentMethodFrequency = {};
    recentExpenses.forEach(exp => {
      const method = exp.paymentMethod || 'other';
      paymentMethodFrequency[method] = (paymentMethodFrequency[method] || 0) + 1;
    });

    const commonPaymentMethods = Object.entries(paymentMethodFrequency)
      .sort(([, a], [, b]) => b - a)
      .map(([method, count]) => ({ method, count }));

    // Detect location patterns if available
    const locationPatterns = {};
    recentExpenses.forEach(exp => {
      if (exp.location) {
        const location = typeof exp.location === 'string' ? exp.location : JSON.stringify(exp.location);
        locationPatterns[location] = (locationPatterns[location] || 0) + 1;
      }
    });

    return {
      hasData: true,
      transactionCount: recentExpenses.length,
      meanAmount,
      medianAmount,
      stdDev,
      maxAmount,
      minAmount,
      avgTransactionsPerDay,
      percentile75: sortedAmounts[Math.floor(sortedAmounts.length * 0.75)],
      percentile90: sortedAmounts[Math.floor(sortedAmounts.length * 0.90)],
      percentile95: sortedAmounts[Math.floor(sortedAmounts.length * 0.95)],
      commonCategories,
      commonPaymentMethods,
      timePatterns,
      locationPatterns
    };
  } catch (error) {
    console.error('Error calculating spending baseline:', error);
    throw error;
  }
}

/**
 * Detect if an expense is anomalous based on statistical analysis
 * @param {string} userId - User ID
 * @param {Object} expenseData - Expense data to analyze
 * @returns {Promise<Object>} Anomaly detection result
 */
export async function detectExpenseAnomaly(userId, expenseData) {
  try {
    const { amount, categoryId, date, location, description, paymentMethod } = expenseData;
    const expenseAmount = parseFloat(amount);
    
    // Get baseline for the user
    const baseline = await calculateSpendingBaseline(userId, categoryId);

    if (!baseline.hasData) {
      // New user or insufficient data - apply conservative checks
      if (expenseAmount > 1000) {
        return {
          isAnomalous: true,
          severity: 'high',
          markerType: 'unusual_amount',
          reason: 'High-value transaction for new user profile',
          confidence: 0.70,
          requiresMFA: expenseAmount > 5000,
          details: {
            amount: expenseAmount,
            threshold: 1000,
            message: 'Insufficient historical data for baseline analysis'
          }
        };
      }
      return { isAnomalous: false };
    }

    const anomalies = [];

    // 1. Check for unusual amounts (beyond 2.5 standard deviations)
    const zScore = (expenseAmount - baseline.meanAmount) / baseline.stdDev;
    if (Math.abs(zScore) > 2.5) {
      const deviationPercent = ((expenseAmount - baseline.meanAmount) / baseline.meanAmount) * 100;
      anomalies.push({
        type: 'unusual_amount',
        severity: Math.abs(zScore) > 3.5 ? 'critical' : 'high',
        reason: `Amount ${expenseAmount.toFixed(2)} is ${Math.abs(deviationPercent).toFixed(1)}% ${zScore > 0 ? 'above' : 'below'} your average`,
        confidence: 0.85,
        details: {
          zScore: zScore.toFixed(2),
          deviationPercent: deviationPercent.toFixed(1),
          baselineAverage: baseline.meanAmount.toFixed(2),
          threshold: (baseline.meanAmount + 2.5 * baseline.stdDev).toFixed(2)
        }
      });
    }

    // 2. Check for amounts exceeding 95th percentile
    if (expenseAmount > baseline.percentile95) {
      anomalies.push({
        type: 'high_value',
        severity: expenseAmount > baseline.maxAmount * 1.5 ? 'critical' : 'medium',
        reason: `Amount exceeds 95% of your historical transactions`,
        confidence: 0.80,
        details: {
          amount: expenseAmount,
          percentile95: baseline.percentile95.toFixed(2),
          maxHistorical: baseline.maxAmount.toFixed(2)
        }
      });
    }

    // 3. Rapid-fire detection - check for multiple transactions in short time
    const recentTransactions = await checkRapidFireTransactions(userId, date);
    if (recentTransactions.isRapidFire) {
      anomalies.push({
        type: 'rapid_fire',
        severity: recentTransactions.count > 10 ? 'critical' : 'high',
        reason: `${recentTransactions.count} transactions in ${recentTransactions.timeWindow} minutes`,
        confidence: 0.90,
        details: recentTransactions
      });
    }

    // 4. Unusual time pattern detection
    const expenseDate = new Date(date);
    const hour = expenseDate.getHours();
    const dayOfWeek = expenseDate.getDay();
    
    const hourFrequency = baseline.timePatterns.hourDistribution[hour] || 0;
    const avgHourFrequency = Object.values(baseline.timePatterns.hourDistribution).reduce((a, b) => a + b, 0) / 24;
    
    if (hourFrequency < avgHourFrequency * 0.2) { // Less than 20% of average
      anomalies.push({
        type: 'unusual_time',
        severity: 'low',
        reason: `Transaction at ${hour}:00 is unusual for your spending pattern`,
        confidence: 0.65,
        details: {
          hour,
          frequency: hourFrequency,
          avgFrequency: avgHourFrequency.toFixed(2)
        }
      });
    }

    // 5. Unusual category check
    if (categoryId) {
      const categoryFound = baseline.commonCategories.find(c => c.categoryId === categoryId);
      if (!categoryFound && baseline.commonCategories.length > 0) {
        anomalies.push({
          type: 'unusual_category',
          severity: 'low',
          reason: 'Transaction in an uncommon category',
          confidence: 0.60,
          details: {
            categoryId,
            commonCategories: baseline.commonCategories.map(c => c.categoryId)
          }
        });
      }
    }

    // 6. Geographical anomaly (if location data available)
    if (location && Object.keys(baseline.locationPatterns).length > 0) {
      const locationStr = typeof location === 'string' ? location : JSON.stringify(location);
      if (!baseline.locationPatterns[locationStr]) {
        anomalies.push({
          type: 'geo_anomaly',
          severity: 'medium',
          reason: 'Transaction from an unusual location',
          confidence: 0.75,
          details: {
            location: locationStr,
            knownLocations: Object.keys(baseline.locationPatterns).slice(0, 5)
          }
        });
      }
    }

    // Aggregate results
    if (anomalies.length === 0) {
      return { isAnomalous: false };
    }

    // Determine overall severity
    const severityLevels = { low: 1, medium: 2, high: 3, critical: 4 };
    const maxSeverity = anomalies.reduce((max, anomaly) => {
      const level = severityLevels[anomaly.severity] || 0;
      return level > max ? level : max;
    }, 0);

    const severityMap = ['low', 'low', 'medium', 'high', 'critical'];
    const overallSeverity = severityMap[maxSeverity];

    // Determine if MFA is required
    const requiresMFA = overallSeverity === 'critical' || 
                       expenseAmount > baseline.percentile95 * 2 || 
                       expenseAmount > 10000;

    return {
      isAnomalous: true,
      severity: overallSeverity,
      markerType: anomalies[0].type, // Primary marker type
      reason: anomalies.map(a => a.reason).join('; '),
      confidence: anomalies.reduce((sum, a) => sum + a.confidence, 0) / anomalies.length,
      requiresMFA,
      anomalies,
      baseline: {
        meanAmount: baseline.meanAmount.toFixed(2),
        transactionCount: baseline.transactionCount,
        avgPerDay: baseline.avgTransactionsPerDay.toFixed(2)
      }
    };
  } catch (error) {
    console.error('Error detecting expense anomaly:', error);
    throw error;
  }
}

/**
 * Check for rapid-fire transactions (multiple transactions in short time)
 * @param {string} userId - User ID
 * @param {Date} currentDate - Current transaction date
 * @returns {Promise<Object>} Rapid-fire detection result
 */
async function checkRapidFireTransactions(userId, currentDate) {
  try {
    const currentTime = new Date(currentDate);
    const fifteenMinutesAgo = new Date(currentTime.getTime() - 15 * 60 * 1000);
    
    const recentCount = await db
      .select({ count: sql`count(*)` })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.createdAt, fifteenMinutesAgo),
          lte(expenses.createdAt, currentTime)
        )
      );

    const count = Number(recentCount[0]?.count || 0);

    return {
      isRapidFire: count >= 5, // 5+ transactions in 15 minutes
      count,
      timeWindow: 15,
      threshold: 5
    };
  } catch (error) {
    console.error('Error checking rapid-fire transactions:', error);
    return { isRapidFire: false, count: 0 };
  }
}

/**
 * Create a security marker for an anomalous expense
 * @param {string} userId - User ID
 * @param {string} expenseId - Expense ID
 * @param {Object} anomalyResult - Anomaly detection result
 * @returns {Promise<Object>} Created security marker
 */
export async function createSecurityMarker(userId, expenseId, anomalyResult) {
  try {
    const [marker] = await db
      .insert(securityMarkers)
      .values({
        userId,
        expenseId,
        markerType: anomalyResult.markerType,
        severity: anomalyResult.severity,
        status: 'pending',
        detectionMethod: 'statistical_analysis',
        anomalyDetails: {
          reason: anomalyResult.reason,
          confidence: anomalyResult.confidence,
          anomalies: anomalyResult.anomalies || [],
          baseline: anomalyResult.baseline || {},
          detectedAt: new Date().toISOString()
        },
        requiresMFA: anomalyResult.requiresMFA || false,
        autoResolve: anomalyResult.severity === 'low',
        autoResolveAt: anomalyResult.severity === 'low' 
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
          : null,
        metadata: {
          triggerRules: anomalyResult.anomalies?.map(a => a.type) || [],
          userNotified: false,
          escalationLevel: anomalyResult.severity === 'critical' ? 1 : 0
        }
      })
      .returning();

    return marker;
  } catch (error) {
    console.error('Error creating security marker:', error);
    throw error;
  }
}

/**
 * Get pending security markers for a user
 * @param {string} userId - User ID
 * @returns {Promise<Array>} Array of pending security markers
 */
export async function getPendingSecurityMarkers(userId) {
  try {
    const markers = await db.query.securityMarkers.findMany({
      where: and(
        eq(securityMarkers.userId, userId),
        eq(securityMarkers.status, 'pending')
      ),
      with: {
        expense: {
          with: {
            category: {
              columns: { name: true, icon: true, color: true }
            }
          }
        }
      },
      orderBy: [desc(securityMarkers.createdAt)]
    });

    return markers;
  } catch (error) {
    console.error('Error fetching pending security markers:', error);
    throw error;
  }
}

/**
 * Clear a security marker after MFA verification
 * @param {string} markerId - Security marker ID
 * @param {string} userId - User ID (for verification)
 * @returns {Promise<Object>} Updated security marker
 */
export async function clearSecurityMarker(markerId, userId) {
  try {
    const [marker] = await db
      .update(securityMarkers)
      .set({
        status: 'cleared',
        mfaVerifiedAt: new Date(),
        reviewedBy: userId,
        reviewedAt: new Date(),
        updatedAt: new Date()
      })
      .where(
        and(
          eq(securityMarkers.id, markerId),
          eq(securityMarkers.userId, userId)
        )
      )
      .returning();

    return marker;
  } catch (error) {
    console.error('Error clearing security marker:', error);
    throw error;
  }
}

/**
 * Get security statistics for dashboard
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Security statistics
 */
export async function getSecurityStatistics(userId) {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [stats] = await db
      .select({
        total: sql`count(*)`,
        pending: sql`count(*) filter (where ${securityMarkers.status} = 'pending')`,
        cleared: sql`count(*) filter (where ${securityMarkers.status} = 'cleared')`,
        blocked: sql`count(*) filter (where ${securityMarkers.status} = 'blocked')`,
        critical: sql`count(*) filter (where ${securityMarkers.severity} = 'critical')`,
        high: sql`count(*) filter (where ${securityMarkers.severity} = 'high')`
      })
      .from(securityMarkers)
      .where(
        and(
          eq(securityMarkers.userId, userId),
          gte(securityMarkers.createdAt, thirtyDaysAgo)
        )
      );

    return {
      total: Number(stats?.total || 0),
      pending: Number(stats?.pending || 0),
      cleared: Number(stats?.cleared || 0),
      blocked: Number(stats?.blocked || 0),
      critical: Number(stats?.critical || 0),
      high: Number(stats?.high || 0),
      period: '30 days'
    };
  } catch (error) {
    console.error('Error fetching security statistics:', error);
    throw error;
  }
}

export default {
  calculateSpendingBaseline,
  detectExpenseAnomaly,
  createSecurityMarker,
  getPendingSecurityMarkers,
  clearSecurityMarker,
  getSecurityStatistics
};
