import { eq, and, gte, lte, sql, desc, asc, or, like, inArray } from 'drizzle-orm';
import db from '../config/db.js';
import { subscriptions, expenses, categories, users } from '../db/schema.js';
import notificationService from './notificationService.js';

/**
 * Subscription Tracker Service
 * Core service for tracking and managing subscriptions with advanced features
 */
class SubscriptionTrackerService {
  /**
   * Calculate monthly cost from any frequency
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
   * Calculate annual cost from any frequency
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
   * Get comprehensive subscription dashboard data
   */
  async getDashboard(userId) {
    try {
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      // Get all active subscriptions
      const activeSubscriptions = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        ),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          }
        }
      });

      // Calculate totals
      let totalMonthly = 0;
      let totalAnnual = 0;
      
      const subscriptionDetails = activeSubscriptions.map(sub => {
        const monthly = this.calculateMonthlyAmount(sub.cost, sub.frequency);
        const annual = this.calculateAnnualAmount(sub.cost, sub.frequency);
        totalMonthly += monthly;
        totalAnnual += annual;
        
        return {
          ...sub,
          monthlyAmount: monthly,
          annualAmount: annual
        };
      });

      // Get upcoming renewals (next 30 days)
      const upcomingRenewals = subscriptionDetails
        .filter(sub => {
          const renewalDate = new Date(sub.nextChargeDate || sub.renewalDate);
          return renewalDate >= now && renewalDate <= thirtyDaysFromNow;
        })
        .sort((a, b) => new Date(a.nextChargeDate || a.renewalDate) - new Date(b.nextChargeDate || b.renewalDate))
        .slice(0, 5);

      // Get recently added subscriptions (last 30 days)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const recentSubscriptions = subscriptionDetails
        .filter(sub => new Date(sub.createdAt) >= thirtyDaysAgo)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Get subscriptions by category
      const byCategory = {};
      subscriptionDetails.forEach(sub => {
        const categoryName = sub.category?.name || 'Uncategorized';
        if (!byCategory[categoryName]) {
          byCategory[categoryName] = {
            categoryName,
            color: sub.category?.color || '#6B7280',
            icon: sub.category?.icon || 'tag',
            totalMonthly: 0,
            totalAnnual: 0,
            count: 0
          };
        }
        byCategory[categoryName].totalMonthly += sub.monthlyAmount;
        byCategory[categoryName].totalAnnual += sub.annualAmount;
        byCategory[categoryName].count += 1;
      });

      // Get trial subscriptions ending soon
      const trialEnding = activeSubscriptions
        .filter(sub => sub.isTrial && sub.trialEndDate)
        .filter(sub => {
          const trialEnd = new Date(sub.trialEndDate);
          return trialEnd > now && trialEnd <= thirtyDaysFromNow;
        })
        .slice(0, 3);

      // Calculate spending by day of week
      const spendingByDay = {};
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      subscriptionDetails.forEach(sub => {
        const day = dayNames[new Date(sub.renewalDate).getDay()];
        if (!spendingByDay[day]) {
          spendingByDay[day] = 0;
        }
        spendingByDay[day] += sub.monthlyAmount;
      });

      return {
        summary: {
          totalSubscriptions: activeSubscriptions.length,
          totalMonthly: Math.round(totalMonthly * 100) / 100,
          totalAnnual: Math.round(totalAnnual * 100) / 100,
          averagePerSubscription: activeSubscriptions.length > 0 
            ? Math.round((totalMonthly / activeSubscriptions.length) * 100) / 100 
            : 0
        },
        upcomingRenewals: upcomingRenewals.map(sub => ({
          id: sub.id,
          serviceName: sub.serviceName,
          cost: sub.cost,
          frequency: sub.frequency,
          monthlyAmount: sub.monthlyAmount,
          renewalDate: sub.nextChargeDate || sub.renewalDate,
          daysUntilRenewal: Math.ceil((new Date(sub.nextChargeDate || sub.renewalDate) - now) / (1000 * 60 * 60 * 24))
        })),
        recentSubscriptions,
        byCategory: Object.values(byCategory).sort((a, b) => b.totalMonthly - a.totalMonthly),
        trialEnding,
        spendingByDay,
        topExpensive: subscriptionDetails
          .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
          .slice(0, 5)
      };
    } catch (error) {
      console.error('Error getting subscription dashboard:', error);
      throw error;
    }
  }

  /**
   * Get subscription health score
   * Analyzes subscription patterns and provides a health score
   */
  async getHealthScore(userId) {
    try {
      const activeSubscriptions = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        )
      });

      if (activeSubscriptions.length === 0) {
        return {
          score: 100,
          rating: 'excellent',
          factors: [],
          recommendations: ['Add your first subscription to start tracking']
        };
      }

      const factors = [];
      let score = 100;

      // Factor 1: Too many subscriptions (> 10)
      if (activeSubscriptions.length > 10) {
        const penalty = Math.min(20, (activeSubscriptions.length - 10) * 2);
        score -= penalty;
        factors.push({
          name: 'High Subscription Count',
          impact: -penalty,
          message: `You have ${activeSubscriptions.length} active subscriptions`
        });
      }

      // Factor 2: High monthly spending relative to income
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId)
      });

      if (user && parseFloat(user.monthlyIncome) > 0) {
        const totalMonthly = activeSubscriptions.reduce((sum, sub) => 
          sum + this.calculateMonthlyAmount(sub.cost, sub.frequency), 0
        );
        const spendingRatio = totalMonthly / parseFloat(user.monthlyIncome);
        
        if (spendingRatio > 0.2) {
          const penalty = 15;
          score -= penalty;
          factors.push({
            name: 'High Spending Ratio',
            impact: -penalty,
            message: `Subscriptions are ${Math.round(spendingRatio * 100)}% of your income`
          });
        }
      }

      // Factor 3: Duplicate services
      const serviceNames = activeSubscriptions.map(s => s.serviceName.toLowerCase());
      const duplicates = serviceNames.filter((name, index) => 
        serviceNames.indexOf(name) !== index
      );
      
      if (duplicates.length > 0) {
        const penalty = 10;
        score -= penalty;
        factors.push({
          name: 'Duplicate Subscriptions',
          impact: -penalty,
          message: `You may have duplicate subscriptions: ${[...new Set(duplicates)].join(', ')}`
        });
      }

      // Factor 4: Unused trials
      const activeTrials = activeSubscriptions.filter(s => s.isTrial && s.trialEndDate);
      if (activeTrials.length > 3) {
        const penalty = 5;
        score -= penalty;
        factors.push({
          name: 'Multiple Active Trials',
          impact: -penalty,
          message: `You have ${activeTrials.length} active trials - remember to cancel if not needed`
        });
      }

      // Factor 5: Auto-renewal without tracking
      const autoRenewals = activeSubscriptions.filter(s => s.autoRenewal);
      if (autoRenewals.length > 5) {
        const penalty = 5;
        score -= penalty;
        factors.push({
          name: 'Many Auto-Renewals',
          impact: -penalty,
          message: `${autoRenewals.length} subscriptions auto-renew - review periodically`
        });
      }

      // Calculate rating
      let rating;
      if (score >= 90) rating = 'excellent';
      else if (score >= 75) rating = 'good';
      else if (score >= 60) rating = 'fair';
      else if (score >= 40) rating = 'poor';
      else rating = 'critical';

      // Generate recommendations based on factors
      const recommendations = [];
      if (score < 90) {
        recommendations.push('Review your subscriptions and cancel unused ones');
      }
      if (activeSubscriptions.length > 10) {
        recommendations.push('Consider consolidating or reducing subscription count');
      }
      if (duplicates.length > 0) {
        recommendations.push('Check for duplicate services and keep only one');
      }
      if (activeTrials.length > 0) {
        recommendations.push('Monitor trial subscriptions and cancel before they convert');
      }

      return {
        score: Math.max(0, score),
        rating,
        factors,
        recommendations,
        summary: {
          totalSubscriptions: activeSubscriptions.length,
          activeTrials: activeTrials.length,
          autoRenewals: autoRenewals.length,
          duplicates: duplicates.length
        }
      };
    } catch (error) {
      console.error('Error calculating health score:', error);
      throw error;
    }
  }

  /**
   * Get subscription calendar for a specific month
   */
  async getCalendar(userId, year, month) {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); // Last day of month

      const subscriptions = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        )
      });

      const calendar = {};
      
      // Initialize all days
      for (let day = 1; day <= endDate.getDate(); day++) {
        calendar[day] = [];
      }

      // Map subscriptions to calendar days
      subscriptions.forEach(sub => {
        const renewalDate = new Date(sub.nextChargeDate || sub.renewalDate);
        const day = renewalDate.getDate();
        
        if (renewalDate >= startDate && renewalDate <= endDate) {
          calendar[day].push({
            id: sub.id,
            serviceName: sub.serviceName,
            cost: sub.cost,
            frequency: sub.frequency,
            isTrial: sub.isTrial,
            type: 'renewal'
          });
        }

        // Also check if there are other occurrences in the month
        if (sub.frequency === 'weekly') {
          let currentDate = new Date(sub.renewalDate);
          while (currentDate <= endDate) {
            if (currentDate >= startDate) {
              calendar[currentDate.getDate()].push({
                id: sub.id,
                serviceName: sub.serviceName,
                cost: sub.cost,
                frequency: sub.frequency,
                isTrial: sub.isTrial,
                type: 'renewal'
              });
            }
            currentDate.setDate(currentDate.getDate() + 7);
          }
        }
      });

      // Calculate totals for the month
      let totalThisMonth = 0;
      Object.values(calendar).forEach(dayItems => {
        dayItems.forEach(item => {
          totalThisMonth += this.calculateMonthlyAmount(item.cost, item.frequency) / 
            (item.frequency === 'yearly' ? 12 : item.frequency === 'quarterly' ? 3 : 1);
        });
      });

      return {
        year,
        month,
        totalProjected: Math.round(totalThisMonth * 100) / 100,
        calendar: Object.entries(calendar).map(([day, items]) => ({
          day: parseInt(day),
          items
        }))
      };
    } catch (error) {
      console.error('Error getting subscription calendar:', error);
      throw error;
    }
  }

  /**
   * Get subscription forecast for upcoming months
   */
  async getForecast(userId, months = 6) {
    try {
      const now = new Date();
      const forecast = [];

      const activeSubscriptions = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        )
      });

      for (let i = 0; i < months; i++) {
        const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthStart = new Date(forecastDate.getFullYear(), forecastDate.getMonth(), 1);
        const monthEnd = new Date(forecastDate.getFullYear(), forecastDate.getMonth() + 1, 0);

        let monthlyTotal = 0;
        const subscriptionsInMonth = [];

        activeSubscriptions.forEach(sub => {
          const renewalDate = new Date(sub.renewalDate);
          let willRenew = false;

          // Check if subscription renews in this month
          if (sub.frequency === 'monthly') {
            willRenew = true;
          } else if (sub.frequency === 'quarterly') {
            const monthsSinceStart = (renewalDate.getMonth() - sub.renewalDate.getMonth()) + 
              (renewalDate.getFullYear() - sub.renewalDate.getFullYear()) * 12;
            willRenew = (monthsSinceStart + i) % 3 === 0;
          } else if (sub.frequency === 'yearly') {
            willRenew = forecastDate.getFullYear() === renewalDate.getFullYear() && 
              forecastDate.getMonth() === renewalDate.getMonth();
          } else if (sub.frequency === 'weekly') {
            willRenew = true; // Weekly always renews
          }

          if (willRenew) {
            const amount = this.calculateMonthlyAmount(sub.cost, sub.frequency);
            monthlyTotal += amount;
            subscriptionsInMonth.push({
              id: sub.id,
              serviceName: sub.serviceName,
              cost: sub.cost,
              amount
            });
          }
        });

        forecast.push({
          month: forecastDate.toLocaleString('default', { month: 'long', year: 'numeric' }),
          date: monthStart.toISOString(),
          total: Math.round(monthlyTotal * 100) / 100,
          subscriptionCount: subscriptionsInMonth.length,
          subscriptions: subscriptionsInMonth
        });
      }

      return {
        forecast,
        summary: {
          totalSixMonths: Math.round(forecast.reduce((sum, f) => sum + f.total, 0) * 100) / 100,
          averageMonthly: Math.round(forecast.reduce((sum, f) => sum + f.total, 0) / months * 100) / 100,
          highestMonth: forecast.reduce((max, f) => f.total > max.total ? f : max, forecast[0]),
          lowestMonth: forecast.reduce((min, f) => f.total < min.total ? f : min, forecast[0])
        }
      };
    } catch (error) {
      console.error('Error getting subscription forecast:', error);
      throw error;
    }
  }

  /**
   * Compare subscription spending across time periods
   */
  async comparePeriods(userId, period1Start, period1End, period2Start, period2End) {
    try {
      const getPeriodData = async (startDate, endDate) => {
        const periodSubscriptions = await db.query.subscriptions.findMany({
          where: and(
            eq(subscriptions.userId, userId),
            eq(subscriptions.status, 'active'),
            lte(subscriptions.createdAt, endDate)
          )
        });

        const totalMonthly = periodSubscriptions.reduce((sum, sub) => 
          sum + this.calculateMonthlyAmount(sub.cost, sub.frequency), 0
        );
        
        const totalAnnual = periodSubscriptions.reduce((sum, sub) => 
          sum + this.calculateAnnualAmount(sub.cost, sub.frequency), 0
        );

        return {
          subscriptionCount: periodSubscriptions.length,
          totalMonthly: Math.round(totalMonthly * 100) / 100,
          totalAnnual: Math.round(totalAnnual * 100) / 100,
          byFrequency: {
            weekly: periodSubscriptions.filter(s => s.frequency === 'weekly').length,
            monthly: periodSubscriptions.filter(s => s.frequency === 'monthly').length,
            quarterly: periodSubscriptions.filter(s => s.frequency === 'quarterly').length,
            yearly: periodSubscriptions.filter(s => s.frequency === 'yearly').length
          }
        };
      };

      const period1 = await getPeriodData(new Date(period1Start), new Date(period1End));
      const period2 = await getPeriodData(new Date(period2Start), new Date(period2End));

      const changes = {
        subscriptionCount: {
          value: period2.subscriptionCount - period1.subscriptionCount,
          percentage: period1.subscriptionCount > 0 
            ? ((period2.subscriptionCount - period1.subscriptionCount) / period1.subscriptionCount) * 100 
            : 0
        },
        totalMonthly: {
          value: period2.totalMonthly - period1.totalMonthly,
          percentage: period1.totalMonthly > 0 
            ? ((period2.totalMonthly - period1.totalMonthly) / period1.totalMonthly) * 100 
            : 0
        },
        totalAnnual: {
          value: period2.totalAnnual - period1.totalAnnual,
          percentage: period1.totalAnnual > 0 
            ? ((period2.totalAnnual - period1.totalAnnual) / period1.totalAnnual) * 100 
            : 0
        }
      };

      return {
        period1,
        period2,
        changes,
        trend: changes.totalMonthly.value > 0 ? 'increasing' : changes.totalMonthly.value < 0 ? 'decreasing' : 'stable'
      };
    } catch (error) {
      console.error('Error comparing periods:', error);
      throw error;
    }
  }

  /**
   * Get subscription insights and trends
   */
  async getInsights(userId) {
    try {
      const activeSubscriptions = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active')
        ),
        with: {
          category: {
            columns: { name: true, color: true }
          }
        }
      });

      const insights = [];

      // Insight 1: Most expensive category
      const categorySpending = {};
      activeSubscriptions.forEach(sub => {
        const cat = sub.category?.name || 'Uncategorized';
        categorySpending[cat] = (categorySpending[cat] || 0) + 
          this.calculateMonthlyAmount(sub.cost, sub.frequency);
      });

      const topCategory = Object.entries(categorySpending)
        .sort((a, b) => b[1] - a[1])[0];

      if (topCategory) {
        insights.push({
          type: 'category',
          title: 'Highest Spending Category',
          description: `You spend the most on ${topCategory[0]} ($${topCategory[1].toFixed(2)}/month)`,
          priority: 'high'
        });
      }

      // Insight 2: Frequency distribution
      const frequencyCounts = {
        weekly: activeSubscriptions.filter(s => s.frequency === 'weekly').length,
        monthly: activeSubscriptions.filter(s => s.frequency === 'monthly').length,
        quarterly: activeSubscriptions.filter(s => s.frequency === 'quarterly').length,
        yearly: activeSubscriptions.filter(s => s.frequency === 'yearly').length
      };

      const mostCommon = Object.entries(frequencyCounts)
        .sort((a, b) => b[1] - a[1])[0];

      if (mostCommon && mostCommon[1] > 0) {
        insights.push({
          type: 'frequency',
          title: 'Most Common Billing',
          description: `Most of your subscriptions (${mostCommon[1]}) are billed ${mostCommon[0]}`,
          priority: 'medium'
        });
      }

      // Insight 3: Potential savings from yearly
      const monthlySubs = activeSubscriptions.filter(s => s.frequency === 'monthly');
      let yearlySavings = 0;
      monthlySubs.forEach(sub => {
        const monthly = parseFloat(sub.cost);
        const yearly = monthly * 12;
        const yearlyPrice = yearly * 0.8; // Assume 20% discount for yearly
        yearlySavings += (yearly - yearlyPrice) / 12;
      });

      if (yearlySavings > 0) {
        insights.push({
          type: 'savings',
          title: 'Potential Yearly Savings',
          description: `Switching to yearly billing could save ~$${yearlySavings.toFixed(2)}/month`,
          priority: 'high',
          potentialSavings: Math.round(yearlySavings * 12 * 100) / 100
        });
      }

      // Insight 4: Recently added (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentCount = activeSubscriptions.filter(s => new Date(s.createdAt) >= thirtyDaysAgo).length;

      if (recentCount > 0) {
        insights.push({
          type: 'trend',
          title: 'Recent Activity',
          description: `You've added ${recentCount} new subscription${recentCount > 1 ? 's' : ''} this month`,
          priority: 'low'
        });
      }

      // Insight 5: Subscription value analysis
      const expensiveSubs = activeSubscriptions
        .map(s => ({ ...s, monthly: this.calculateMonthlyAmount(s.cost, s.frequency) }))
        .filter(s => s.monthly > 30)
        .sort((a, b) => b.monthly - a.monthly);

      if (expensiveSubs.length > 0) {
        insights.push({
          type: 'analysis',
          title: 'High-Value Subscriptions',
          description: `You have ${expensiveSubs.length} subscriptions costing over $30/month`,
          priority: 'medium',
          details: expensiveSubs.slice(0, 3).map(s => ({
            name: s.serviceName,
            monthly: s.monthly
          }))
        });
      }

      return {
        insights,
        statistics: {
          totalActive: activeSubscriptions.length,
          categoryCount: Object.keys(categorySpending).length,
          frequencyDistribution: frequencyCounts
        }
      };
    } catch (error) {
      console.error('Error getting insights:', error);
      throw error;
    }
  }

  /**
   * Export subscriptions data
   */
  async exportData(userId, format = 'json') {
    try {
      const subscriptions = await db.query.subscriptions.findMany({
        where: eq(subscriptions.userId, userId),
        with: {
          category: {
            columns: { name: true, color: true }
          }
        }
      });

      const exportData = subscriptions.map(sub => ({
        serviceName: sub.serviceName,
        description: sub.description,
        category: sub.category?.name,
        cost: sub.cost,
        currency: sub.currency,
        frequency: sub.frequency,
        monthlyAmount: this.calculateMonthlyAmount(sub.cost, sub.frequency),
        annualAmount: this.calculateAnnualAmount(sub.cost, sub.frequency),
        renewalDate: sub.renewalDate,
        nextChargeDate: sub.nextChargeDate,
        autoRenewal: sub.autoRenewal,
        status: sub.status,
        paymentMethod: sub.paymentMethod,
        website: sub.website,
        isTrial: sub.isTrial,
        trialEndDate: sub.trialEndDate,
        notes: sub.notes,
        tags: sub.tags,
        createdAt: sub.createdAt
      }));

      if (format === 'csv') {
        const headers = Object.keys(exportData[0] || {}).join(',');
        const rows = exportData.map(row => Object.values(row).join(','));
        return [headers, ...rows].join('\n');
      }

      return exportData;
    } catch (error) {
      console.error('Error exporting subscription data:', error);
      throw error;
    }
  }

  /**
   * Send renewal reminder notifications
   */
  async sendRenewalReminders(userId) {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const dayAfterTomorrow = new Date(tomorrow);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

      const subscriptions = await db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, userId),
          eq(subscriptions.status, 'active'),
          gte(subscriptions.nextChargeDate, tomorrow),
          lt(subscriptions.nextChargeDate, dayAfterTomorrow)
        )
      });

      for (const sub of subscriptions) {
        await notificationService.sendNotification({
          userId,
          type: 'subscription_renewal_reminder',
          title: 'Subscription Renewal Tomorrow',
          message: `${sub.serviceName} will renew tomorrow for ${sub.currency} ${sub.cost}`,
          data: {
            subscriptionId: sub.id,
            serviceName: sub.serviceName,
            cost: sub.cost,
            frequency: sub.frequency,
            renewalDate: sub.nextChargeDate
          }
        });
      }

      return subscriptions.length;
    } catch (error) {
      console.error('Error sending renewal reminders:', error);
      throw error;
    }
  }
}

export default new SubscriptionTrackerService();
