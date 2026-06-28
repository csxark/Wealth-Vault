import { eq, and, gte, lte, sql, desc, asc, not, isNull, or } from 'drizzle-orm';
import db from '../config/db.js';
import { subscriptions, expenses, categories } from '../db/schema.js';

/**
 * Subscription Detection Service
 * Automatically detects potential subscriptions from expense data
 */
class SubscriptionDetectionService {
  /**
   * Known subscription service patterns
   */
  KNOWN_SUBSCRIPTIONS = {
    'netflix': { category: 'Entertainment', frequency: 'monthly', confidence: 0.95 },
    'spotify': { category: 'Entertainment', frequency: 'monthly', confidence: 0.95 },
    'apple music': { category: 'Entertainment', frequency: 'monthly', confidence: 0.95 },
    'amazon prime': { category: 'Shopping', frequency: 'monthly', confidence: 0.95 },
    'amazon.com': { category: 'Shopping', frequency: 'monthly', confidence: 0.7 },
    'disney+': { category: 'Entertainment', frequency: 'monthly', confidence: 0.95 },
    'hulu': { category: 'Entertainment', frequency: 'monthly', confidence: 0.95 },
    'hbo': { category: 'Entertainment', frequency: 'monthly', confidence: 0.95 },
    'youtube': { category: 'Entertainment', frequency: 'monthly', confidence: 0.8 },
    'youtube premium': { category: 'Entertainment', frequency: 'monthly', confidence: 0.95 },
    'playstation': { category: 'Entertainment', frequency: 'monthly', confidence: 0.9 },
    'xbox': { category: 'Entertainment', frequency: 'monthly', confidence: 0.9 },
    'microsoft': { category: 'Software', frequency: 'monthly', confidence: 0.85 },
    'adobe': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    'dropbox': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    'google drive': { category: 'Software', frequency: 'monthly', confidence: 0.9 },
    'icloud': { category: 'Software', frequency: 'monthly', confidence: 0.9 },
    'onedrive': { category: 'Software', frequency: 'monthly', confidence: 0.9 },
    'office': { category: 'Software', frequency: 'monthly', confidence: 0.85 },
    'slack': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    'zoom': { category: 'Software', frequency: 'monthly', confidence: 0.9 },
    'notion': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    'figma': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    'github': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    'chatgpt': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    'openai': { category: 'Software', frequency: 'monthly', confidence: 0.9 },
    'nordvpn': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    'expressvpn': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    '1password': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    'lastpass': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    'grammarly': { category: 'Software', frequency: 'monthly', confidence: 0.95 },
    'linkedin': { category: 'Professional', frequency: 'monthly', confidence: 0.9 },
    'gym': { category: 'Health', frequency: 'monthly', confidence: 0.85 },
    'fitness': { category: 'Health', frequency: 'monthly', confidence: 0.85 },
    'planet fitness': { category: 'Health', frequency: 'monthly', confidence: 0.95 },
    'audible': { category: 'Entertainment', frequency: 'monthly', confidence: 0.95 },
    'kindle': { category: 'Entertainment', frequency: 'monthly', confidence: 0.9 },
    'patreon': { category: 'Entertainment', frequency: 'monthly', confidence: 0.9 },
    'twitch': { category: 'Entertainment', frequency: 'monthly', confidence: 0.9 },
    'medium': { category: 'News', frequency: 'monthly', confidence: 0.9 },
    'new york times': { category: 'News', frequency: 'monthly', confidence: 0.9 },
    'wall street journal': { category: 'News', frequency: 'monthly', confidence: 0.9 },
    'subscription': { category: 'General', frequency: 'monthly', confidence: 0.7 },
    'monthly': { category: 'General', frequency: 'monthly', confidence: 0.5 },
    'annual': { category: 'General', frequency: 'yearly', confidence: 0.6 },
    'membership': { category: 'General', frequency: 'monthly', confidence: 0.6 },
    'rent': { category: 'Housing', frequency: 'monthly', confidence: 0.95 },
    'insurance': { category: 'Insurance', frequency: 'monthly', confidence: 0.9 },
    'electric': { category: 'Utilities', frequency: 'monthly', confidence: 0.8 },
    'water': { category: 'Utilities', frequency: 'monthly', confidence: 0.8 },
    'gas': { category: 'Utilities', frequency: 'monthly', confidence: 0.8 },
    'internet': { category: 'Utilities', frequency: 'monthly', confidence: 0.9 },
    'phone': { category: 'Utilities', frequency: 'monthly', confidence: 0.9 },
    'mobile': { category: 'Utilities', frequency: 'monthly', confidence: 0.9 },
    'verizon': { category: 'Utilities', frequency: 'monthly', confidence: 0.9 },
    'at&t': { category: 'Utilities', frequency: 'monthly', confidence: 0.9 },
    't-mobile': { category: 'Utilities', frequency: 'monthly', confidence: 0.9 },
    'comcast': { category: 'Utilities', frequency: 'monthly', confidence: 0.9 },
    'spectrum': { category: 'Utilities', frequency: 'monthly', confidence: 0.9 }
  };

  /**
   * Detect potential subscriptions from expenses
   */
  async detectPotentialSubscriptions(userId, monthsToAnalyze = 6) {
    try {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth() - monthsToAnalyze, 1);

      // Get all expenses for the user in the analysis period
      const userExpenses = await db.query.expenses.findMany({
        where: and(
          eq(expenses.userId, userId),
          gte(expenses.date, startDate)
        ),
        orderBy: [asc(expenses.date)]
      });

      // Get existing subscriptions to exclude
      const existingSubscriptions = await db.query.subscriptions.findMany({
        where: eq(subscriptions.userId, userId)
      });
      const existingNames = existingSubscriptions.map(s => s.serviceName.toLowerCase());

      // Group expenses by description pattern
      const expenseGroups = this.groupExpensesByPattern(userExpenses);

      // Analyze each group for subscription patterns
      const detections = [];

      for (const [key, group] of Object.entries(expenseGroups)) {
        if (group.length < 2) continue; // Need at least 2 occurrences

        const analysis = this.analyzeExpenseGroup(group, existingNames);
        
        if (analysis.isSubscription) {
          detections.push(analysis);
        }
      }

      // Sort by confidence and potential savings
      detections.sort((a, b) => {
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return b.averageAmount - a.averageAmount;
      });

      return {
        detections,
        summary: {
          totalDetections: detections.length,
          highConfidence: detections.filter(d => d.confidence >= 0.8).length,
          mediumConfidence: detections.filter(d => d.confidence >= 0.5 && d.confidence < 0.8).length,
          lowConfidence: detections.filter(d => d.confidence < 0.5).length,
          totalPotentialMonthly: detections.reduce((sum, d) => sum + d.averageAmount, 0),
          totalPotentialAnnual: detections.reduce((sum, d) => sum + (d.averageAmount * 12), 0)
        }
      };
    } catch (error) {
      console.error('Error detecting potential subscriptions:', error);
      throw error;
    }
  }

  /**
   * Group expenses by similar descriptions
   */
  groupExpensesByPattern(expenses) {
    const groups = {};

    for (const expense of expenses) {
      const description = expense.description.toLowerCase().trim();
      
      // Try to find a common pattern
      const normalizedDesc = this.normalizeDescription(description);
      
      if (!groups[normalizedDesc]) {
        groups[normalizedDesc] = [];
      }
      groups[normalizedDesc].push(expense);
    }

    return groups;
  }

  /**
   * Normalize expense description
   */
  normalizeDescription(description) {
    // Remove common variations
    let normalized = description
      .toLowerCase()
      .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '') // Remove dates
      .replace(/\*+\d+/g, '') // Remove card numbers
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();

    // Check if it matches known subscriptions
    for (const [key, pattern] of Object.entries(this.KNOWN_SUBSCRIPTIONS)) {
      if (normalized.includes(key)) {
        return key;
      }
    }

    // Use first few words as key if no match
    const words = normalized.split(' ');
    if (words.length > 3) {
      return words.slice(0, 3).join(' ');
    }

    return normalized.substring(0, 30);
  }

  /**
   * Analyze a group of expenses for subscription patterns
   */
  analyzeExpenseGroup(expenseGroup, existingNames) {
    const amounts = expenseGroup.map(e => parseFloat(e.amount));
    const dates = expenseGroup.map(e => new Date(e.date)).sort((a, b) => a - b);
    
    const averageAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountVariance = this.calculateVariance(amounts);
    const amountStdDev = Math.sqrt(amountVariance);

    // Check if amounts are consistent (low variance)
    const isConsistentAmount = amountStdDev < averageAmount * 0.1; // Less than 10% variation

    // Check if dates follow a pattern
    const frequency = this.detectFrequency(dates);
    const isRecurring = frequency !== null;

    // Check if it matches known subscription patterns
    const description = expenseGroup[0].description.toLowerCase();
    let knownMatch = null;
    let knownConfidence = 0;

    for (const [key, pattern] of Object.entries(this.KNOWN_SUBSCRIPTIONS)) {
      if (description.includes(key)) {
        knownMatch = pattern;
        knownConfidence = pattern.confidence;
        break;
      }
    }

    // Calculate confidence score
    let confidence = 0;

    if (knownMatch) {
      confidence += knownConfidence * 0.4;
    }

    if (isRecurring) {
      confidence += 0.3;
    }

    if (isConsistentAmount) {
      confidence += 0.2;
    }

    if (expenseGroup.length >= 3) {
      confidence += 0.1;
    }

    // Check if already tracked
    const firstDesc = description.substring(0, 30);
    const isExisting = existingNames.some(name => 
      firstDesc.includes(name.substring(0, 10)) || name.includes(firstDesc.substring(0, 10))
    );

    return {
      serviceName: this.formatServiceName(expenseGroup[0].description),
      description: expenseGroup[0].description,
      isSubscription: confidence >= 0.5 && isRecurring && !isExisting,
      confidence: Math.min(0.99, Math.round(confidence * 100) / 100),
      averageAmount: Math.round(averageAmount * 100) / 100,
      amountVariance: Math.round(amountStdDev * 100) / 100,
      frequency: frequency || 'unknown',
      occurrenceCount: expenseGroup.length,
      firstDate: dates[0],
      lastDate: dates[dates.length - 1],
      expenseIds: expenseGroup.map(e => e.id),
      isConsistentAmount,
      isRecurring,
      knownMatch: knownMatch?.category || null,
      isExisting,
      suggestedCategory: knownMatch?.category || 'General',
      suggestedFrequency: knownMatch?.frequency || frequency || 'monthly'
    };
  }

  /**
   * Detect billing frequency from dates
   */
  detectFrequency(dates) {
    if (dates.length < 2) return null;

    // Calculate intervals between consecutive dates
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      const diffTime = Math.abs(dates[i] - dates[i - 1]);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

    // Check intervals against expected frequencies
    const frequencies = {
      weekly: { min: 5, max: 10 },
      biweekly: { min: 12, max: 17 },
      monthly: { min: 25, max: 35 },
      quarterly: { min: 85, max: 105 },
      yearly: { min: 350, max: 380 }
    };

    for (const [freq, range] of Object.entries(frequencies)) {
      if (avgInterval >= range.min && avgInterval <= range.max) {
        return freq;
      }
    }

    // Check if all intervals are very similar (highly consistent)
    const variance = this.calculateVariance(intervals);
    const stdDev = Math.sqrt(variance);
    
    // If standard deviation is low and matches one of the ranges loosely
    if (stdDev < 5) {
      if (avgInterval > 20 && avgInterval < 40) return 'monthly';
      if (avgInterval > 80 && avgInterval < 110) return 'quarterly';
    }

    return null;
  }

  /**
   * Calculate variance
   */
  calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Format service name from description
   */
  formatServiceName(description) {
    // Capitalize first letter of each word
    return description
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .substring(0, 50);
  }

  /**
   * Get detection statistics
   */
  async getDetectionStats(userId) {
    try {
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

      // Get all expenses in the period
      const expenses = await db.query.expenses.findMany({
        where: and(
          eq(expenses.userId, userId),
          gte(expenses.date, sixMonthsAgo)
        )
      });

      // Get existing subscriptions
      const existingSubscriptions = await db.query.subscriptions.findMany({
        where: eq(subscriptions.userId, userId)
      });

      // Analyze patterns
      const expenseGroups = this.groupExpensesByPattern(expenses);
      let recurringPatterns = 0;
      let knownSubscriptionMatches = 0;
      let totalExpenseAmount = 0;

      for (const [key, group] of Object.entries(expenseGroups)) {
        if (group.length < 2) continue;
        
        const amounts = group.map(e => parseFloat(e.amount));
        const dates = group.map(e => new Date(e.date)).sort((a, b) => a - b);
        
        if (this.detectFrequency(dates)) {
          recurringPatterns++;
        }

        const desc = group[0].description.toLowerCase();
        for (const key of Object.keys(this.KNOWN_SUBSCRIPTIONS)) {
          if (desc.includes(key)) {
            knownSubscriptionMatches++;
            break;
          }
        }

        totalExpenseAmount += amounts.reduce((a, b) => a + b, 0);
      }

      return {
        analysisPeriod: {
          start: sixMonthsAgo.toISOString(),
          end: now.toISOString(),
          months: 6
        },
        expensesAnalyzed: expenses.length,
        uniqueMerchants: Object.keys(expenseGroups).length,
        recurringPatterns,
        knownSubscriptionMatches,
        totalExpenseAmount: Math.round(totalExpenseAmount * 100) / 100,
        existingSubscriptions: existingSubscriptions.length,
        potentialNewSubscriptions: recurringPatterns - existingSubscriptions.length
      };
    } catch (error) {
      console.error('Error getting detection stats:', error);
      throw error;
    }
  }

  /**
   * Create subscription from detection
   */
  async createFromDetection(userId, detectionData) {
    try {
      const { 
        serviceName, 
        averageAmount, 
        suggestedFrequency, 
        categoryId,
        expenseIds,
        confidence 
      } = detectionData;

      // Get category ID if not provided
      let finalCategoryId = categoryId;
      if (!finalCategoryId) {
        const categoryName = this.KNOWN_SUBSCRIPTIONS[serviceName.toLowerCase()]?.category || 'General';
        const category = await db.query.categories.findFirst({
          where: and(
            eq(categories.userId, userId),
            eq(categories.name, categoryName)
          )
        });
        if (category) {
          finalCategoryId = category.id;
        }
      }

      // Calculate next charge date
      const nextChargeDate = this.calculateNextChargeDate(new Date(), suggestedFrequency);

      // Create the subscription
      const [newSubscription] = await db
        .insert(subscriptions)
        .values({
          userId,
          categoryId: finalCategoryId,
          serviceName,
          description: `Auto-detected subscription (${Math.round(confidence * 100)}% confidence)`,
          cost: averageAmount.toString(),
          currency: 'USD',
          frequency: suggestedFrequency,
          renewalDate: nextChargeDate,
          nextChargeDate,
          autoRenewal: true,
          status: 'active',
          isTrial: false,
          metadata: {
            detectedFromExpense: true,
            expenseIds,
            confidence,
            detectionDate: new Date().toISOString()
          }
        })
        .returning();

      return newSubscription;
    } catch (error) {
      console.error('Error creating subscription from detection:', error);
      throw error;
    }
  }

  /**
   * Calculate next charge date
   */
  calculateNextChargeDate(startDate, frequency) {
    const date = new Date(startDate);
    
    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'biweekly':
        date.setDate(date.getDate() + 14);
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
   * Get recommended subscriptions to track
   */
  async getRecommendations(userId) {
    try {
      const detections = await this.detectPotentialSubscriptions(userId, 6);
      
      // Filter to high-confidence detections that aren't already tracked
      const recommendations = detections.detections
        .filter(d => d.confidence >= 0.6 && !d.isExisting)
        .slice(0, 10);

      return {
        recommendations: recommendations.map(r => ({
          serviceName: r.serviceName,
          confidence: r.confidence,
          estimatedMonthly: r.averageAmount,
          estimatedAnnual: r.averageAmount * 12,
          frequency: r.frequency,
          reason: this.getRecommendationReason(r)
        })),
        totalPotentialSavings: {
          monthly: recommendations.reduce((sum, r) => sum + r.averageAmount, 0),
          annual: recommendations.reduce((sum, r) => sum + (r.averageAmount * 12), 0)
        }
      };
    } catch (error) {
      console.error('Error getting recommendations:', error);
      throw error;
    }
  }

  /**
   * Get reason for recommendation
   */
  getRecommendationReason(detection) {
    const reasons = [];
    
    if (detection.knownMatch) {
      reasons.push(`Known subscription service (${detection.knownMatch})`);
    }
    
    if (detection.isRecurring) {
      reasons.push('Recurring payment pattern detected');
    }
    
    if (detection.isConsistentAmount) {
      reasons.push('Consistent payment amounts');
    }
    
    if (detection.occurrenceCount >= 3) {
      reasons.push(`${detection.occurrenceCount} occurrences in past 6 months`);
    }

    return reasons.join('. ');
  }
}

export default new SubscriptionDetectionService();
