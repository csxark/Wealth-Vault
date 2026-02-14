/**
 * Debt Service
 * Handles debt management, payoff strategies (snowball/avalanche), and timeline projections
 */

import { eq, and, desc, asc, sql } from 'drizzle-orm';
import db from '../config/db.js';
import { debts, debtPayments, categories } from '../db/schema.js';
import notificationService from './notificationService.js';

class DebtService {
  /**
   * Create a new debt
   */
  async createDebt(data) {
    try {
      const {
        userId,
        categoryId,
        name,
        description,
        type,
        lender,
        originalBalance,
        currentBalance,
        interestRate,
        minimumPayment,
        dueDate,
        startDate,
        isPriority,
        currency = 'USD',
        accountNumber,
        notes,
        tags = [],
        metadata = {}
      } = data;

      // Calculate estimated payoff date
      const estimatedPayoffDate = this.calculateEstimatedPayoffDate(
        currentBalance,
        interestRate,
        minimumPayment
      );

      const [newDebt] = await db
        .insert(debts)
        .values({
          userId,
          categoryId,
          name,
          description,
          type,
          lender,
          originalBalance: originalBalance.toString(),
          currentBalance: currentBalance.toString(),
          interestRate,
          minimumPayment: minimumPayment.toString(),
          dueDate: dueDate ? new Date(dueDate) : null,
          startDate: startDate ? new Date(startDate) : new Date(),
          estimatedPayoffDate,
          isPriority: isPriority || false,
          status: 'active',
          currency,
          accountNumber,
          notes,
          tags,
          metadata: {
            totalPaid: 0,
            totalInterestPaid: 0,
            paymentCount: 0,
            lastPaymentDate: null,
            interestCompounding: 'monthly',
            autopayEnabled: false,
            ...metadata
          }
        })
        .returning();

      return newDebt;
    } catch (error) {
      console.error('Error creating debt:', error);
      throw error;
    }
  }

  /**
   * Get all debts for a user
   */
  async getDebts(userId, filters = {}) {
    try {
      const { status, type, sortBy = 'currentBalance', sortOrder = 'desc' } = filters;

      const conditions = [eq(debts.userId, userId)];

      if (status) conditions.push(eq(debts.status, status));
      if (type) conditions.push(eq(debts.type, type));

      const sortFn = sortOrder === 'asc' ? asc : desc;
      let orderByColumn = debts.currentBalance;
      if (sortBy === 'interestRate') orderByColumn = debts.interestRate;
      if (sortBy === 'name') orderByColumn = debts.name;
      if (sortBy === 'dueDate') orderByColumn = debts.dueDate;
      if (sortBy === 'createdAt') orderByColumn = debts.createdAt;

      const result = await db.query.debts.findMany({
        where: and(...conditions),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          },
          payments: {
            orderBy: [desc(debtPayments.paymentDate)],
            limit: 5
          }
        },
        orderBy: [sortFn(orderByColumn)]
      });

      return result;
    } catch (error) {
      console.error('Error getting debts:', error);
      throw error;
    }
  }

  /**
   * Get debt by ID
   */
  async getDebtById(id, userId) {
    try {
      const [debt] = await db.query.debts.findMany({
        where: and(eq(debts.id, id), eq(debts.userId, userId)),
        with: {
          category: {
            columns: { name: true, color: true, icon: true }
          },
          payments: {
            orderBy: [desc(debtPayments.paymentDate)]
          }
        }
      });

      return debt;
    } catch (error) {
      console.error('Error getting debt:', error);
      throw error;
    }
  }

  /**
   * Update a debt
   */
  async updateDebt(id, userId, updates) {
    try {
      const updateData = { ...updates, updatedAt: new Date() };

      // Remove fields that shouldn't be updated directly
      delete updateData.id;
      delete updateData.userId;
      delete updateData.createdAt;
      delete updateData.payments;

      // Recalculate payoff date if balance or payment changed
      if (updates.currentBalance || updates.interestRate || updates.minimumPayment) {
        const debt = await this.getDebtById(id, userId);
        const newBalance = updates.currentBalance || debt.currentBalance;
        const newRate = updates.interestRate || debt.interestRate;
        const newPayment = updates.minimumPayment || debt.minimumPayment;
        updateData.estimatedPayoffDate = this.calculateEstimatedPayoffDate(
          newBalance,
          newRate,
          newPayment
        );
      }

      if (updateData.currentBalance) {
        updateData.currentBalance = updateData.currentBalance.toString();
      }
      if (updateData.originalBalance) {
        updateData.originalBalance = updateData.originalBalance.toString();
      }
      if (updateData.minimumPayment) {
        updateData.minimumPayment = updateData.minimumPayment.toString();
      }

      const [updated] = await db
        .update(debts)
        .set(updateData)
        .where(and(eq(debts.id, id), eq(debts.userId, userId)))
        .returning();

      return updated;
    } catch (error) {
      console.error('Error updating debt:', error);
      throw error;
    }
  }

  /**
   * Delete a debt
   */
  async deleteDebt(id, userId) {
    try {
      await db
        .delete(debts)
        .where(and(eq(debts.id, id), eq(debts.userId, userId)));
    } catch (error) {
      console.error('Error deleting debt:', error);
      throw error;
    }
  }

  /**
   * Record a payment on a debt
   */
  async recordPayment(debtId, userId, paymentData) {
    try {
      const {
        amount,
        paymentDate = new Date(),
        paymentMethod = 'other',
        isExtraPayment = false,
        notes,
        principalAmount,
        interestAmount
      } = paymentData;

      const debt = await this.getDebtById(debtId, userId);
      if (!debt) throw new Error('Debt not found');

      const balanceBefore = parseFloat(debt.currentBalance);
      const paymentAmount = parseFloat(amount);

      // Calculate principal and interest portions if not provided
      let principal = principalAmount;
      let interest = interestAmount;

      if (!principal || !interest) {
        // Simple monthly interest calculation
        const monthlyRate = debt.interestRate / 100 / 12;
        interest = balanceBefore * monthlyRate;
        principal = paymentAmount - interest;
      }

      const newBalance = Math.max(0, balanceBefore - principal);

      // Create payment record
      const [payment] = await db
        .insert(debtPayments)
        .values({
          debtId,
          userId,
          amount: amount.toString(),
          principalAmount: principal.toString(),
          interestAmount: interest.toString(),
          paymentDate: new Date(paymentDate),
          paymentMethod,
          isExtraPayment,
          notes,
          metadata: {
            balanceBefore: balanceBefore.toString(),
            balanceAfter: newBalance.toString(),
            confirmationNumber: null
          }
        })
        .returning();

      // Update debt balance and metadata
      const totalPaid = (debt.metadata?.totalPaid || 0) + paymentAmount;
      const totalInterestPaid = (debt.metadata?.totalInterestPaid || 0) + interest;
      const paymentCount = (debt.metadata?.paymentCount || 0) + 1;

      const [updatedDebt] = await db
        .update(debts)
        .set({
          currentBalance: newBalance.toString(),
          status: newBalance <= 0 ? 'paid_off' : 'active',
          estimatedPayoffDate: newBalance > 0 
            ? this.calculateEstimatedPayoffDate(newBalance, debt.interestRate, debt.minimumPayment)
            : null,
          updatedAt: new Date(),
          metadata: {
            ...debt.metadata,
            totalPaid,
            totalInterestPaid,
            paymentCount,
            lastPaymentDate: paymentDate.toISOString()
          }
        })
        .where(and(eq(debts.id, debtId), eq(debts.userId, userId)))
        .returning();

      // Send notification if debt is paid off
      if (newBalance <= 0) {
        await notificationService.sendNotification(userId, {
          title: 'Debt Paid Off! 🎉',
          message: `Congratulations! You've paid off ${debt.name}. Total paid: $${totalPaid.toFixed(2)}`,
          type: 'success',
          data: { debtId, totalPaid }
        });
      }

      return { payment, debt: updatedDebt };
    } catch (error) {
      console.error('Error recording payment:', error);
      throw error;
    }
  }

  /**
   * Get payoff strategies comparison
   */
  async getPayoffStrategies(userId, extraPaymentAmount = 0) {
    try {
      const userDebts = await this.getDebts(userId, { status: 'active' });
      
      if (userDebts.length === 0) {
        return null;
      }

      const snowball = this.calculateSnowballStrategy(userDebts, extraPaymentAmount);
      const avalanche = this.calculateAvalancheStrategy(userDebts, extraPaymentAmount);

      return {
        snowball,
        avalanche,
        recommendation: this.generateRecommendation(snowball, avalanche),
        comparison: {
          interestSavings: avalanche.totalInterest - snowball.totalInterest,
          timeDifference: snowball.monthsToPayoff - avalanche.monthsToPayoff,
          fasterMethod: avalanche.monthsToPayoff <= snowball.monthsToPayoff ? 'avalanche' : 'snowball'
        }
      };
    } catch (error) {
      console.error('Error calculating payoff strategies:', error);
      throw error;
    }
  }

  /**
   * Calculate snowball strategy (smallest balance first)
   */
  calculateSnowballStrategy(debts, extraPaymentAmount = 0) {
    // Sort by current balance (smallest first)
    const sortedDebts = [...debts].sort((a, b) => 
      parseFloat(a.currentBalance) - parseFloat(b.currentBalance)
    );

    return this.simulatePayoff(sortedDebts, extraPaymentAmount, 'snowball');
  }

  /**
   * Calculate avalanche strategy (highest interest first)
   */
  calculateAvalancheStrategy(debts, extraPaymentAmount = 0) {
    // Sort by interest rate (highest first)
    const sortedDebts = [...debts].sort((a, b) => 
      b.interestRate - a.interestRate
    );

    return this.simulatePayoff(sortedDebts, extraPaymentAmount, 'avalanche');
  }

  /**
   * Simulate payoff timeline
   */
  simulatePayoff(debts, extraPaymentAmount, strategyName) {
    const simulation = [];
    let month = 0;
    let totalInterest = 0;
    let totalPayments = 0;
    let remainingDebts = debts.map(d => ({
      ...d,
      balance: parseFloat(d.currentBalance),
      minPayment: parseFloat(d.minimumPayment),
      rate: d.interestRate / 100 / 12 // Monthly rate
    })).filter(d => d.balance > 0);

    const payoffOrder = [];

    while (remainingDebts.length > 0 && month < 600) { // Max 50 years
      month++;
      let monthInterest = 0;
      let monthPayments = 0;
      let availableExtra = extraPaymentAmount;

      // Calculate interest for all debts
      remainingDebts.forEach(debt => {
        const interest = debt.balance * debt.rate;
        debt.balance += interest;
        monthInterest += interest;
      });

      // Pay minimums on all debts
      remainingDebts.forEach(debt => {
        const payment = Math.min(debt.minPayment, debt.balance);
        debt.balance -= payment;
        monthPayments += payment;
      });

      // Apply extra payment to first debt (target debt)
      if (remainingDebts.length > 0 && availableExtra > 0) {
        const targetDebt = remainingDebts[0];
        const extraPayment = Math.min(availableExtra, targetDebt.balance);
        targetDebt.balance -= extraPayment;
        monthPayments += extraPayment;
      }

      // Check for paid off debts
      remainingDebts = remainingDebts.filter(debt => {
        if (debt.balance <= 0.01) {
          payoffOrder.push({
            debtId: debt.id,
            name: debt.name,
            paidOffMonth: month,
            totalPaid: parseFloat(debt.originalBalance)
          });
          return false;
        }
        return true;
      });

      totalInterest += monthInterest;
      totalPayments += monthPayments;

      simulation.push({
        month,
        totalBalance: remainingDebts.reduce((sum, d) => sum + d.balance, 0),
        totalInterest,
        payments: monthPayments
      });
    }

    const payoffDate = new Date();
    payoffDate.setMonth(payoffDate.getMonth() + month);

    return {
      strategy: strategyName,
      monthsToPayoff: month,
      payoffDate: payoffDate.toISOString(),
      totalInterest,
      totalPayments,
      payoffOrder,
      simulation: simulation.filter((_, i) => i % 6 === 0 || i === simulation.length - 1), // Every 6 months
      monthlyPayment: debts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0) + extraPaymentAmount
    };
  }

  /**
   * Generate recommendation based on strategies
   */
  generateRecommendation(snowball, avalanche) {
    const interestDiff = snowball.totalInterest - avalanche.totalInterest;
    const monthDiff = snowball.monthsToPayoff - avalanche.monthsToPayoff;

    if (monthDiff <= 3 && interestDiff > 500) {
      return {
        method: 'avalanche',
        reason: `Save $${interestDiff.toFixed(0)} in interest with only ${monthDiff} months difference`,
        confidence: 'high'
      };
    } else if (monthDiff > 6 && snowball.monthsToPayoff <= 12) {
      return {
        method: 'snowball',
        reason: 'Quick wins with small debts will keep you motivated',
        confidence: 'high'
      };
    } else if (interestDiff > 1000) {
      return {
        method: 'avalanche',
        reason: `Significant interest savings of $${interestDiff.toFixed(0)}`,
        confidence: 'medium'
      };
    } else {
      return {
        method: 'snowball',
        reason: 'Psychological wins from paying off small debts first',
        confidence: 'medium'
      };
    }
  }

  /**
   * Calculate estimated payoff date for a single debt
   */
  calculateEstimatedPayoffDate(balance, annualRate, monthlyPayment) {
    const monthlyRate = annualRate / 100 / 12;
    const principal = parseFloat(balance);
    const payment = parseFloat(monthlyPayment);

    if (principal <= 0) return null;
    if (payment <= 0) return null;
    if (monthlyRate === 0) {
      const months = Math.ceil(principal / payment);
      const date = new Date();
      date.setMonth(date.getMonth() + months);
      return date;
    }

    // Formula: n = -log(1 - (P * r) / p) / log(1 + r)
    const months = -Math.log(1 - (principal * monthlyRate) / payment) / Math.log(1 + monthlyRate);
    
    if (!isFinite(months) || months < 0) return null;

    const payoffDate = new Date();
    payoffDate.setMonth(payoffDate.getMonth() + Math.ceil(months));
    return payoffDate;
  }

  /**
   * Get debt analytics
   */
  async getDebtAnalytics(userId) {
    try {
      const userDebts = await this.getDebts(userId);

      const totalOriginal = userDebts.reduce((sum, d) => sum + parseFloat(d.originalBalance), 0);
      const totalCurrent = userDebts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
      const totalPaid = userDebts.reduce((sum, d) => sum + (d.metadata?.totalPaid || 0), 0);
      const totalInterest = userDebts.reduce((sum, d) => sum + (d.metadata?.totalInterestPaid || 0), 0);
      const totalMinPayments = userDebts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);

      const activeDebts = userDebts.filter(d => d.status === 'active');
      const paidOffDebts = userDebts.filter(d => d.status === 'paid_off');

      // Weighted average interest rate
      const weightedRate = activeDebts.reduce((sum, d) => {
        const weight = parseFloat(d.currentBalance) / totalCurrent;
        return sum + (d.interestRate * weight);
      }, 0);

      // By type breakdown
      const byType = {};
      userDebts.forEach(debt => {
        if (!byType[debt.type]) {
          byType[debt.type] = { count: 0, balance: 0, original: 0 };
        }
        byType[debt.type].count++;
        byType[debt.type].balance += parseFloat(debt.currentBalance);
        byType[debt.type].original += parseFloat(debt.originalBalance);
      });

      return {
        summary: {
          totalDebts: userDebts.length,
          activeDebts: activeDebts.length,
          paidOffDebts: paidOffDebts.length,
          totalOriginalBalance: totalOriginal,
          totalCurrentBalance: totalCurrent,
          totalPaid,
          totalInterestPaid: totalInterest,
          progressPercentage: totalOriginal > 0 ? ((totalOriginal - totalCurrent) / totalOriginal * 100) : 0,
          averageInterestRate: weightedRate,
          totalMonthlyPayments: totalMinPayments
        },
        byType: Object.entries(byType).map(([type, data]) => ({
          type,
          ...data,
          progress: data.original > 0 ? ((data.original - data.balance) / data.original * 100) : 0
        })),
        recentPayments: await this.getRecentPayments(userId, 10)
      };
    } catch (error) {
      console.error('Error getting debt analytics:', error);
      throw error;
    }
  }

  /**
   * Get recent payments across all debts
   */
  async getRecentPayments(userId, limit = 10) {
    try {
      const payments = await db.query.debtPayments.findMany({
        where: eq(debtPayments.userId, userId),
        with: {
          debt: {
            columns: { name: true, type: true, color: true }
          }
        },
        orderBy: [desc(debtPayments.paymentDate)],
        limit
      });

      return payments;
    } catch (error) {
      console.error('Error getting recent payments:', error);
      throw error;
    }
  }

  /**
   * Get payment history for a specific debt
   */
  async getPaymentHistory(debtId, userId) {
    try {
      const payments = await db.query.debtPayments.findMany({
        where: and(eq(debtPayments.debtId, debtId), eq(debtPayments.userId, userId)),
        orderBy: [desc(debtPayments.paymentDate)]
      });

      return payments;
    } catch (error) {
      console.error('Error getting payment history:', error);
      throw error;
    }
  }
}

export default new DebtService();
