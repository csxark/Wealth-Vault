import { eq, and, gte, lte, sql, desc, asc, not, isNull } from 'drizzle-orm';
import db from '../config/db.js';
import { subscriptions, expenses, categories } from '../db/schema.js';

/**
 * Subscription Analyzer Service
 * Provides advanced analytics and pattern analysis for subscriptions
 */
class SubscriptionAnalyzerService {
  /**
   * Analyze spending patterns over time
   */
  async analyzeSpendingPatterns(userId, months = 6) {
    try {
      const now = new Date();
      const patternData = [];

      for (let i = months - 1; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

        const monthSubscriptions = await db.query.subscriptions.findMany({
          where: and(
            eq(subscriptions.userId, userId),
            eq(subscriptions.status, 'active'),
            sql`${subscriptions.createdAt} <= ${monthEnd}`
          )
        });

        // Calculate what was spent in that month (based on when subscriptions were active)
        let totalSpent = 0;
        let newSubscriptions = 0;
        let cancelledSubscriptions = 0;

        for (const sub of monthSubscriptions) {
          const createdDate = new Date(sub.createdAt);
          const isNewInMonth = createdDate >= monthStart && createdDate <= monthEnd;
          
          if (isNewInMonth) {
            newSubscriptions++;
          }

          // Calculate monthly cost
          const monthlyCost = this.calculateMonthlyAmount(sub.cost, sub.frequency);
          
          // Check if subscription was active in this month
          const wasActive = createdDate <= monthEnd && 
            (sub.cancellationDate === null || new Date(sub.cancellationDate) >= monthStart);

          if (wasActive) {
            totalSpent += monthlyCost;
          }
        }

        // Get cancelled subscriptions in this month
        const allSubscriptions = await db.query.subscriptions.findMany({
          where: and(
            eq(subscriptions.userId, userId),
            eq(subscriptions.status, 'cancelled'),
            sql`${subscriptions.cancellationDate} >= ${monthStart}`,
            sql`${subscriptions.cancellationDate} <= ${monthEnd}`
          )
        });
        cancelledSubscriptions = allSubscriptions.length;

        patternData.push({
          month: monthStart.toISOString().slice(0, 7),
          monthName: monthStart.toLocaleString('default', { month: 'long', year: 'numeric' }),
          totalSpent: Math.round(totalSpent * 100) / 100,
          activeCount: monthSubscriptions.filter(s => s.status === 'active').length,
          newCount: newSubscriptions,
          cancelledCount: cancelledSubscriptions,
          netChange: newSubscriptions - cancelledSubscriptions
        });
      }

      // Calculate trends
      const totalSpent = patternData.reduce((sum, p) => sum + p.totalSpent, 0);
      const averageMonthly = totalSpent / months;
      const latestMonth = patternData[patternData.length - 1];
      const firstMonth = patternData[0];

      // Calculate month-over-month changes
      const monthOverMonth = [];
      for (let i = 1; i < patternData.length; i++) {
        const prev = patternData[i - 1];
        const curr = patternData[i];
        const change = curr.totalSpent - prev.totalSpent;
        const percentChange = prev.totalSpent > 0 ? (change / prev.totalSpent) * 100 : 0;

        monthOverMonth.push({
          from: prev.month,
          to: curr.month,
          change: Math.round(change * 100) / 100,
          percentChange: Math.round(percentChange * 10) / 10
        });
      }

      // Determine overall trend
      let trend = 'stable';
      if (latestMonth.totalSpent > firstMonth.totalSpent * 1.1) {
        trend = 'increasing';
      } else if (latestMonth.totalSpent < firstMonth.totalSpent * 0.9) {
        trend = 'decreasing';
      }

      return {
        pattern: patternData,
        summary: {
          totalSpent: Math.round(totalSpent * 100) / 100,
          averageMonthly: Math.round(averageMonthly * 100) / 100,
          highestMonth: patternData.reduce((max, p) => p.totalSpent > max.totalSpent ? p : max, patternData[0]),
          lowestMonth: patternData.reduce((min, p) => p.totalSpent < min.totalSpent ? p : min, patternData[0]),
          trend,
          totalNew: patternData.reduce((sum, p) => sum + p.newCount, 0),
          totalCancelled: patternData.reduce((sum, p) => sum + p.cancelledCount, 0)
        },
        monthOverMonth
      };
    } catch (error) {
      console.error('Error analyzing spending patterns:', error);
      throw error;
    }
  }

  /**
   * Analyze category distribution
   */
  async analyzeCategoryDistribution(userId) {
    try {
      const activeSubscriptions = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        ),
        with: {
          category: true
        }
      });

      const categoryData = {};
      let totalMonthly = 0;
      let totalAnnual = 0;

      for (const sub of activeSubscriptions) {
        const categoryName = sub.category?.name || 'Uncategorized';
        const categoryColor = sub.category?.color || '#6B7280';
        const categoryIcon = sub.category?.icon || 'tag';

        if (!categoryData[categoryName]) {
          categoryData[categoryName] = {
            name: categoryName,
            color: categoryColor,
            icon: categoryIcon,
            count: 0,
            monthly: 0,
            annual: 0,
            subscriptions: []
          };
        }

        const monthlyAmount = this.calculateMonthlyAmount(sub.cost, sub.frequency);
        const annualAmount = this.calculateAnnualAmount(sub.cost, sub.frequency);

        categoryData[categoryName].count++;
        categoryData[categoryName].monthly += monthlyAmount;
        categoryData[categoryName].annual += annualAmount;
        categoryData[categoryName].subscriptions.push({
          id: sub.id,
          name: sub.serviceName,
          cost: sub.cost,
          frequency: sub.frequency,
          monthlyAmount
        });

        totalMonthly += monthlyAmount;
        totalAnnual += annualAmount;
      }

      // Convert to array and calculate percentages
      const categories = Object.values(categoryData).map(cat => ({
        ...cat,
        monthly: Math.round(cat.monthly * 100) / 100,
        annual: Math.round(cat.annual * 100) / 100,
        percentage: totalMonthly > 0 ? Math.round((cat.monthly / totalMonthly) * 1000) / 10 : 0
      }));

      // Sort by monthly amount
      categories.sort((a, b) => b.monthly - a.monthly);

      return {
        categories,
        summary: {
          totalMonthly: Math.round(totalMonthly * 100) / 100,
          totalAnnual: Math.round(totalAnnual * 100) / 100,
          totalSubscriptions: activeSubscriptions.length,
          categoryCount: categories.length,
          largestCategory: categories[0] || null
        }
      };
    } catch (error) {
      console.error('Error analyzing category distribution:', error);
      throw error;
    }
  }

  /**
   * Analyze payment methods
   */
  async analyzePaymentMethods(userId) {
    try {
      const activeSubscriptions = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        )
      });

      const paymentMethodData = {};
      let totalMonthly = 0;

      for (const sub of activeSubscriptions) {
        const method = sub.paymentMethod || 'other';
        const monthlyAmount = this.calculateMonthlyAmount(sub.cost, sub.frequency);

        if (!paymentMethodData[method]) {
          paymentMethodData[method] = {
            method,
            count: 0,
            monthly: 0,
            subscriptions: []
          };
        }

        paymentMethodData[method].count++;
        paymentMethodData[method].monthly += monthlyAmount;
        paymentMethodData[method].subscriptions.push({
          id: sub.id,
          name: sub.serviceName,
          cost: sub.cost,
          monthlyAmount
        });

        totalMonthly += monthlyAmount;
      }

      const methods = Object.values(paymentMethodData).map(m => ({
        ...m,
        monthly: Math.round(m.monthly * 100) / 100,
        percentage: totalMonthly > 0 ? Math.round((m.monthly / totalMonthly) * 1000) / 10 : 0
      }));

      methods.sort((a, b) => b.monthly - a.monthly);

      return {
        paymentMethods: methods,
        summary: {
          totalMonthly: Math.round(totalMonthly * 100) / 100,
          methodCount: methods.length,
          mostUsed: methods[0]?.method || 'none'
        }
      };
    } catch (error) {
      console.error('Error analyzing payment methods:', error);
      throw error;
    }
  }

  /**
   * Detect unusual spending patterns
   */
  async detectUnusualPatterns(userId) {
    try {
      const activeSubscriptions = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        )
      });

      const anomalies = [];
      const now = new Date();

      // Calculate basic statistics
      const amounts = activeSubscriptions.map(s => this.calculateMonthlyAmount(s.cost, s.frequency));
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const stdDev = Math.sqrt(amounts.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / amounts.length);

      // Detect 1: Unusually expensive subscriptions (beyond 2 standard deviations)
      for (const sub of activeSubscriptions) {
        const monthlyAmount = this.calculateMonthlyAmount(sub.cost, sub.frequency);
        const zScore = (monthlyAmount - mean) / (stdDev || 1);

        if (zScore > 2) {
          anomalies.push({
            type: 'expensive',
            severity: 'high',
            subscriptionId: sub.id,
            serviceName: sub.serviceName,
            amount: monthlyAmount,
            description: `${sub.serviceName} costs $${monthlyAmount.toFixed(2)}/month, which is unusually high`,
            recommendation: 'Review if this subscription is essential or consider alternatives'
          });
        }
      }

      // Detect 2: Subscriptions with price increases (compare to historical if available)
      // For now, check if there are any very old subscriptions that might have increased
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      const oldSubscriptions = activeSubscriptions.filter(s => new Date(s.createdAt) < oneYearAgo);

      for (const sub of oldSubscriptions) {
        // Check metadata for cost trend
        const costTrend = sub.metadata?.costTrend || [];
        if (costTrend.length > 1) {
          const recentCost = parseFloat(costTrend[costTrend.length - 1]?.cost || sub.cost);
          const oldCost = parseFloat(costTrend[0]?.cost || sub.cost);
          
          if (recentCost > oldCost * 1.2) {
            anomalies.push({
              type: 'price_increase',
              severity: 'medium',
              subscriptionId: sub.id,
              serviceName: sub.serviceName,
              oldCost: oldCost,
              newCost: recentCost,
              increasePercent: Math.round(((recentCost - oldCost) / oldCost) * 100),
              description: `${sub.serviceName} has increased by ${Math.round(((recentCost - oldCost) / oldCost) * 100)}%`,
              recommendation: 'Consider contacting customer service for retention offers'
            });
          }
        }
      }

      // Detect 3: Duplicate services (same or similar names)
      const serviceLower = activeSubscriptions.map(s => s.serviceName.toLowerCase());
      const seen = new Set();
      
      for (const sub of activeSubscriptions) {
        const name = sub.serviceName.toLowerCase();
        
        // Check for exact duplicates
        if (seen.has(name)) {
          anomalies.push({
            type: 'duplicate',
            severity: 'high',
            subscriptionId: sub.id,
            serviceName: sub.serviceName,
            description: `You have duplicate subscriptions for ${sub.serviceName}`,
            recommendation: 'Cancel duplicate subscription'
          });
        }

        // Check for similar services
        for (const otherName of seen) {
          const similarity = this.calculateSimilarity(name, otherName);
          if (similarity > 0.7) {
            anomalies.push({
              type: 'similar',
              severity: 'medium',
              subscriptionId: sub.id,
              serviceName: sub.serviceName,
              similarTo: otherName,
              similarity: Math.round(similarity * 100),
              description: `${sub.serviceName} seems similar to ${otherName}`,
              recommendation: 'Consider if you need both services'
            });
          }
        }
        
        seen.add(name);
      }

      // Detect 4: Subscriptions with upcoming renewal that are expensive
      const upcomingRenewals = activeSubscriptions.filter(s => {
        const nextCharge = new Date(s.nextChargeDate || s.renewalDate);
        const daysUntil = (nextCharge - now) / (1000 * 60 * 60 * 24);
        return daysUntil <= 7 && daysUntil > 0;
      });

      for (const sub of upcomingRenewals) {
        const monthlyAmount = this.calculateMonthlyAmount(sub.cost, sub.frequency);
        
        if (monthlyAmount > mean + stdDev) {
          anomalies.push({
            type: 'upcoming_expensive',
            severity: 'medium',
            subscriptionId: sub.id,
            serviceName: sub.serviceName,
            amount: monthlyAmount,
            renewalDate: sub.nextChargeDate || sub.renewalDate,
            daysUntilRenewal: Math.ceil(((sub.nextChargeDate || sub.renewalDate) - now) / (1000 * 60 * 60 * 24)),
            description: `${sub.serviceName} ($${monthlyAmount.toFixed(2)}/month) renews soon`,
            recommendation: 'Review before renewal date'
          });
        }
      }

      // Detect 5: Trial subscriptions about to end
      const endingTrials = activeSubscriptions.filter(s => {
        if (!s.isTrial || !s.trialEndDate) return false;
        const trialEnd = new Date(s.trialEndDate);
        const daysUntil = (trialEnd - now) / (1000 * 60 * 60 * 24);
        return daysUntil <= 7 && daysUntil > 0;
      });

      for (const sub of endingTrials) {
        const trialEnd = new Date(sub.trialEndDate);
        anomalies.push({
          type: 'trial_ending',
          severity: 'high',
          subscriptionId: sub.id,
          serviceName: sub.serviceName,
          trialEndDate: sub.trialEndDate,
          daysUntilEnd: Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)),
          costAfterTrial: sub.cost,
          description: `Trial for ${sub.serviceName} ends soon. Will cost ${sub.cost}/${sub.frequency}`,
          recommendation: 'Cancel now if you don\'t want to continue'
        });
      }

      return {
        anomalies,
        summary: {
          totalAnomalies: anomalies.length,
          bySeverity: {
            high: anomalies.filter(a => a.severity === 'high').length,
            medium: anomalies.filter(a => a.severity === 'medium').length,
            low: anomalies.filter(a => a.severity === 'low').length
          },
          byType: {
            expensive: anomalies.filter(a => a.type === 'expensive').length,
            price_increase: anomalies.filter(a => a.type === 'price_increase').length,
            duplicate: anomalies.filter(a => a.type === 'duplicate').length,
            similar: anomalies.filter(a => a.type === 'similar').length,
            upcoming_expensive: anomalies.filter(a => a.type === 'upcoming_expensive').length,
            trial_ending: anomalies.filter(a => a.type === 'trial_ending').length
          }
        }
      };
    } catch (error) {
      console.error('Error detecting unusual patterns:', error);
      throw error;
    }
  }

  /**
   * Calculate similarity between two strings
   */
  calculateSimilarity(str1, str2) {
    const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    // Simple Levenshtein-like similarity
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate monthly amount from cost and frequency
   */
  calculateMonthlyAmount(cost, frequency) {
    const numericCost = parseFloat(cost);
    switch (frequency) {
      case 'weekly':
        return numericCost * 4.33;
      case 'monthly':
        return numericCost;
      case 'quarterly':
        return numericCost / 3;
      case 'yearly':
        return numericCost / 12;
      default:
        return numericCost;
    }
  }

  /**
   * Calculate annual amount from cost and frequency
   */
  calculateAnnualAmount(cost, frequency) {
    const numericCost = parseFloat(cost);
    switch (frequency) {
      case 'weekly':
        return numericCost * 52;
      case 'monthly':
        return numericCost * 12;
      case 'quarterly':
        return numericCost * 4;
      case 'yearly':
        return numericCost;
      default:
        return numericCost * 12;
    }
  }

  /**
   * Generate comprehensive analysis report
   */
  async generateReport(userId) {
    try {
      const [
        spendingPatterns,
        categoryDistribution,
        paymentMethods,
        unusualPatterns
      ] = await Promise.all([
        this.analyzeSpendingPatterns(userId),
        this.analyzeCategoryDistribution(userId),
        this.analyzePaymentMethods(userId),
        this.detectUnusualPatterns(userId)
      ]);

      // Generate overall health score
      let healthScore = 100;
      const healthFactors = [];

      // Deduct for anomalies
      const highSeverity = unusualPatterns.summary.bySeverity.high;
      const mediumSeverity = unusualPatterns.summary.bySeverity.medium;

      if (highSeverity > 0) {
        healthScore -= highSeverity * 10;
        healthFactors.push({
          factor: 'High severity anomalies detected',
          impact: -highSeverity * 10
        });
      }

      if (mediumSeverity > 0) {
        healthScore -= mediumSeverity * 5;
        healthFactors.push({
          factor: 'Medium severity anomalies detected',
          impact: -mediumSeverity * 5
        });
      }

      // Deduct for too many subscriptions
      const totalSubs = categoryDistribution.summary.totalSubscriptions;
      if (totalSubs > 10) {
        const penalty = Math.min(20, (totalSubs - 10) * 2);
        healthScore -= penalty;
        healthFactors.push({
          factor: 'High number of subscriptions',
          impact: -penalty
        });
      }

      // Deduct for lack of yearly billing
      const yearlyCount = paymentMethods.paymentMethods.reduce((sum, pm) => {
        return sum + (pm.method === 'yearly' ? pm.count : 0);
      }, 0);
      
      if (totalSubs > 3 && yearlyCount === 0) {
        healthScore -= 10;
        healthFactors.push({
          factor: 'No yearly billing options used',
          impact: -10
        });
      }

      healthScore = Math.max(0, Math.round(healthScore));

      let healthRating;
      if (healthScore >= 90) healthRating = 'excellent';
      else if (healthScore >= 75) healthRating = 'good';
      else if (healthScore >= 60) healthRating = 'fair';
      else if (healthScore >= 40) healthRating = 'poor';
      else healthRating = 'critical';

      return {
        generatedAt: new Date().toISOString(),
        healthScore: {
          score: healthScore,
          rating: healthRating,
          factors: healthFactors
        },
        spendingPatterns,
        categoryDistribution,
        paymentMethods,
        unusualPatterns,
        recommendations: this.generateRecommendations(unusualPatterns, categoryDistribution, paymentMethods)
      };
    } catch (error) {
      console.error('Error generating analysis report:', error);
      throw error;
    }
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(unusualPatterns, categoryDistribution, paymentMethods) {
    const recommendations = [];

    // Based on unusual patterns
    const highSeverityAnomalies = unusualPatterns.anomalies.filter(a => a.severity === 'high');
    if (highSeverityAnomalies.length > 0) {
      recommendations.push({
        priority: 'high',
        category: 'action_required',
        title: 'Review High Priority Items',
        description: `You have ${highSeverityAnomalies.length} items that need immediate attention`,
        items: highSeverityAnomalies.map(a => ({
          service: a.serviceName,
          action: a.recommendation
        }))
      });
    }

    // Based on category distribution
    if (categoryDistribution.categories.length > 0) {
      const topCategory = categoryDistribution.categories[0];
      recommendations.push({
        priority: 'medium',
        category: 'optimization',
        title: 'Review Top Spending Category',
        description: `Your highest spending category is ${topCategory.name} at $${topCategory.monthly}/month`,
        items: [{
          category: topCategory.name,
          monthly: topCategory.monthly,
          action: 'Consider if all subscriptions in this category are necessary'
        }]
      });
    }

    // Based on payment methods
    const monthlyMethods = paymentMethods.paymentMethods.filter(
      pm => pm.method === 'credit_card' || pm.method === 'debit_card'
    );
    if (monthlyMethods.length > 3) {
      recommendations.push({
        priority: 'low',
        category: 'savings',
        title: 'Consider Annual Billing',
        description: 'Switching to annual billing can often save 15-20%',
        items: [{
          action: 'Contact subscription providers about annual billing options'
        }]
      });
    }

    // General recommendation
    recommendations.push({
      priority: 'low',
      category: 'monitoring',
      title: 'Regular Review',
      description: 'Review your subscriptions monthly to ensure you\'re getting value',
      items: [{
        action: 'Set a calendar reminder to review subscriptions quarterly'
      }]
    });

    return recommendations;
  }
}

export default new SubscriptionAnalyzerService();
