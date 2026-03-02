import db from '../config/db.js';
import { expenses, categories, users } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql, asc } from 'drizzle-orm';

/**
 * Smart Spending Analysis Service
 * AI-powered spending pattern detection and behavioral insights
 */
class SmartSpendingAnalysisService {
  constructor() {
    this.MIN_DATA_POINTS = 10;
    this.ANALYSIS_PERIODS = {
      SHORT: 30,    // 30 days
      MEDIUM: 90,   // 90 days
      LONG: 365     // 365 days
    };
  }

  /**
   * Main analysis function - detects spending patterns and provides insights
   */
  async analyzeSpendingPatterns(userId, timeRange = '90days') {
    try {
      const days = this.parseTimeRange(timeRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get expenses for analysis
      const userExpenses = await this.getExpensesForAnalysis(userId, startDate);

      if (userExpenses.length < this.MIN_DATA_POINTS) {
        return {
          status: 'insufficient_data',
          message: `Need at least ${this.MIN_DATA_POINTS} transactions for analysis`,
          insights: [],
          recommendations: []
        };
      }

      // Perform comprehensive analysis
      const [
        patternAnalysis,
        behavioralInsights,
        riskAssessment,
        trendAnalysis,
        categoryAnalysis
      ] = await Promise.all([
        this.detectSpendingPatterns(userExpenses),
        this.analyzeBehavioralPatterns(userExpenses),
        this.assessSpendingRisk(userExpenses),
        this.analyzeTrends(userExpenses),
        this.analyzeCategoryPatterns(userExpenses)
      ]);

      // Generate personalized recommendations
      const recommendations = await this.generateRecommendations(
        patternAnalysis,
        behavioralInsights,
        riskAssessment,
        trendAnalysis
      );

      return {
        status: 'success',
        analysisPeriod: { startDate, days },
        totalTransactions: userExpenses.length,
        totalAmount: userExpenses.reduce((sum, exp) => sum + exp.amount, 0),
        patternAnalysis,
        behavioralInsights,
        riskAssessment,
        trendAnalysis,
        categoryAnalysis,
        recommendations,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('Smart Spending Analysis Error:', error);
      throw new Error(`Analysis failed: ${error.message}`);
    }
  }

  /**
   * Detect spending patterns (Safe/Impulsive/Anxious)
   */
  async detectSpendingPatterns(expenses) {
    const patterns = {
      safe: { score: 0, indicators: [], transactions: [] },
      impulsive: { score: 0, indicators: [], transactions: [] },
      anxious: { score: 0, indicators: [], transactions: [] }
    };

    // Analyze each expense for pattern indicators
    for (const expense of expenses) {
      const patternResult = await this.classifyTransactionPattern(expense, expenses);
      patterns[patternResult.pattern].score += patternResult.confidence;
      patterns[patternResult.pattern].indicators.push(patternResult.indicator);
      patterns[patternResult.pattern].transactions.push(expense.id);
    }

    // Normalize scores
    const totalScore = patterns.safe.score + patterns.impulsive.score + patterns.anxious.score;
    if (totalScore > 0) {
      patterns.safe.score = (patterns.safe.score / totalScore) * 100;
      patterns.impulsive.score = (patterns.impulsive.score / totalScore) * 100;
      patterns.anxious.score = (patterns.anxious.score / totalScore) * 100;
    }

    // Determine dominant pattern
    const dominantPattern = Object.entries(patterns)
      .reduce((max, [key, value]) => value.score > max.score ? { pattern: key, score: value.score } : max,
        { pattern: 'safe', score: 0 });

    return {
      patterns,
      dominantPattern: dominantPattern.pattern,
      dominantScore: dominantPattern.score,
      patternDistribution: {
        safe: patterns.safe.score,
        impulsive: patterns.impulsive.score,
        anxious: patterns.anxious.score
      }
    };
  }

  /**
   * Classify individual transaction pattern
   */
  async classifyTransactionPattern(expense, allExpenses) {
    let safeScore = 0;
    let impulsiveScore = 0;
    let anxiousScore = 0;
    let indicator = '';

    const amount = expense.amount;
    const category = expense.category.toLowerCase();
    const description = expense.description.toLowerCase();
    const hour = new Date(expense.date).getHours();

    // Time-based patterns
    if (hour >= 22 || hour <= 4) {
      impulsiveScore += 30; // Late night purchases often impulsive
      indicator = 'Late night purchase';
    } else if (hour >= 6 && hour <= 9) {
      safeScore += 20; // Morning purchases often planned
      indicator = 'Morning planned purchase';
    }

    // Amount-based patterns
    const avgAmount = allExpenses.reduce((sum, exp) => sum + exp.amount, 0) / allExpenses.length;
    if (amount > avgAmount * 3) {
      impulsiveScore += 40; // Large amounts often impulsive
      indicator = 'Unusually large amount';
    } else if (amount < avgAmount * 0.5) {
      safeScore += 15; // Small amounts often safe
      indicator = 'Small planned purchase';
    }

    // Category-based patterns
    const impulseCategories = ['entertainment', 'shopping', 'food', 'beverages'];
    const safeCategories = ['utilities', 'insurance', 'education', 'healthcare'];

    if (impulseCategories.some(cat => category.includes(cat))) {
      impulsiveScore += 25;
      indicator = `Impulse category: ${category}`;
    } else if (safeCategories.some(cat => category.includes(cat))) {
      safeScore += 25;
      indicator = `Safe category: ${category}`;
    }

    // Description-based patterns
    const impulseKeywords = ['sale', 'discount', 'deal', 'bargain', 'limited time'];
    const anxiousKeywords = ['emergency', 'urgent', 'immediate', 'crisis'];

    if (impulseKeywords.some(keyword => description.includes(keyword))) {
      impulsiveScore += 20;
      indicator = 'Triggered by sale/discount';
    } else if (anxiousKeywords.some(keyword => description.includes(keyword))) {
      anxiousScore += 35;
      indicator = 'Emergency/anxious purchase';
    }

    // Determine dominant pattern
    const scores = { safe: safeScore, impulsive: impulsiveScore, anxious: anxiousScore };
    const maxScore = Math.max(...Object.values(scores));
    const pattern = Object.keys(scores).find(key => scores[key] === maxScore) || 'safe';

    return {
      pattern,
      confidence: maxScore,
      indicator: indicator || 'Regular purchase'
    };
  }

  /**
   * Analyze behavioral patterns
   */
  async analyzeBehavioralPatterns(expenses) {
    const insights = [];

    // Weekly spending patterns
    const weeklyPatterns = this.analyzeWeeklyPatterns(expenses);
    if (weeklyPatterns.spikeDay) {
      insights.push({
        type: 'weekly_pattern',
        title: 'Weekly Spending Spike',
        description: `You spend ${weeklyPatterns.spikePercentage}% more on ${weeklyPatterns.spikeDay}s`,
        severity: weeklyPatterns.spikePercentage > 50 ? 'high' : 'medium',
        data: weeklyPatterns
      });
    }

    // Weekend vs Weekday analysis
    const weekendAnalysis = this.analyzeWeekendSpending(expenses);
    if (weekendAnalysis.weekendPercentage > 60) {
      insights.push({
        type: 'weekend_spending',
        title: 'High Weekend Spending',
        description: `${weekendAnalysis.weekendPercentage}% of spending occurs on weekends`,
        severity: 'medium',
        data: weekendAnalysis
      });
    }

    // Recurring vs One-time analysis
    const recurringAnalysis = this.analyzeRecurringPatterns(expenses);
    if (recurringAnalysis.recurringPercentage < 30) {
      insights.push({
        type: 'irregular_spending',
        title: 'Irregular Spending Pattern',
        description: 'Only ${recurringAnalysis.recurringPercentage}% of expenses are recurring',
        severity: 'low',
        data: recurringAnalysis
      });
    }

    return insights;
  }

  /**
   * Assess spending risk
   */
  async assessSpendingRisk(expenses) {
    const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const avgDaily = totalAmount / (this.ANALYSIS_PERIODS.MEDIUM / 30); // Approximate monthly

    let riskLevel = 'low';
    let riskFactors = [];

    // High frequency spending
    const dailyTransactions = expenses.length / (this.ANALYSIS_PERIODS.MEDIUM / 30);
    if (dailyTransactions > 5) {
      riskLevel = 'high';
      riskFactors.push('High transaction frequency');
    }

    // Large individual transactions
    const largeTransactions = expenses.filter(exp => exp.amount > avgDaily * 0.5);
    if (largeTransactions.length > expenses.length * 0.1) {
      riskLevel = riskLevel === 'high' ? 'high' : 'medium';
      riskFactors.push('Frequent large transactions');
    }

    // Category concentration risk
    const categoryTotals = {};
    expenses.forEach(exp => {
      categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
    });

    const maxCategoryPercentage = Math.max(...Object.values(categoryTotals)) / totalAmount * 100;
    if (maxCategoryPercentage > 50) {
      riskFactors.push('High category concentration');
    }

    return {
      riskLevel,
      riskFactors,
      riskScore: this.calculateRiskScore(riskLevel, riskFactors.length),
      recommendations: this.generateRiskRecommendations(riskLevel, riskFactors)
    };
  }

  /**
   * Analyze spending trends
   */
  async analyzeTrends(expenses) {
    const sortedExpenses = expenses.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Monthly trends
    const monthlyData = this.groupByMonth(sortedExpenses);
    const trend = this.calculateTrend(monthlyData);

    // Seasonal patterns
    const seasonalPatterns = this.detectSeasonalPatterns(sortedExpenses);

    return {
      overallTrend: trend,
      monthlyData,
      seasonalPatterns,
      volatility: this.calculateVolatility(monthlyData),
      predictions: await this.generatePredictions(monthlyData)
    };
  }

  /**
   * Analyze category patterns
   */
  async analyzeCategoryPatterns(expenses) {
    const categoryStats = {};

    expenses.forEach(expense => {
      const category = expense.category;
      if (!categoryStats[category]) {
        categoryStats[category] = {
          total: 0,
          count: 0,
          avgAmount: 0,
          transactions: []
        };
      }

      categoryStats[category].total += expense.amount;
      categoryStats[category].count += 1;
      categoryStats[category].transactions.push(expense);
    });

    // Calculate averages and patterns
    Object.keys(categoryStats).forEach(category => {
      const stats = categoryStats[category];
      stats.avgAmount = stats.total / stats.count;

      // Detect patterns within category
      stats.patterns = this.analyzeCategorySpecificPatterns(stats.transactions);
    });

    return {
      categories: categoryStats,
      topCategory: Object.keys(categoryStats)
        .reduce((max, cat) => categoryStats[cat].total > categoryStats[max].total ? cat : max),
      categoryDiversity: Object.keys(categoryStats).length,
      spendingConcentration: this.calculateSpendingConcentration(categoryStats)
    };
  }

  /**
   * Generate personalized recommendations
   */
  async generateRecommendations(patternAnalysis, behavioralInsights, riskAssessment, trendAnalysis) {
    const recommendations = [];

    // Pattern-based recommendations
    if (patternAnalysis.dominantPattern === 'impulsive') {
      recommendations.push({
        type: 'behavioral',
        priority: 'high',
        title: 'Reduce Impulsive Spending',
        description: 'Consider implementing a 24-hour waiting period for non-essential purchases',
        actions: [
          'Set up spending alerts for impulse categories',
          'Create a wishlist for delayed purchases',
          'Track emotional triggers for spending'
        ]
      });
    }

    if (patternAnalysis.dominantPattern === 'anxious') {
      recommendations.push({
        type: 'planning',
        priority: 'high',
        title: 'Build Emergency Fund',
        description: 'Emergency purchases indicate insufficient safety net',
        actions: [
          'Increase emergency fund contributions',
          'Create a separate emergency budget',
          'Plan for unexpected expenses monthly'
        ]
      });
    }

    // Risk-based recommendations
    if (riskAssessment.riskLevel === 'high') {
      recommendations.push({
        type: 'budgeting',
        priority: 'high',
        title: 'Implement Spending Controls',
        description: 'High-risk spending patterns detected',
        actions: [
          'Set category spending limits',
          'Enable transaction approvals for large purchases',
          'Review subscriptions and recurring expenses'
        ]
      });
    }

    // Trend-based recommendations
    if (trendAnalysis.overallTrend.direction === 'increasing') {
      recommendations.push({
        type: 'optimization',
        priority: 'medium',
        title: 'Review Spending Trends',
        description: `Spending has increased by ${trendAnalysis.overallTrend.percentage}%`,
        actions: [
          'Analyze what drove the spending increase',
          'Set spending reduction goals',
          'Compare spending with income growth'
        ]
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  // Helper methods
  parseTimeRange(timeRange) {
    const ranges = {
      '30days': 30,
      '90days': 90,
      '6months': 180,
      '1year': 365
    };
    return ranges[timeRange] || 90;
  }

  async getExpensesForAnalysis(userId, startDate) {
    return await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, startDate),
          eq(expenses.status, 'completed')
        )
      )
      .orderBy(desc(expenses.date));
  }

  analyzeWeeklyPatterns(expenses) {
    const dayTotals = { 'Sunday': 0, 'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0 };
    const dayCounts = { ...dayTotals };

    expenses.forEach(expense => {
      const day = new Date(expense.date).toLocaleDateString('en-US', { weekday: 'long' });
      dayTotals[day] += expense.amount;
      dayCounts[day] += 1;
    });

    const avgDaily = Object.values(dayTotals).reduce((sum, amount) => sum + amount, 0) / 7;
    const maxDay = Object.keys(dayTotals).reduce((max, day) =>
      dayTotals[day] > dayTotals[max] ? day : max
    );

    return {
      dayTotals,
      dayCounts,
      spikeDay: maxDay,
      spikeAmount: dayTotals[maxDay],
      spikePercentage: avgDaily > 0 ? ((dayTotals[maxDay] / avgDaily - 1) * 100) : 0
    };
  }

  analyzeWeekendSpending(expenses) {
    let weekendTotal = 0;
    let weekdayTotal = 0;

    expenses.forEach(expense => {
      const day = new Date(expense.date).getDay();
      if (day === 0 || day === 6) { // Sunday = 0, Saturday = 6
        weekendTotal += expense.amount;
      } else {
        weekdayTotal += expense.amount;
      }
    });

    const total = weekendTotal + weekdayTotal;
    return {
      weekendTotal,
      weekdayTotal,
      weekendPercentage: total > 0 ? (weekendTotal / total * 100) : 0,
      weekdayPercentage: total > 0 ? (weekdayTotal / total * 100) : 0
    };
  }

  analyzeRecurringPatterns(expenses) {
    const recurringCount = expenses.filter(exp => exp.isRecurring).length;
    const totalCount = expenses.length;

    return {
      recurringCount,
      oneTimeCount: totalCount - recurringCount,
      recurringPercentage: totalCount > 0 ? (recurringCount / totalCount * 100) : 0
    };
  }

  calculateRiskScore(riskLevel, factorCount) {
    const baseScores = { low: 20, medium: 50, high: 80 };
    return Math.min(100, baseScores[riskLevel] + (factorCount * 10));
  }

  generateRiskRecommendations(riskLevel, riskFactors) {
    const recommendations = [];

    if (riskFactors.includes('High transaction frequency')) {
      recommendations.push('Consider consolidating purchases to reduce transaction fees');
    }

    if (riskFactors.includes('Frequent large transactions')) {
      recommendations.push('Set up approval workflows for large purchases');
    }

    return recommendations;
  }

  groupByMonth(expenses) {
    const monthlyData = {};

    expenses.forEach(expense => {
      const monthKey = new Date(expense.date).toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { total: 0, count: 0, transactions: [] };
      }
      monthlyData[monthKey].total += expense.amount;
      monthlyData[monthKey].count += 1;
      monthlyData[monthKey].transactions.push(expense);
    });

    return monthlyData;
  }

  calculateTrend(monthlyData) {
    const months = Object.keys(monthlyData).sort();
    if (months.length < 2) return { direction: 'stable', percentage: 0 };

    const firstMonth = monthlyData[months[0]].total;
    const lastMonth = monthlyData[months[months.length - 1]].total;

    const percentage = firstMonth > 0 ? ((lastMonth - firstMonth) / firstMonth * 100) : 0;
    const direction = percentage > 5 ? 'increasing' : percentage < -5 ? 'decreasing' : 'stable';

    return { direction, percentage: Math.abs(percentage) };
  }

  detectSeasonalPatterns(expenses) {
    // Simple seasonal analysis - can be enhanced with ML
    const monthlyTotals = {};

    expenses.forEach(expense => {
      const month = new Date(expense.date).getMonth();
      monthlyTotals[month] = (monthlyTotals[month] || 0) + expense.amount;
    });

    const avgMonthly = Object.values(monthlyTotals).reduce((sum, amount) => sum + amount, 0) / 12;
    const seasonalMonths = Object.keys(monthlyTotals)
      .filter(month => monthlyTotals[month] > avgMonthly * 1.2)
      .map(month => new Date(2024, parseInt(month)).toLocaleDateString('en-US', { month: 'long' }));

    return {
      seasonalMonths,
      avgMonthly,
      monthlyTotals
    };
  }

  calculateVolatility(monthlyData) {
    const amounts = Object.values(monthlyData).map(data => data.total);
    if (amounts.length < 2) return 0;

    const mean = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - mean, 2), 0) / amounts.length;

    return Math.sqrt(variance) / mean * 100; // Coefficient of variation
  }

  async generatePredictions(monthlyData) {
    // Simple linear regression for prediction
    const months = Object.keys(monthlyData).sort();
    const amounts = months.map(month => monthlyData[month].total);

    if (amounts.length < 3) return { nextMonth: 0, confidence: 0 };

    const n = amounts.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = amounts.reduce((sum, amount) => sum + amount, 0);
    const sumXY = amounts.reduce((sum, amount, index) => sum + (amount * index), 0);
    const sumXX = amounts.reduce((sum, amount, index) => sum + (index * index), 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const nextMonth = intercept + slope * n;

    return {
      nextMonth: Math.max(0, nextMonth),
      confidence: Math.min(100, 80 - (amounts.length * 5)) // Confidence decreases with less data
    };
  }

  analyzeCategorySpecificPatterns(transactions) {
    const patterns = [];

    // Frequency analysis
    const sortedTransactions = transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const intervals = [];

    for (let i = 1; i < sortedTransactions.length; i++) {
      const diff = new Date(sortedTransactions[i].date).getTime() - new Date(sortedTransactions[i-1].date).getTime();
      intervals.push(diff / (1000 * 60 * 60 * 24)); // Convert to days
    }

    if (intervals.length > 0) {
      const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;

      if (avgInterval < 7) {
        patterns.push('Frequent purchases');
      } else if (avgInterval > 30) {
        patterns.push('Infrequent purchases');
      } else {
        patterns.push('Regular purchases');
      }
    }

    return patterns;
  }

  calculateSpendingConcentration(categoryStats) {
    const totalSpending = Object.values(categoryStats).reduce((sum, stats) => sum + stats.total, 0);
    const maxCategorySpending = Math.max(...Object.values(categoryStats).map(stats => stats.total));

    return totalSpending > 0 ? (maxCategorySpending / totalSpending * 100) : 0;
  }
}

export default new SmartSpendingAnalysisService();