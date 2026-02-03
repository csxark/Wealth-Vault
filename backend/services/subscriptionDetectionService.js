import { eq, and, gte, lte, sql, desc, count } from 'drizzle-orm';
import db from '../config/db.js';
import { expenses, categories, subscriptions } from '../db/schema.js';
import subscriptionService from './subscriptionService.js';

class SubscriptionDetectionService {
  /**
   * Common subscription keywords to look for in descriptions
   */
  getSubscriptionKeywords() {
    return [
      'netflix', 'spotify', 'amazon prime', 'hulu', 'disney+', 'apple music',
      'microsoft', 'adobe', 'norton', 'mcafee', 'dropbox', 'google drive',
      'onedrive', 'slack', 'zoom', 'grammarly', 'canva', 'figma', 'notion',
      'trello', 'asana', 'monday.com', 'hubspot', 'salesforce', 'shopify',
      'stripe', 'paypal', 'aws', 'digitalocean', 'heroku', 'vercel', 'netlify',
      'github', 'gitlab', 'bitbucket', 'jetbrains', 'vscode', 'sublime',
      'audible', 'kindle', 'playstation', 'xbox', 'nintendo', 'steam',
      'epic games', 'ubisoft', 'ea games', 'blizzard', 'activision',
      'subscription', 'monthly', 'annual', 'yearly', 'recurring'
    ];
  }

  /**
   * Analyze expense patterns to detect potential subscriptions
   */
  async detectPotentialSubscriptions(userId, monthsToAnalyze = 6) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - monthsToAnalyze);

      // Get expenses in the analysis period
      const userExpenses = await db.query.expenses.findMany({
        where: and(
          eq(expenses.userId, userId),
          gte(expenses.date, startDate),
          lte(expenses.date, endDate),
          eq(expenses.status, 'completed')
        ),
        with: {
          category: {
            columns: { name: true, type: true }
          }
        },
        orderBy: [desc(expenses.date)]
      });

      const potentialSubscriptions = [];
      const expenseGroups = this.groupExpensesByDescription(userExpenses);

      for (const [description, expenses] of Object.entries(expenseGroups)) {
        const pattern = this.analyzeExpensePattern(expenses);
        if (pattern.isPotentialSubscription) {
          // Check if already exists as subscription
          const existingSubscription = await db.query.subscriptions.findFirst({
            where: and(
              eq(subscriptions.userId, userId),
              eq(subscriptions.serviceName, pattern.serviceName)
            )
          });

          if (!existingSubscription) {
            potentialSubscriptions.push({
              ...pattern,
              expenseIds: expenses.map(e => e.id),
              confidence: this.calculateConfidence(pattern, expenses)
            });
          }
        }
      }

      return potentialSubscriptions.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      console.error('Error detecting potential subscriptions:', error);
      throw error;
    }
  }

  /**
   * Group expenses by similar descriptions
   */
  groupExpensesByDescription(expenses) {
    const groups = {};

    for (const expense of expenses) {
      const normalizedDesc = this.normalizeDescription(expense.description);

      if (!groups[normalizedDesc]) {
        groups[normalizedDesc] = [];
      }

      groups[normalizedDesc].push(expense);
    }

    // Filter groups with multiple expenses
    return Object.fromEntries(
      Object.entries(groups).filter(([_, expenses]) => expenses.length >= 2)
    );
  }

  /**
   * Normalize expense descriptions for grouping
   */
  normalizeDescription(description) {
    return description
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/\b\d{4}\b/g, '') // Remove 4-digit numbers (like years)
      .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '') // Remove dates
      .trim();
  }

  /**
   * Analyze expense pattern to determine if it's a subscription
   */
  analyzeExpensePattern(expenses) {
    if (expenses.length < 2) return { isPotentialSubscription: false };

    const amounts = expenses.map(e => parseFloat(e.amount));
    const dates = expenses.map(e => new Date(e.date)).sort((a, b) => a - b);

    // Check amount consistency (within 10% variance)
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const amountVariance = amounts.every(amt =>
      Math.abs(amt - avgAmount) / avgAmount <= 0.1
    );

    if (!amountVariance) return { isPotentialSubscription: false };

    // Check for regular intervals
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      const diffDays = Math.round((dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }

    const avgInterval = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
    const intervalVariance = intervals.every(int =>
      Math.abs(int - avgInterval) / avgInterval <= 0.3 // 30% variance allowed
    );

    // Determine frequency based on average interval
    let frequency = 'monthly';
    if (avgInterval <= 10) frequency = 'weekly';
    else if (avgInterval <= 45) frequency = 'monthly';
    else if (avgInterval <= 140) frequency = 'quarterly';
    else frequency = 'yearly';

    // Check if description contains subscription keywords
    const description = expenses[0].description.toLowerCase();
    const hasKeywords = this.getSubscriptionKeywords().some(keyword =>
      description.includes(keyword)
    );

    // Check category type
    const categoryType = expenses[0].category?.type;
    const isSubscriptionCategory = ['entertainment', 'software', 'utilities'].includes(
      expenses[0].category?.name?.toLowerCase()
    );

    const isPotentialSubscription = (
      intervalVariance &&
      (hasKeywords || isSubscriptionCategory || avgInterval <= 45) // Monthly or more frequent
    );

    if (!isPotentialSubscription) return { isPotentialSubscription: false };

    // Extract service name
    const serviceName = this.extractServiceName(expenses[0].description);

    return {
      isPotentialSubscription: true,
      serviceName,
      cost: avgAmount.toString(),
      frequency,
      averageInterval: Math.round(avgInterval),
      transactionCount: expenses.length,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      categoryId: expenses[0].categoryId,
      confidence: this.calculatePatternConfidence(intervals, amounts, hasKeywords)
    };
  }

  /**
   * Extract service name from description
   */
  extractServiceName(description) {
    // Try to find known service names
    const keywords = this.getSubscriptionKeywords();
    const lowerDesc = description.toLowerCase();

    for (const keyword of keywords) {
      if (lowerDesc.includes(keyword)) {
        // Capitalize first letter of each word
        return keyword.split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }
    }

    // Fallback: use first few words of description
    const words = description.split(' ').slice(0, 3);
    return words.map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }

  /**
   * Calculate confidence score for pattern detection
   */
  calculatePatternConfidence(intervals, amounts, hasKeywords) {
    let confidence = 0;

    // Interval regularity (0-40 points)
    const avgInterval = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
    const intervalVariance = intervals.reduce((sum, int) =>
      sum + Math.pow(int - avgInterval, 2), 0
    ) / intervals.length;
    const regularityScore = Math.max(0, 40 - (intervalVariance / avgInterval) * 100);
    confidence += regularityScore;

    // Amount consistency (0-30 points)
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const amountVariance = amounts.reduce((sum, amt) =>
      sum + Math.pow(amt - avgAmount, 2), 0
    ) / amounts.length;
    const consistencyScore = Math.max(0, 30 - (amountVariance / avgAmount) * 100);
    confidence += consistencyScore;

    // Transaction count (0-20 points)
    const countScore = Math.min(20, intervals.length * 2);
    confidence += countScore;

    // Keywords bonus (0-10 points)
    if (hasKeywords) confidence += 10;

    return Math.min(100, Math.round(confidence));
  }

  /**
   * Calculate overall confidence for potential subscription
   */
  calculateConfidence(pattern, expenses) {
    let confidence = pattern.confidence;

    // Boost confidence for higher transaction counts
    if (expenses.length >= 6) confidence += 10;
    else if (expenses.length >= 3) confidence += 5;

    // Boost for regular intervals
    if (pattern.averageInterval <= 35 && pattern.averageInterval >= 25) confidence += 5; // Monthly
    if (pattern.averageInterval <= 10 && pattern.averageInterval >= 5) confidence += 5; // Weekly

    return Math.min(100, confidence);
  }

  /**
   * Create subscription from detected pattern
   */
  async createSubscriptionFromDetection(userId, detectionData) {
    try {
      // Calculate renewal date based on last transaction and frequency
      const lastDate = new Date(detectionData.lastDate);
      const renewalDate = this.calculateNextRenewalDate(lastDate, detectionData.frequency);

      const subscriptionData = {
        userId,
        categoryId: detectionData.categoryId,
        serviceName: detectionData.serviceName,
        description: `Auto-detected from ${detectionData.transactionCount} transactions`,
        cost: detectionData.cost,
        currency: 'USD', // Assume USD, can be updated later
        frequency: detectionData.frequency,
        renewalDate,
        autoRenewal: true,
        status: 'active',
        paymentMethod: 'credit_card', // Default
        metadata: {
          detectedFromExpense: true,
          expenseIds: detectionData.expenseIds,
          detectionConfidence: detectionData.confidence,
          annualCost: subscriptionService.calculateAnnualCost(detectionData.cost, detectionData.frequency).toString(),
          costTrend: [],
          lastReminderSent: null
        }
      };

      const newSubscription = await subscriptionService.createSubscription(subscriptionData);

      // Update expenses to mark them as subscription-related
      for (const expenseId of detectionData.expenseIds) {
        await db
          .update(expenses)
          .set({
            metadata: sql`${expenses.metadata} || '{"subscriptionId": "${newSubscription.id}"}'::jsonb`
          })
          .where(eq(expenses.id, expenseId));
      }

      return newSubscription;
    } catch (error) {
      console.error('Error creating subscription from detection:', error);
      throw error;
    }
  }

  /**
   * Calculate next renewal date based on last transaction
   */
  calculateNextRenewalDate(lastDate, frequency) {
    const date = new Date(lastDate);

    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
      default:
        date.setMonth(date.getMonth() + 1);
    }

    return date;
  }

  /**
   * Get subscription detection statistics
   */
  async getDetectionStats(userId) {
    try {
      const [stats] = await db
        .select({
          totalDetections: sql`count(*)`,
          highConfidence: sql`count(case when (${subscriptions.metadata}->>'detectionConfidence')::int >= 80 then 1 end)`,
          mediumConfidence: sql`count(case when (${subscriptions.metadata}->>'detectionConfidence')::int >= 60 and (${subscriptions.metadata}->>'detectionConfidence')::int < 80 then 1 end)`,
          lowConfidence: sql`count(case when (${subscriptions.metadata}->>'detectionConfidence')::int < 60 then 1 end)`
        })
        .from(subscriptions)
        .where(and(
          eq(subscriptions.userId, userId),
          sql`${subscriptions.metadata}->>'detectedFromExpense' = 'true'`
        ));

      return {
        totalDetections: Number(stats?.totalDetections || 0),
        highConfidence: Number(stats?.highConfidence || 0),
        mediumConfidence: Number(stats?.mediumConfidence || 0),
        lowConfidence: Number(stats?.lowConfidence || 0)
      };
    } catch (error) {
      console.error('Error getting detection stats:', error);
      throw error;
    }
  }
}

export default new SubscriptionDetectionService();
