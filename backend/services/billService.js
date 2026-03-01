/**
 * Bill Service
 * Handles bill detection, smart scheduling, payment suggestions, and reminder management
 */

import { eq, and, gte, lte, sql, desc, asc } from 'drizzle-orm';
import db from '../config/db.js';
import { bills, expenses, categories, users } from '../db/schema.js';
import notificationService from './notificationService.js';
import forecastingService from './forecastingService.js';

class BillService {
  /**
   * Bill-specific keywords for detection
   */
  getBillKeywords() {
    return [
      // Utilities
      'electric', 'electricity', 'power', 'gas', 'water', 'sewage', 'trash', 'waste',
      'utility', 'utilities', 'energy', 'power company', 'electric company',
      // Housing
      'rent', 'mortgage', 'hoa', 'homeowners association', 'property tax',
      // Insurance
      'insurance', 'premium', 'health insurance', 'car insurance', 'auto insurance',
      'life insurance', 'dental', 'vision', 'home insurance', 'renters insurance',
      // Loans
      'loan', 'student loan', 'car loan', 'personal loan', 'mortgage payment',
      // Services
      'internet', 'cable', 'phone', 'mobile', 'wireless', 'satellite', 'streaming',
      'netflix', 'hulu', 'disney+', 'spotify', 'apple music', 'subscription',
      // Other recurring bills
      'child support', 'alimony', 'tuition', 'school fees', 'gym', 'membership',
      'monthly', 'annual', 'yearly', 'payment', 'due'
    ];
  }

  /**
   * Bill category mapping
   */
  getBillCategories() {
    return {
      utilities: ['electric', 'electricity', 'power', 'gas', 'water', 'sewage', 'trash', 'utility', 'energy'],
      housing: ['rent', 'mortgage', 'hoa', 'property tax', 'homeowners'],
      insurance: ['insurance', 'premium', 'health', 'car', 'auto', 'life', 'dental', 'vision'],
      loans: ['loan', 'student loan', 'car loan', 'personal loan', 'mortgage payment'],
      services: ['internet', 'cable', 'phone', 'mobile', 'wireless', 'satellite', 'streaming'],
      other: []
    };
  }

  /**
   * Detect potential bills from transaction history
   */
  async detectPotentialBills(userId, monthsToAnalyze = 6) {
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

      const potentialBills = [];
      const expenseGroups = this.groupExpensesByDescription(userExpenses);

      for (const [description, billExpenses] of Object.entries(expenseGroups)) {
        const pattern = this.analyzeBillPattern(billExpenses);
        if (pattern.isPotentialBill) {
          // Check if already exists as a bill
          const existingBill = await db.query.bills.findFirst({
            where: and(
              eq(bills.userId, userId),
              eq(bills.name, pattern.billName)
            )
          });

          if (!existingBill) {
            potentialBills.push({
              ...pattern,
              expenseIds: billExpenses.map(e => e.id),
              confidence: this.calculateConfidence(pattern, billExpenses)
            });
          }
        }
      }

      return potentialBills.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      console.error('Error detecting potential bills:', error);
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
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b\d{4}\b/g, '')
      .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '')
      .replace(/\b\d+\.\d{2}\b/g, '') // Remove amounts
      .trim();
  }

  /**
   * Analyze expense pattern to determine if it's a bill
   */
  analyzeBillPattern(expenses) {
    if (expenses.length < 2) return { isPotentialBill: false };

    const amounts = expenses.map(e => parseFloat(e.amount));
    const dates = expenses.map(e => new Date(e.date)).sort((a, b) => a - b);

    // Check amount consistency (within 15% variance - bills can vary more than subscriptions)
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const amountVariance = amounts.every(amt =>
      Math.abs(amt - avgAmount) / avgAmount <= 0.15
    );

    if (!amountVariance) return { isPotentialBill: false };

    // Check for regular intervals
    const intervals = [];
    for (let i = 1; i < dates.length; i++) {
      const diffDays = Math.round((dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }

    const avgInterval = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
    const intervalVariance = intervals.every(int =>
      Math.abs(int - avgInterval) / avgInterval <= 0.35 // 35% variance allowed
    );

    // Determine frequency based on average interval
    let frequency = 'monthly';
    if (avgInterval <= 10) frequency = 'weekly';
    else if (avgInterval <= 20) frequency = 'bi-weekly';
    else if (avgInterval <= 45) frequency = 'monthly';
    else if (avgInterval <= 100) frequency = 'quarterly';
    else if (avgInterval <= 400) frequency = 'yearly';
    else return { isPotentialBill: false };

    // Check if description contains bill keywords
    const description = expenses[0].description.toLowerCase();
    const hasKeywords = this.getBillKeywords().some(keyword =>
      description.includes(keyword)
    );

    // Check category type
    const categoryType = expenses[0].category?.name?.toLowerCase();
    const isBillCategory = ['utilities', 'housing', 'insurance', 'loans'].includes(categoryType);

    const isPotentialBill = (
      intervalVariance &&
      (hasKeywords || isBillCategory)
    );

    if (!isPotentialBill) return { isPotentialBill: false };

    // Extract bill name
    const billName = this.extractBillName(expenses[0].description, categoryType);
    const billCategory = this.categorizeBill(description);

    // Calculate next due date
    const lastDate = dates[dates.length - 1];
    const nextDueDate = this.calculateNextDueDate(lastDate, frequency);

    return {
      isPotentialBill: true,
      billName,
      amount: avgAmount.toString(),
      frequency,
      category: billCategory,
      averageInterval: Math.round(avgInterval),
      transactionCount: expenses.length,
      firstDate: dates[0],
      lastDate: lastDate,
      nextDueDate,
      categoryId: expenses[0].categoryId,
      confidence: this.calculatePatternConfidence(intervals, amounts, hasKeywords, isBillCategory)
    };
  }

  /**
   * Extract bill name from description
   */
  extractBillName(description, categoryType) {
    const keywords = this.getBillKeywords();
    const lowerDesc = description.toLowerCase();

    // Try to find known bill keywords
    for (const keyword of keywords) {
      if (lowerDesc.includes(keyword)) {
        // Map to a friendly name
        if (keyword.includes('electric') || keyword.includes('power')) return 'Electric Bill';
        if (keyword.includes('gas')) return 'Gas Bill';
        if (keyword.includes('water')) return 'Water Bill';
        if (keyword.includes('rent')) return 'Rent';
        if (keyword.includes('mortgage')) return 'Mortgage';
        if (keyword.includes('insurance')) return 'Insurance Premium';
        if (keyword.includes('internet')) return 'Internet Service';
        if (keyword.includes('phone') || keyword.includes('mobile')) return 'Phone Bill';
        if (keyword.includes('loan')) return 'Loan Payment';
        
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
   * Categorize bill based on description
   */
  categorizeBill(description) {
    const lowerDesc = description.toLowerCase();
    const categories = this.getBillCategories();

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Calculate pattern confidence for bills
   */
  calculatePatternConfidence(intervals, amounts, hasKeywords, isBillCategory) {
    let confidence = 0;

    // Interval regularity (0-35 points)
    const avgInterval = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
    const intervalVariance = intervals.reduce((sum, int) =>
      sum + Math.pow(int - avgInterval, 2), 0
    ) / intervals.length;
    const regularityScore = Math.max(0, 35 - (intervalVariance / avgInterval) * 100);
    confidence += regularityScore;

    // Amount consistency (0-25 points)
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const amountVariance = amounts.reduce((sum, amt) =>
      sum + Math.pow(amt - avgAmount, 2), 0
    ) / amounts.length;
    const consistencyScore = Math.max(0, 25 - (amountVariance / avgAmount) * 100);
    confidence += consistencyScore;

    // Transaction count (0-20 points)
    const countScore = Math.min(20, intervals.length * 2);
    confidence += countScore;

    // Keywords bonus (0-10 points)
    if (hasKeywords) confidence += 10;

    // Category bonus (0-10 points)
    if (isBillCategory) confidence += 10;

    return Math.min(100, Math.round(confidence));
  }

  /**
   * Calculate overall confidence for potential bill
   */
  calculateConfidence(pattern, expenses) {
    let confidence = pattern.confidence;

    // Boost confidence for higher transaction counts
    if (expenses.length >= 6) confidence += 10;
    else if (expenses.length >= 3) confidence += 5;

    // Boost for regular intervals
    if (pattern.averageInterval <= 35 && pattern.averageInterval >= 25) confidence += 5; // Monthly

    return Math.min(100, confidence);
  }

  /**
   * Calculate next due date based on last transaction and frequency
   */
  calculateNextDueDate(lastDate, frequency) {
    const date = new Date(lastDate);

    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'bi-weekly':
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
   * Create a bill from detected pattern
   */
  async createBillFromDetection(userId, detectionData) {
    try {
      const billData = {
        userId,
        categoryId: detectionData.categoryId,
        name: detectionData.billName,
        description: `Auto-detected from ${detectionData.transactionCount} transactions`,
        amount: detectionData.amount,
        currency: 'USD',
        frequency: detectionData.frequency,
        dueDate: detectionData.nextDueDate,
        status: 'pending',
        detectedFromExpense: true,
        detectionConfidence: detectionData.confidence,
        sourceExpenseIds: detectionData.expenseIds,
        isRecurring: true,
        smartScheduleEnabled: false,
        reminderDays: 3,
        metadata: {
          lastReminderSent: null,
          reminderCount: 0,
          paymentHistory: [],
          lateFeeAmount: 0,
          gracePeriodDays: 0
        }
      };

      const newBill = await this.createBill(billData);
      return newBill;
    } catch (error) {
      console.error('Error creating bill from detection:', error);
      throw error;
    }
  }

  /**
   * Create a new bill
   */
  async createBill(data) {
    try {
      const {
        userId,
        categoryId,
        name,
        description,
        amount,
        currency = 'USD',
        frequency,
        dueDate,
        status = 'pending',
        autoPay = false,
        paymentMethod = 'other',
        reminderDays = 3,
        smartScheduleEnabled = false,
        payee,
        payeeAccount,
        isRecurring = true,
        endDate,
        tags = [],
        notes,
        detectedFromExpense = false,
        detectionConfidence = 0,
        sourceExpenseIds = [],
        cashFlowAnalysis = { suggestedDate: null, confidence: 0, reason: null }
      } = data;

      const [newBill] = await db
        .insert(bills)
        .values({
          userId,
          categoryId,
          name,
          description,
          amount: amount.toString(),
          currency,
          frequency,
          dueDate: new Date(dueDate),
          status,
          autoPay,
          paymentMethod,
          reminderDays,
          smartScheduleEnabled,
          payee,
          payeeAccount,
          isRecurring,
          endDate: endDate ? new Date(endDate) : null,
          tags,
          notes,
          detectedFromExpense,
          detectionConfidence,
          sourceExpenseIds,
          cashFlowAnalysis,
          metadata: {
            lastReminderSent: null,
            reminderCount: 0,
            paymentHistory: [],
            lateFeeAmount: 0,
            gracePeriodDays: 0
          }
        })
        .returning();

      // Schedule reminder if enabled
      if (newBill) {
        await this.scheduleReminder(newBill);
      }

      return newBill;
    } catch (error) {
      console.error('Error creating bill:', error);
      throw error;
    }
  }

  /**
   * Get bill by ID
   */
  async getBillById(id, userId) {
    try {
      const [bill] = await db.query.bills.findMany({
        where: and(eq(bills.id, id), eq(bills.userId, userId)),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          }
        }
      });
      return bill;
    } catch (error) {
      console.error('Error getting bill:', error);
      throw error;
    }
  }

  /**
   * Get all bills for a user
   */
  async getBills(userId, filters = {}) {
    try {
      const {
        status,
        categoryId,
        sortBy = 'dueDate',
        sortOrder = 'asc',
        limit = 50,
        offset = 0
      } = filters;

      const conditions = [eq(bills.userId, userId)];

      if (status) conditions.push(eq(bills.status, status));
      if (categoryId) conditions.push(eq(bills.categoryId, categoryId));

      const sortFn = sortOrder === 'desc' ? desc : asc;
      let orderByColumn = bills.dueDate;
      if (sortBy === 'amount') orderByColumn = bills.amount;
      if (sortBy === 'name') orderByColumn = bills.name;
      if (sortBy === 'createdAt') orderByColumn = bills.createdAt;

      const result = await db.query.bills.findMany({
        where: and(...conditions),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          }
        },
        orderBy: [sortFn(orderByColumn)],
        limit,
        offset
      });

      return result;
    } catch (error) {
      console.error('Error getting bills:', error);
      throw error;
    }
  }

  /**
   * Get upcoming bills (due within specified days)
   */
  async getUpcomingBills(userId, daysAhead = 30) {
    try {
      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      const upcomingBills = await db.query.bills.findMany({
        where: and(
          eq(bills.userId, userId),
          eq(bills.status, 'pending'),
          gte(bills.dueDate, now),
          lte(bills.dueDate, futureDate)
        ),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          }
        },
        orderBy: [asc(bills.dueDate)]
      });

      return upcomingBills;
    } catch (error) {
      console.error('Error getting upcoming bills:', error);
      throw error;
    }
  }

  /**
   * Update a bill
   */
  async updateBill(id, userId, updates) {
    try {
      const updateData = { ...updates, updatedAt: new Date() };

      if (updateData.amount) {
        updateData.amount = updateData.amount.toString();
      }

      const [updated] = await db
        .update(bills)
        .set(updateData)
        .where(and(eq(bills.id, id), eq(bills.userId, userId)))
        .returning();

      // Reschedule reminder if due date changed
      if (updates.dueDate || updates.reminderDays) {
        await this.scheduleReminder(updated);
      }

      return updated;
    } catch (error) {
      console.error('Error updating bill:', error);
      throw error;
    }
  }

  /**
   * Delete a bill
   */
  async deleteBill(id, userId) {
    try {
      await db
        .delete(bills)
        .where(and(eq(bills.id, id), eq(bills.userId, userId)));
    } catch (error) {
      console.error('Error deleting bill:', error);
      throw error;
    }
  }

  /**
   * Mark bill as paid
   */
  async markBillAsPaid(id, userId, paidDate = new Date()) {
    try {
      const bill = await this.getBillById(id, userId);
      if (!bill) throw new Error('Bill not found');

      // Calculate next due date for recurring bills
      let nextDueDate = null;
      if (bill.isRecurring && bill.frequency !== 'one_time') {
        nextDueDate = this.calculateNextDueDate(paidDate, bill.frequency);
      }

      // Update payment history
      const paymentHistory = bill.metadata?.paymentHistory || [];
      paymentHistory.push({
        paidDate: paidDate.toISOString(),
        amount: bill.amount,
        status: 'paid'
      });

      const [updated] = await db
        .update(bills)
        .set({
          status: nextDueDate ? 'pending' : 'paid',
          dueDate: nextDueDate || bill.dueDate,
          lastPaidDate: paidDate,
          metadata: {
            ...bill.metadata,
            paymentHistory,
            reminderCount: 0
          },
          updatedAt: new Date()
        })
        .where(and(eq(bills.id, id), eq(bills.userId, userId)))
        .returning();

      return updated;
    } catch (error) {
      console.error('Error marking bill as paid:', error);
      throw error;
    }
  }

  /**
   * Schedule payment for a bill
   */
  async schedulePayment(id, userId, scheduledDate) {
    try {
      const [updated] = await db
        .update(bills)
        .set({
          status: 'scheduled',
          scheduledPaymentDate: new Date(scheduledDate),
          updatedAt: new Date()
        })
        .where(and(eq(bills.id, id), eq(bills.userId, userId)))
        .returning();

      // Send confirmation notification
      await notificationService.sendNotification(userId, {
        title: 'Payment Scheduled',
        message: `Payment for ${updated.name} has been scheduled for ${new Date(scheduledDate).toLocaleDateString()}`,
        type: 'info',
        data: { billId: id, scheduledDate }
      });

      return updated;
    } catch (error) {
      console.error('Error scheduling payment:', error);
      throw error;
    }
  }

  /**
   * Get smart payment suggestions based on cash flow
   */
  async getPaymentSuggestions(userId, billId = null) {
    try {
      // Get user's cash flow forecast
      const cashFlowForecast = await forecastingService.generateExpenseForecast(
        userId,
        null,
        'monthly',
        2
      );

      // Get upcoming bills
      const upcomingBills = billId 
        ? [await this.getBillById(billId, userId)]
        : await this.getUpcomingBills(userId, 60);

      const suggestions = [];

      for (const bill of upcomingBills) {
        if (!bill) continue;

        const dueDate = new Date(bill.dueDate);
        const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));

        // Find optimal payment dates from cash flow
        const optimalDates = this.findOptimalPaymentDates(
          cashFlowForecast.predictions,
          bill.amount,
          dueDate,
          daysUntilDue
        );

        suggestions.push({
          billId: bill.id,
          billName: bill.name,
          amount: bill.amount,
          dueDate: bill.dueDate,
          daysUntilDue,
          suggestedPaymentDate: optimalDates.bestDate,
          alternativeDates: optimalDates.alternatives,
          cashFlowStatus: this.assessCashFlowStatus(cashFlowForecast.predictions, bill.amount),
          reasoning: optimalDates.reasoning
        });
      }

      return suggestions;
    } catch (error) {
      console.error('Error getting payment suggestions:', error);
      // Return basic suggestions without cash flow analysis
      const upcomingBills = await this.getUpcomingBills(userId, 30);
      return upcomingBills.map(bill => ({
        billId: bill.id,
        billName: bill.name,
        amount: bill.amount,
        dueDate: bill.dueDate,
        daysUntilDue: Math.ceil((new Date(bill.dueDate) - new Date()) / (1000 * 60 * 60 * 24)),
        suggestedPaymentDate: bill.dueDate,
        alternativeDates: [],
        cashFlowStatus: 'unknown',
        reasoning: 'Cash flow analysis unavailable. Paying on due date is recommended.'
      }));
    }
  }

  /**
   * Find optimal payment dates based on cash flow
   */
  findOptimalPaymentDates(forecastData, billAmount, dueDate, daysUntilDue) {
    if (!forecastData || forecastData.length === 0) {
      return {
        bestDate: dueDate,
        alternatives: [],
        reasoning: 'No forecast data available. Pay on due date.'
      };
    }

    const billAmountNum = parseFloat(billAmount);
    const alternatives = [];
    let bestDate = dueDate;
    let bestScore = -Infinity;
    let reasoning = '';

    // Analyze each forecast period
    for (const forecast of forecastData) {
      const forecastDate = new Date(forecast.date);
      const daysDiff = Math.ceil((forecastDate - dueDate) / (1000 * 60 * 60 * 24));

      // Score based on cash flow availability
      const availableCash = forecast.predictedAmount || 0;
      const cashAfterBill = availableCash - billAmountNum;
      
      let score = 0;
      
      // Prefer dates closer to due date but with sufficient cash
      if (daysDiff <= 0) {
        // Before or on due date - optimal
        score = 100 - Math.abs(daysDiff) * 5;
        if (cashAfterBill < 0) score -= 50; // Penalty for negative cash flow
      } else if (daysDiff <= 7) {
        // Within grace period
        score = 80 - daysDiff * 3;
        if (cashAfterBill < 0) score -= 30;
      } else {
        // Too early
        score = 50 - daysDiff * 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestDate = forecastDate;
        reasoning = cashAfterBill >= 0 
          ? 'Sufficient funds available on this date'
          : 'Warning: May result in negative cash flow';
      }

      // Add to alternatives if score is reasonable
      if (score > 30) {
        alternatives.push({
          date: forecastDate,
          score,
          cashAvailable: availableCash,
          cashAfterBill
        });
      }
    }

    // Sort alternatives by score
    alternatives.sort((a, b) => b.score - a.score);

    return {
      bestDate,
      alternatives: alternatives.slice(0, 3).map(a => a.date),
      reasoning
    };
  }

  /**
   * Assess cash flow status
   */
  assessCashFlowStatus(forecastData, billAmount) {
    if (!forecastData || forecastData.length === 0) return 'unknown';

    const billAmountNum = parseFloat(billAmount);
    
    for (const forecast of forecastData) {
      const availableCash = forecast.predictedAmount || 0;
      if (availableCash >= billAmountNum) {
        return 'healthy';
      }
    }

    return 'tight';
  }

  /**
   * Schedule reminder for a bill
   */
  async scheduleReminder(bill) {
    try {
      const reminderDate = new Date(bill.dueDate);
      reminderDate.setDate(reminderDate.getDate() - bill.reminderDays);

      // Only schedule if reminder date is in the future
      if (reminderDate > new Date()) {
        await notificationService.scheduleNotification({
          userId: bill.userId,
          type: 'bill_reminder',
          title: 'Bill Payment Reminder',
          message: `${bill.name} of $${bill.amount} is due on ${new Date(bill.dueDate).toLocaleDateString()}`,
          scheduledFor: reminderDate,
          data: {
            billId: bill.id,
            billName: bill.name,
            amount: bill.amount,
            dueDate: bill.dueDate
          }
        });
      }
    } catch (error) {
      console.error('Error scheduling reminder:', error);
    }
  }

  /**
   * Get bill analytics
   */
  async getBillAnalytics(userId, period = 'monthly') {
    try {
      const now = new Date();
      let startDate;

      switch (period) {
        case 'weekly':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'quarterly':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        case 'yearly':
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      }

      // Total monthly bill amount
      const [totalResult] = await db
        .select({
          totalMonthly: sql`sum(CASE
            WHEN ${bills.frequency} = 'weekly' THEN ${bills.amount} * 4.33
            WHEN ${bills.frequency} = 'monthly' THEN ${bills.amount}
            WHEN ${bills.frequency} = 'quarterly' THEN ${bills.amount} / 3
            WHEN ${bills.frequency} = 'yearly' THEN ${bills.amount} / 12
            ELSE ${bills.amount}
          END)`,
          totalAnnual: sql`sum(CASE
            WHEN ${bills.frequency} = 'weekly' THEN ${bills.amount} * 52
            WHEN ${bills.frequency} = 'monthly' THEN ${bills.amount} * 12
            WHEN ${bills.frequency} = 'quarterly' THEN ${bills.amount} * 4
            WHEN ${bills.frequency} = 'yearly' THEN ${bills.amount}
            ELSE ${bills.amount} * 12
          END)`,
          count: sql`count(*)`,
          pending: sql`count(CASE WHEN ${bills.status} = 'pending' THEN 1 END)`,
          paid: sql`count(CASE WHEN ${bills.status} = 'paid' THEN 1 END)`,
          overdue: sql`count(CASE WHEN ${bills.status} = 'overdue' THEN 1 END)`
        })
        .from(bills)
        .where(and(
          eq(bills.userId, userId),
          eq(bills.status, 'pending')
        ));

      // By category
      const byCategory = await db
        .select({
          categoryId: bills.categoryId,
          categoryName: categories.name,
          total: sql`sum(${bills.amount})`,
          count: sql`count(*)`
        })
        .from(bills)
        .leftJoin(categories, eq(bills.categoryId, categories.id))
        .where(and(
          eq(bills.userId, userId),
          eq(bills.status, 'pending')
        ))
        .groupBy(bills.categoryId, categories.name)
        .orderBy(desc(sql`sum(${bills.amount})`));

      return {
        summary: {
          totalMonthly: Number(totalResult?.totalMonthly || 0),
          totalAnnual: Number(totalResult?.totalAnnual || 0),
          count: Number(totalResult?.count || 0),
          pending: Number(totalResult?.pending || 0),
          paid: Number(totalResult?.paid || 0),
          overdue: Number(totalResult?.overdue || 0)
        },
        byCategory: byCategory.map(item => ({
          categoryName: item.categoryName || 'Uncategorized',
          total: Number(item.total || 0),
          count: Number(item.count || 0)
        }))
      };
    } catch (error) {
      console.error('Error getting bill analytics:', error);
      throw error;
    }
  }

  /**
   * Process due bills (for cron job)
   */
  async processDueBills() {
    try {
      const now = new Date();

      // Find bills that are overdue
      const overdueBills = await db.query.bills.findMany({
        where: and(
          eq(bills.status, 'pending'),
          lte(bills.dueDate, now)
        )
      });

      for (const bill of overdueBills) {
        try {
          // Update status to overdue
          await db
            .update(bills)
            .set({
              status: 'overdue',
              metadata: {
                ...bill.metadata,
                lateFeeAmount: bill.metadata?.lateFeeAmount || 0
              },
              updatedAt: new Date()
            })
            .where(eq(bills.id, bill.id));

          // Send overdue notification
          await notificationService.sendNotification(bill.userId, {
            title: 'Bill Overdue',
            message: `${bill.name} of $${bill.amount} was due on ${new Date(bill.dueDate).toLocaleDateString()}`,
            type: 'warning',
            data: { billId: bill.id, amount: bill.amount }
          });
        } catch (error) {
          console.error(`Error processing overdue bill ${bill.id}:`, error);
        }
      }

      // Find bills with scheduled payments due today
      const scheduledBills = await db.query.bills.findMany({
        where: and(
          eq(bills.status, 'scheduled'),
          lte(bills.scheduledPaymentDate, now)
        )
      });

      for (const bill of scheduledBills) {
        // Auto-pay if enabled
        if (bill.autoPay) {
          await this.markBillAsPaid(bill.id, bill.userId, now);
        }
      }

      return {
        overdueCount: overdueBills.length,
        scheduledProcessed: scheduledBills.length
      };
    } catch (error) {
      console.error('Error processing due bills:', error);
      throw error;
    }
  }

  /**
   * Send reminders for upcoming bills
   */
  async sendUpcomingBillReminders() {
    try {
      const now = new Date();
      const reminderWindow = new Date();
      reminderWindow.setDate(reminderWindow.getDate() + 3); // 3 days ahead

      // Find bills that need reminders
      const billsToRemind = await db.query.bills.findMany({
        where: and(
          eq(bills.status, 'pending'),
          gte(bills.dueDate, now),
          lte(bills.dueDate, reminderWindow)
        )
      });

      for (const bill of billsToRemind) {
        // Check if reminder was already sent today
        const lastReminder = bill.metadata?.lastReminderSent;
        if (lastReminder) {
          const lastReminderDate = new Date(lastReminder);
          const today = new Date();
          if (lastReminderDate.toDateString() === today.toDateString()) {
            continue; // Skip if reminder already sent today
          }
        }

        // Send reminder
        await notificationService.sendNotification(bill.userId, {
          title: 'Bill Due Soon',
          message: `${bill.name} of $${bill.amount} is due on ${new Date(bill.dueDate).toLocaleDateString()}`,
          type: 'info',
          data: { billId: bill.id, amount: bill.amount, dueDate: bill.dueDate }
        });

        // Update reminder metadata
        await db
          .update(bills)
          .set({
            metadata: {
              ...bill.metadata,
              lastReminderSent: now.toISOString(),
              reminderCount: (bill.metadata?.reminderCount || 0) + 1
            }
          })
          .where(eq(bills.id, bill.id));
      }

      return billsToRemind.length;
    } catch (error) {
      console.error('Error sending bill reminders:', error);
      throw error;
    }
  }
}

export default new BillService();
