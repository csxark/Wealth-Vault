/**
 * Bill Negotiation Service
 * Handles bill negotiation tips, strategies, and tracking user attempts
 */

import { eq, and, desc } from 'drizzle-orm';
import db from '../config/db.js';
import { billNegotiation, bills, negotiationTips, negotiationAttempts } from '../db/schema.js';

class BillNegotiationService {
  /**
   * Get negotiation recommendations for a specific bill
   */
  async getNegotiationRecommendations(userId, billId) {
    try {
      const bill = await db.query.bills.findFirst({
        where: and(
          eq(bills.id, billId),
          eq(bills.userId, userId)
        ),
        with: {
          category: true
        }
      });

      if (!bill) {
        throw new Error('Bill not found');
      }

      // Determine bill category
      const billCategory = this.determineBillCategory(bill.name, bill.description);

      // Get or create negotiation record
      let negotiation = await db.query.billNegotiation.findFirst({
        where: and(
          eq(billNegotiation.userId, userId),
          eq(billNegotiation.billId, billId)
        )
      });

      if (!negotiation) {
        // Create new negotiation record
        negotiation = await this.createNegotiationRecord(userId, billId, bill, billCategory);
      }

      // Get relevant tips for this category
      const tips = await db.query.negotiationTips.findMany({
        where: and(
          eq(negotiationTips.category, billCategory),
          eq(negotiationTips.isActive, true)
        ),
        orderBy: [desc(negotiationTips.displayOrder)]
      });

      // Enrich the negotiation record with tips and savings potential
      const enrichedNegotiation = await this.enrichNegotiationData(negotiation, tips, bill);

      return enrichedNegotiation;
    } catch (error) {
      console.error('Error getting negotiation recommendations:', error);
      throw error;
    }
  }

  /**
   * Create a new negotiation record for a bill
   */
  async createNegotiationRecord(userId, billId, bill, category) {
    try {
      const marketAverage = this.getMarketAverage(category);
      const estimatedSavings = bill.amount * 0.15; // Default 15% savings estimate
      const estimatedSavingsPercentage = 15;

      const newNegotiation = await db.insert(billNegotiation).values({
        userId,
        billId,
        category,
        currentAmount: bill.amount,
        estimatedSavings,
        estimatedSavingsPercentage,
        annualSavingsPotential: estimatedSavings * 12,
        marketAverage,
        savingsPotential: {
          low: bill.amount * 0.05,
          medium: bill.amount * 0.15,
          high: bill.amount * 0.25
        },
        status: 'pending',
        confidenceScore: 0.6
      }).returning();

      return newNegotiation[0];
    } catch (error) {
      console.error('Error creating negotiation record:', error);
      throw error;
    }
  }

  /**
   * Determine bill category from name and description
   */
  determineBillCategory(billName, description) {
    const text = `${billName} ${description}`.toLowerCase();

    const categoryPatterns = {
      utilities: ['electric', 'electricity', 'power', 'gas', 'water', 'sewage', 'trash', 'utility', 'energy'],
      insurance: ['insurance', 'premium', 'health', 'car', 'auto', 'life', 'dental', 'vision', 'coverage'],
      internet: ['internet', 'broadband', 'isp', 'wifi', 'cable', 'streaming'],
      phone: ['phone', 'mobile', 'wireless', 'carrier', 'cellular'],
      subscription: ['subscription', 'netflix', 'spotify', 'hulu', 'disney', 'membership', 'premium'],
      loan: ['loan', 'mortgage', 'payment', 'credit'],
      services: ['service', 'maintenance', 'cleaning', 'repair'],
      housing: ['rent', 'mortgage', 'hoa'],
      other: []
    };

    for (const [category, keywords] of Object.entries(categoryPatterns)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Get market average for a bill category
   */
  getMarketAverage(category) {
    const marketAverages = {
      utilities: 150,
      insurance: 120,
      internet: 80,
      phone: 60,
      subscription: 30,
      loan: 500,
      services: 100,
      housing: 1200,
      other: 100
    };

    return marketAverages[category] || 100;
  }

  /**
   * Enrich negotiation data with tips and recommendations
   */
  async enrichNegotiationData(negotiation, tips, bill) {
    const enrichedTips = tips.map(tip => ({
      id: tip.id,
      title: tip.title,
      description: tip.description,
      strategy: tip.strategy,
      difficulty: tip.difficulty,
      estimatedSavings: tip.estimatedSavings,
      successRate: tip.successRate,
      implementationTime: tip.implementationTime,
      scriptTemplate: tip.scriptTemplate,
      bestTimeToNegotiate: tip.bestTimeToNegotiate,
      requiredDocuments: tip.requiredDocuments,
      tags: tip.tags
    }));

    // Get recent attempts
    const attempts = await db.query.negotiationAttempts.findMany({
      where: eq(negotiationAttempts.billNegotiationId, negotiation.id),
      orderBy: [desc(negotiationAttempts.attemptDate)],
      limit: 5
    });

    return {
      ...negotiation,
      tips: enrichedTips,
      attempts,
      recommendations: this.generateRecommendations(negotiation, enrichedTips, bill),
      actionItems: this.generateActionItems(negotiation, enrichedTips)
    };
  }

  /**
   * Generate recommendations based on negotiation data
   */
  generateRecommendations(negotiation, tips, bill) {
    const recommendations = [];

    // Recommendation 1: Potential savings
    if (negotiation.estimatedSavings > 0) {
      recommendations.push({
        type: 'savings_potential',
        title: 'Potential Monthly Savings',
        description: `You could potentially save $${negotiation.estimatedSavings.toFixed(2)} per month (${negotiation.estimatedSavingsPercentage}%) on this bill.`,
        priority: 'high',
        action: 'Negotiate with your provider'
      });
    }

    // Recommendation 2: Market comparison
    if (negotiation.marketAverage && bill.amount > negotiation.marketAverage * 1.2) {
      recommendations.push({
        type: 'market_comparison',
        title: 'Above Market Average',
        description: `Your bill is higher than the market average. The average for ${negotiation.category} is $${negotiation.marketAverage.toFixed(2)}.`,
        priority: 'high',
        action: 'Request rate reduction'
      });
    }

    // Recommendation 3: Success strategies
    if (tips.length > 0) {
      const highSuccessTips = tips.filter(t => t.successRate > 0.7);
      if (highSuccessTips.length > 0) {
        recommendations.push({
          type: 'best_strategy',
          title: 'High-Success Negotiation Strategy',
          description: `Try ${highSuccessTips[0].title} - it has a ${(highSuccessTips[0].successRate * 100).toFixed(0)}% success rate.`,
          priority: 'high',
          action: 'Use recommended strategy'
        });
      }
    }

    // Recommendation 4: Attempt frequency
    if (negotiation.attemptCount === 0) {
      recommendations.push({
        type: 'first_attempt',
        title: 'Start Negotiating',
        description: 'You haven\'t attempted to negotiate this bill yet. First attempts often succeed!',
        priority: 'medium',
        action: 'Make your first attempt'
      });
    } else if (negotiation.status === 'unsuccessful' && negotiation.attemptCount < 3) {
      recommendations.push({
        type: 'retry',
        title: 'Try Again',
        description: `You've tried ${negotiation.attemptCount} time(s). Consider trying again or with a different approach.`,
        priority: 'medium',
        action: 'Retry negotiation'
      });
    }

    return recommendations;
  }

  /**
   * Generate action items for the user
   */
  generateActionItems(negotiation, tips) {
    const actionItems = [];

    if (negotiation.status === 'pending') {
      // Suggest easy first steps
      const easyTips = tips.filter(t => t.difficulty === 'easy');
      if (easyTips.length > 0) {
        actionItems.push({
          title: `Start with: ${easyTips[0].title}`,
          description: easyTips[0].description,
          difficulty: 'easy',
          timeEstimate: easyTips[0].implementationTime,
          script: easyTips[0].scriptTemplate
        });
      }

      // Follow-up actions
      if (easyTips.length > 1) {
        actionItems.push({
          title: `Then try: ${tips[1].title}`,
          description: tips[1].description,
          difficulty: tips[1].difficulty,
          timeEstimate: tips[1].implementationTime,
          script: tips[1].scriptTemplate
        });
      }
    }

    return actionItems;
  }

  /**
   * Record a negotiation attempt
   */
  async recordNegotiationAttempt(userId, billNegotiationId, attemptData) {
    try {
      const negotiation = await db.query.billNegotiation.findFirst({
        where: eq(billNegotiation.id, billNegotiationId)
      });

      if (!negotiation || negotiation.userId !== userId) {
        throw new Error('Negotiation record not found');
      }

      const attemptNumber = negotiation.attemptCount + 1;

      // Create the attempt record
      const attempt = await db.insert(negotiationAttempts).values({
        userId,
        billNegotiationId,
        attemptNumber,
        contactMethod: attemptData.contactMethod,
        status: attemptData.status,
        outcomeDescription: attemptData.outcomeDescription,
        amountBefore: negotiation.currentAmount,
        amountAfter: attemptData.amountAfter,
        savings: attemptData.amountAfter ? negotiation.currentAmount - attemptData.amountAfter : null,
        followUpDate: attemptData.followUpDate,
        followUpNotes: attemptData.followUpNotes,
        tipsUsed: attemptData.tipsUsed || [],
        notes: attemptData.notes
      }).returning();

      // Update the negotiation record
      const updates = {
        attemptCount: attemptNumber,
        lastAttemptDate: new Date(),
        status: attemptData.status
      };

      if (attemptData.amountAfter) {
        updates.newAmount = attemptData.amountAfter;
        updates.savingsAchieved = negotiation.currentAmount - attemptData.amountAfter;
      }

      if (attemptData.status === 'successful') {
        updates.status = 'successful';
      }

      await db.update(billNegotiation).set(updates).where(eq(billNegotiation.id, billNegotiationId));

      return attempt[0];
    } catch (error) {
      console.error('Error recording negotiation attempt:', error);
      throw error;
    }
  }

  /**
   * Get negotiation history for a bill
   */
  async getNegotiationHistory(userId, billId) {
    try {
      const negotiation = await db.query.billNegotiation.findFirst({
        where: and(
          eq(billNegotiation.userId, userId),
          eq(billNegotiation.billId, billId)
        ),
        with: {
          attempts: {
            orderBy: [desc(negotiationAttempts.attemptDate)]
          }
        }
      });

      return negotiation;
    } catch (error) {
      console.error('Error getting negotiation history:', error);
      throw error;
    }
  }

  /**
   * Get all negotiable bills for a user
   */
  async getNegotiableBills(userId) {
    try {
      const userBills = await db.query.bills.findMany({
        where: and(
          eq(bills.userId, userId),
          eq(bills.status, 'pending')
        ),
        with: {
          category: true,
          billNegotiations: true
        },
        orderBy: [desc(bills.amount)]
      });

      // Filter and enrich bills with negotiation potential
      const negotiableBills = userBills
        .map(bill => {
          const negotiation = bill.billNegotiations?.[0];
          return {
            ...bill,
            negotiation,
            negotiationPotential: this.calculateNegotiationPotential(bill),
            category: this.determineBillCategory(bill.name, bill.description)
          };
        })
        .sort((a, b) => b.negotiationPotential - a.negotiationPotential);

      return negotiableBills;
    } catch (error) {
      console.error('Error getting negotiable bills:', error);
      throw error;
    }
  }

  /**
   * Calculate negotiation potential score (0-1)
   */
  calculateNegotiationPotential(bill) {
    // Factors: bill amount, frequency, age
    let score = 0.5;

    // Higher bills have more negotiation potential
    if (bill.amount > 100) score += 0.2;
    if (bill.amount > 200) score += 0.1;

    // Recurring bills are easier to negotiate
    if (bill.isRecurring) score += 0.1;

    // Older bills (less negotiated) have more potential
    const billAge = new Date() - new Date(bill.createdAt);
    const monthsOld = billAge / (1000 * 60 * 60 * 24 * 30);
    if (monthsOld > 6) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Initialize default negotiation tips in database
   */
  async initializeDefaultTips() {
    try {
      const existingTips = await db.query.negotiationTips.findMany({
        limit: 1
      });

      if (existingTips.length > 0) {
        console.log('Default tips already initialized');
        return;
      }

      const defaultTips = [
        {
          category: 'utilities',
          title: 'Request Rate Review',
          description: 'Call your utility company and ask for a rate review based on your account history.',
          strategy: 'Politely request your provider review your rates based on loyalty and payment history.',
          difficulty: 'easy',
          estimatedSavings: 10,
          successRate: 0.35,
          implementationTime: 'minutes',
          scriptTemplate: 'Hi, I\'ve been a loyal customer for [X] years. Could you review my account for any available discounts or lower rates?',
          bestTimeToNegotiate: 'mid_month',
          displayOrder: 1
        },
        {
          category: 'utilities',
          title: 'Switch to Budget Billing',
          description: 'Ask about budget billing plans that spread costs evenly throughout the year.',
          strategy: 'Request to switch to a budget billing program for predictable monthly payments.',
          difficulty: 'easy',
          estimatedSavings: 5,
          successRate: 0.8,
          implementationTime: 'minutes',
          scriptTemplate: 'I\'d like to switch to your budget billing plan for more predictable monthly payments.',
          bestTimeToNegotiate: 'anytime',
          displayOrder: 2
        },
        {
          category: 'internet',
          title: 'Call to Cancel',
          description: 'Contact customer retention and mention you\'re considering switching providers.',
          strategy: 'Call the cancellation/retention department and express intention to switch to a competitor.',
          difficulty: 'medium',
          estimatedSavings: 20,
          successRate: 0.65,
          implementationTime: 'minutes',
          scriptTemplate: 'I\'ve been reviewing competitors and they offer better rates. What options do you have to keep my business?',
          bestTimeToNegotiate: 'after_bill_increase',
          displayOrder: 1
        },
        {
          category: 'internet',
          title: 'Downgrade to Lower Plan',
          description: 'Ask if you can downgrade to a lower speed tier that still meets your needs.',
          strategy: 'Negotiate for a lower tier service if your current speed exceeds your actual needs.',
          difficulty: 'easy',
          estimatedSavings: 15,
          successRate: 0.7,
          implementationTime: 'minutes',
          scriptTemplate: 'Do I need the current speed plan, or could I save money by downgrading to a lower tier?',
          bestTimeToNegotiate: 'anytime',
          displayOrder: 2
        },
        {
          category: 'insurance',
          title: 'Bundle Policies',
          description: 'Ask about discounts for bundling multiple insurance policies.',
          strategy: 'Request quotes from competitors and use them to negotiate bundle discounts.',
          difficulty: 'medium',
          estimatedSavings: 15,
          successRate: 0.7,
          implementationTime: 'hours',
          scriptTemplate: 'I\'m shopping around for the best rate. Would bundling my [auto/home] insurance with you provide significant savings?',
          bestTimeToNegotiate: 'renewal_period',
          displayOrder: 1
        },
        {
          category: 'insurance',
          title: 'Increase Deductible',
          description: 'Discuss raising your deductible to lower monthly premiums.',
          strategy: 'Ask about the premium reduction if you increase your deductible amount.',
          difficulty: 'easy',
          estimatedSavings: 20,
          successRate: 0.9,
          implementationTime: 'minutes',
          scriptTemplate: 'What would my monthly premium be if I increased my deductible to $[amount]?',
          bestTimeToNegotiate: 'anytime',
          displayOrder: 2
        },
        {
          category: 'phone',
          title: 'Request Loyalty Discount',
          description: 'Ask for multi-year loyalty discounts on your cell phone plan.',
          strategy: 'Contact customer service and request loyalty discounts based on years of service.',
          difficulty: 'easy',
          estimatedSavings: 10,
          successRate: 0.4,
          implementationTime: 'minutes',
          scriptTemplate: 'I\'ve been with you for [X] years. Are there any loyalty discounts available to reduce my bill?',
          bestTimeToNegotiate: 'anytime',
          displayOrder: 1
        },
        {
          category: 'subscription',
          title: 'Cancel Unused Services',
          description: 'Review and cancel subscriptions you don\'t actively use.',
          strategy: 'Audit all subscriptions and cancel those providing little value.',
          difficulty: 'easy',
          estimatedSavings: 100,
          successRate: 1.0,
          implementationTime: 'minutes',
          scriptTemplate: 'I\'d like to cancel my subscription effective [date].',
          bestTimeToNegotiate: 'anytime',
          displayOrder: 1
        },
        {
          category: 'subscription',
          title: 'Negotiate Annual Billing',
          description: 'Ask for discounts in exchange for committing to annual billing.',
          strategy: 'Request annual plan pricing to get lower overall costs.',
          difficulty: 'easy',
          estimatedSavings: 15,
          successRate: 0.6,
          implementationTime: 'minutes',
          scriptTemplate: 'What discount would I get if I switched to annual billing instead of monthly?',
          bestTimeToNegotiate: 'renewal_period',
          displayOrder: 2
        },
        {
          category: 'loan',
          title: 'Refinance at Lower Rate',
          description: 'Research and apply for refinancing at a lower interest rate.',
          strategy: 'Get quotes from multiple lenders and present them to your current lender to match.',
          difficulty: 'hard',
          estimatedSavings: 30,
          successRate: 0.5,
          implementationTime: 'hours',
          scriptTemplate: 'I\'ve received offers for refinancing at [X]%. Would you be willing to match that rate?',
          bestTimeToNegotiate: 'interest_rate_low',
          displayOrder: 1
        },
        {
          category: 'housing',
          title: 'Negotiate Rent Reduction',
          description: 'Request a rent reduction based on market rates and property conditions.',
          strategy: 'Research comparable properties and present data to landlord.',
          difficulty: 'hard',
          estimatedSavings: 50,
          successRate: 0.3,
          implementationTime: 'hours',
          scriptTemplate: 'Comparable units in the area are renting for [X]. Would you consider adjusting my rent to be more competitive?',
          bestTimeToNegotiate: 'renewal_period',
          displayOrder: 1
        }
      ];

      await db.insert(negotiationTips).values(defaultTips);
      console.log('Default negotiation tips initialized');
    } catch (error) {
      console.error('Error initializing default tips:', error);
    }
  }
}

export default new BillNegotiationService();
