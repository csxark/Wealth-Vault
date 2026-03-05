import { db } from '../db/index.js';
import { seasonalPatterns } from '../db/schema.js';
import { expenses, budgets } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Seasonal Pattern Detection Service
 * Issue #668
 * 
 * Detects seasonal spending patterns and trends
 */

export class SeasonalPatternDetectionService {
  /**
   * Analyze and detect seasonal patterns
   */
  async detectSeasonalPatterns(userId, tenantId, category = null) {
    try {
      // Fetch 2 years of data for seasonal analysis
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      const expenseData = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            eq(expenses.tenantId, tenantId),
            category ? eq(expenses.categoryId, category) : true,
            (t) => t.date >= twoYearsAgo
          )
        )
        .orderBy((t) => t.date);

      if (expenseData.length < 24) {
        return {
          patternsDetected: false,
          message: 'Insufficient data for seasonal analysis',
          dataPoints: expenseData.length,
        };
      }

      // Analyze monthly patterns
      const monthlyPatterns = this.analyzeMonthlyPatterns(expenseData);

      // Analyze quarterly patterns
      const quarterlyPatterns = this.analyzeQuarterlyPatterns(expenseData);

      // Save patterns to database
      const savedMonthly = await this.savePattern(
        userId,
        tenantId,
        'monthly',
        monthlyPatterns,
        category,
        expenseData.length
      );

      const savedQuarterly = await this.savePattern(
        userId,
        tenantId,
        'quarterly',
        quarterlyPatterns,
        category,
        expenseData.length
      );

      return {
        patternsDetected: true,
        monthly: savedMonthly[0],
        quarterly: savedQuarterly[0],
        insights: this.generatePatternInsights(monthlyPatterns, quarterlyPatterns),
      };
    } catch (error) {
      console.error('Error detecting seasonal patterns:', error);
      throw error;
    }
  }

  /**
   * Analyze monthly spending patterns
   */
  analyzeMonthlyPatterns(expenseData) {
    const monthlyData = {};

    // Group by month
    expenseData.forEach((exp) => {
      const date = new Date(exp.date);
      const month = date.getMonth(); // 0-11
      const monthName = [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ][month];

      if (!monthlyData[monthName]) {
        monthlyData[monthName] = [];
      }
      monthlyData[monthName].push(parseFloat(exp.amount));
    });

    // Calculate averages and factors
    const baseline = this.calculateBaseline(monthlyData);
    const seasonalFactors = {};
    let peakMonth = null;
    let peakValue = 0;

    const monthOrder = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ];

    monthOrder.forEach((month) => {
      const monthValues = monthlyData[month] || [];
      if (monthValues.length > 0) {
        const avg = monthValues.reduce((a, b) => a + b) / monthValues.length;
        const factor = baseline > 0 ? avg / baseline : 1.0;
        seasonalFactors[month] = Math.round(factor * 100) / 100;

        if (avg > peakValue) {
          peakValue = avg;
          peakMonth = month;
        }
      }
    });

    const stdDev = this.calculateStandardDeviation(
      Object.values(monthlyData).flat()
    );

    return {
      baseLine: Math.round(baseline * 100) / 100,
      seasonalFactors,
      peakMonth,
      peakValue: Math.round(peakValue * 100) / 100,
      deviation: Math.round(stdDev * 100) / 100,
      confidence: Math.min(90, 50 + Math.max(0, (expenseData.length - 24) * 5)),
    };
  }

  /**
   * Analyze quarterly spending patterns
   */
  analyzeQuarterlyPatterns(expenseData) {
    const quarterlyData = {};

    // Group by quarter
    expenseData.forEach((exp) => {
      const date = new Date(exp.date);
      const quarter = Math.floor(date.getMonth() / 3); // 0-3
      const quarterName = `q${quarter + 1}`;

      if (!quarterlyData[quarterName]) {
        quarterlyData[quarterName] = [];
      }
      quarterlyData[quarterName].push(parseFloat(exp.amount));
    });

    // Calculate averages and factors
    const baseline = this.calculateBaseline(quarterlyData);
    const seasonalFactors = {};

    ['q1', 'q2', 'q3', 'q4'].forEach((quarter) => {
      const quarterValues = quarterlyData[quarter] || [];
      if (quarterValues.length > 0) {
        const avg = quarterValues.reduce((a, b) => a + b) / quarterValues.length;
        const factor = baseline > 0 ? avg / baseline : 1.0;
        seasonalFactors[quarter] = Math.round(factor * 100) / 100;
      }
    });

    return {
      baseLine: Math.round(baseline * 100) / 100,
      seasonalFactors,
      deviation: this.calculateStandardDeviation(
        Object.values(quarterlyData).flat()
      ),
      confidence: Math.min(95, 60 + Math.max(0, (expenseData.length - 24) * 3)),
    };
  }

  /**
   * Calculate baseline spending
   */
  calculateBaseline(groupedData) {
    const allValues = Object.values(groupedData).flat();
    if (allValues.length === 0) return 0;
    return allValues.reduce((a, b) => a + b) / allValues.length;
  }

  /**
   * Calculate standard deviation
   */
  calculateStandardDeviation(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2)) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Save pattern to database
   */
  async savePattern(userId, tenantId, seasonalityType, patternData, category, dataPoints) {
    const existingPattern = await db
      .select()
      .from(seasonalPatterns)
      .where(
        and(
          eq(seasonalPatterns.userId, userId),
          eq(seasonalPatterns.tenantId, tenantId),
          eq(seasonalPatterns.seasonalityType, seasonalityType),
          category ? eq(seasonalPatterns.category, category) : true
        )
      );

    if (existingPattern.length > 0) {
      // Update existing
      return await db
        .update(seasonalPatterns)
        .set({
          baseLine: patternData.baseLine,
          seasonalFactors: patternData.seasonalFactors,
          confidence: patternData.confidence,
          dataPoints,
          deviationStdDev: patternData.deviation,
          lastUpdatedAt: new Date(),
          isPeakSeason:
            patternData.peakMonth && patternData.peakValue > patternData.baseLine,
          peakMultiplier: patternData.seasonalFactors[patternData.peakMonth],
        })
        .where(eq(seasonalPatterns.id, existingPattern[0].id))
        .returning();
    } else {
      // Create new
      return await db
        .insert(seasonalPatterns)
        .values({
          userId,
          tenantId,
          seasonalityType,
          category,
          baseLine: patternData.baseLine,
          seasonalFactors: patternData.seasonalFactors,
          confidence: patternData.confidence,
          dataPoints,
          deviationStdDev: patternData.deviation,
          isPeakSeason:
            patternData.peakMonth && patternData.peakValue > patternData.baseLine,
          peakMultiplier: patternData.seasonalFactors[patternData.peakMonth],
        })
        .returning();
    }
  }

  /**
   * Generate insights from patterns
   */
  generatePatternInsights(monthlyPatterns, quarterlyPatterns) {
    const insights = [];

    // Identify peak months
    const peakMonth = monthlyPatterns.peakMonth;
    if (peakMonth && monthlyPatterns.peakValue > monthlyPatterns.baseLine * 1.2) {
      insights.push({
        type: 'peak_month',
        description: `${peakMonth.toUpperCase()} is your peak spending month (${Math.round(
          (monthlyPatterns.seasonalFactors[peakMonth] - 1) * 100
        )}% above average)`,
        actionable: `Prepare extra budget or savings for ${peakMonth}`,
      });
    }

    // Identify low months
    const monthFactors = Object.entries(monthlyPatterns.seasonalFactors);
    const lowestMonth = monthFactors.reduce((a, b) =>
      a[1] < b[1] ? a : b
    )[0];
    if (monthlyPatterns.seasonalFactors[lowestMonth] < 0.85) {
      insights.push({
        type: 'low_month',
        description: `${lowestMonth.toUpperCase()} tends to have lower spending (${Math.round(
          (1 - monthlyPatterns.seasonalFactors[lowestMonth]) * 100
        )}% below average)`,
        actionable: 'Good month to build up savings',
      });
    }

    // Check volatility
    if (monthlyPatterns.deviation > monthlyPatterns.baseLine * 0.5) {
      insights.push({
        type: 'high_volatility',
        description: 'High spending volatility detected across months',
        actionable: 'Use flexible budgeting approach',
      });
    }

    return insights;
  }

  /**
   * Get seasonal adjustment factor for a date
   */
  async getSeasonalAdjustment(userId, tenantId, date, category = null) {
    const patterns = await db
      .select()
      .from(seasonalPatterns)
      .where(
        and(
          eq(seasonalPatterns.userId, userId),
          eq(seasonalPatterns.tenantId, tenantId),
          eq(seasonalPatterns.seasonalityType, 'monthly'),
          category ? eq(seasonalPatterns.category, category) : true
        )
      );

    if (patterns.length === 0) {
      return 1.0; // No adjustment if no pattern found
    }

    const pattern = patterns[0];
    const month = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ][date.getMonth()];

    return pattern.seasonalFactors[month] || 1.0;
  }

  /**
   * Predict next month's spending
   */
  async predictNextMonthSpending(userId, tenantId, category = null) {
    const patterns = await db
      .select()
      .from(seasonalPatterns)
      .where(
        and(
          eq(seasonalPatterns.userId, userId),
          eq(seasonalPatterns.tenantId, tenantId),
          eq(seasonalPatterns.seasonalityType, 'monthly')
        )
      );

    if (patterns.length === 0) {
      return null;
    }

    const pattern = patterns[0];
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const monthName = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ][nextMonth.getMonth()];

    const seasonalFactor = pattern.seasonalFactors[monthName] || 1.0;
    const predictedSpending = pattern.baseLine * seasonalFactor;

    return {
      month: monthName,
      predictedSpending: Math.round(predictedSpending * 100) / 100,
      baseLine: Math.round(pattern.baseLine * 100) / 100,
      seasonalFactor,
      confidence: pattern.confidence,
    };
  }
}

export const seasonalPatternDetectionService = new SeasonalPatternDetectionService();
