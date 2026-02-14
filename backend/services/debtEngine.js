import db from '../config/db.js';
import { debts, debtPayments, users } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

class DebtEngine {
  /**
   * Calculate monthly payment for an amortizing loan
   * PMT = [P * r * (1+r)^n] / [(1+r)^n - 1]
   */
  calculateMonthlyPayment(principal, annualRate, termMonths) {
    if (annualRate === 0) return principal / termMonths;
    const r = annualRate / 12;
    const n = termMonths;
    const payment = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    return parseFloat(payment.toFixed(2));
  }

  /**
   * Calculate how many months to pay off a balance with a fixed payment
   * n = -log(1 - (r * P) / pmt) / log(1 + r)
   */
  calculateMonthsToPayoff(balance, annualRate, monthlyPayment) {
    if (balance <= 0) return 0;
    const r = annualRate / 12;
    if (r === 0) return Math.ceil(balance / monthlyPayment);

    // If interest is greater than payment, it will never be paid off
    if (balance * r >= monthlyPayment) return Infinity;

    const n = -Math.log(1 - (r * balance) / monthlyPayment) / Math.log(1 + r);
    return Math.ceil(n);
  }

  /**
   * Generate amortization schedule for a single loan
   */
  generateAmortizationSchedule(balance, annualRate, monthlyPayment, startDate = new Date()) {
    const schedule = [];
    const r = annualRate / 12;
    let remaining = balance;
    let date = new Date(startDate);

    while (remaining > 0 && schedule.length < 600) { // Limit to 50 years
      const interest = remaining * r;
      let principal = monthlyPayment - interest;

      if (principal >= remaining) {
        principal = remaining;
        remaining = 0;
      } else {
        remaining -= principal;
      }

      date = new Date(date);
      date.setMonth(date.getMonth() + 1);

      schedule.push({
        date: new Date(date),
        payment: parseFloat((principal + interest).toFixed(2)),
        principal: parseFloat(principal.toFixed(2)),
        interest: parseFloat(interest.toFixed(2)),
        balance: parseFloat(remaining.toFixed(2))
      });
    }

    return schedule;
  }

  /**
   * Calculate total interest paid given a monthly payment
   */
  calculateTotalInterest(balance, annualRate, monthlyPayment) {
    const schedule = this.generateAmortizationSchedule(balance, annualRate, monthlyPayment);
    return schedule.reduce((sum, item) => sum + item.interest, 0);
  }

  /**
   * Get user's debt summary
   */
  async getDebtSummary(userId) {
    const userDebts = await db.query.debts.findMany({
      where: and(eq(debts.userId, userId), eq(debts.isActive, true))
    });

    if (userDebts.length === 0) {
      return {
        totalDebt: 0,
        totalMonthlyMinimum: 0,
        weightedAverageAPR: 0,
        debtCount: 0
      };
    }

    const totalDebt = userDebts.reduce((sum, d) => sum + parseFloat(d.currentBalance), 0);
    const totalMin = userDebts.reduce((sum, d) => sum + parseFloat(d.minimumPayment), 0);

    let weightedAPRSum = 0;
    userDebts.forEach(d => {
      weightedAPRSum += (parseFloat(d.currentBalance) / totalDebt) * parseFloat(d.apr);
    });

    return {
      totalDebt: parseFloat(totalDebt.toFixed(2)),
      totalMonthlyMinimum: parseFloat(totalMin.toFixed(2)),
      weightedAverageAPR: parseFloat(weightedAPRSum.toFixed(4)),
      debtCount: userDebts.length
    };
  }

  /**
   * Record a payment and update the debt balance
   */
  async recordPayment(userId, debtId, amount, paymentDate = new Date()) {
    const debt = await db.query.debts.findFirst({
      where: and(eq(debts.id, debtId), eq(debts.userId, userId))
    });

    if (!debt) throw new Error('Debt not found');

    const r = parseFloat(debt.apr) / 12;
    const interest = parseFloat(debt.currentBalance) * r;
    const principal = amount - interest;

    const newBalance = Math.max(0, parseFloat(debt.currentBalance) - principal);

    return await db.transaction(async (tx) => {
      // Create payment record
      const [payment] = await tx.insert(debtPayments).values({
        debtId,
        userId,
        paymentAmount: amount.toString(),
        paymentDate,
        principalPayment: principal.toString(),
        interestPayment: interest.toString()
      }).returning();

      // Update debt balance
      await tx.update(debts)
        .set({
          currentBalance: newBalance.toString(),
          updatedAt: new Date()
        })
        .where(eq(debts.id, debtId));

      return payment;
    });
  }
  /**
   * Recalculate and update the amortization projection for a debt
   */
  async calculateAmortization(debtId) {
    const debt = await db.query.debts.findFirst({
      where: eq(debts.id, debtId)
    });

    if (!debt) return;

    // Projected payoff date based on current balance and minimum payment
    const months = this.calculateMonthsToPayoff(
      parseFloat(debt.currentBalance),
      parseFloat(debt.apr),
      parseFloat(debt.minimumPayment)
    );

    const payoffDate = new Date();
    payoffDate.setMonth(payoffDate.getMonth() + months);

    await db.update(debts)
      .set({
        payoffDate: payoffDate,
        updatedAt: new Date(),
        metadata: {
          ...debt.metadata,
          estimatedMonthsToPayoff: months,
          lastAmortizationUpdate: new Date()
        }
      })
      .where(eq(debts.id, debtId));
  }
}

export default new DebtEngine();
