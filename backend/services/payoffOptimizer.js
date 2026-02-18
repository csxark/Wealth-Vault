import db from '../config/db.js';
import { debts, payoffStrategies, amortizationSchedules } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import debtEngine from './debtEngine.js';

class PayoffOptimizer {
  /**
   * Generate a multi-debt payoff simulation
   */
  async simulatePayoff(userId, strategyName, monthlyExtra = 0) {
    const userDebts = await db.query.debts.findMany({
      where: and(eq(debts.userId, userId), eq(debts.isActive, true))
    });

    if (userDebts.length === 0) return null;

    let sortedDebts = [...userDebts];

    if (strategyName === 'avalanche') {
      // Highest APR first
      sortedDebts.sort((a, b) => parseFloat(b.apr) - parseFloat(a.apr));
    } else if (strategyName === 'snowball') {
      // Smallest balance first
      sortedDebts.sort((a, b) => parseFloat(a.currentBalance) - parseFloat(b.currentBalance));
    }

    const simulation = [];
    let months = 0;
    let totalInterest = 0;
    let totalPaid = 0;
    let remainingDebts = sortedDebts.map(d => ({
      id: d.id,
      name: d.name,
      balance: parseFloat(d.currentBalance),
      apr: parseFloat(d.apr),
      minPayment: parseFloat(d.minimumPayment)
    }));

    while (remainingDebts.some(d => d.balance > 0) && months < 360) {
      months++;
      let extraAvailable = monthlyExtra;
      let monthlyInterest = 0;
      let monthlyPrincipal = 0;

      // 1. Calculate interest for all and pay minimums
      for (let debt of remainingDebts) {
        if (debt.balance <= 0) continue;

        const interest = parseFloat((debt.balance * (debt.apr / 12)).toFixed(2));
        monthlyInterest += interest;

        let payment = Math.min(debt.balance + interest, debt.minPayment);
        let principal = payment - interest;

        debt.balance -= principal;
        monthlyPrincipal += principal;
        totalPaid += payment;
      }

      // 2. Apply extra payment to the target debt
      for (let debt of remainingDebts) {
        if (debt.balance <= 0) continue;

        let applyExtra = Math.min(debt.balance, extraAvailable);
        debt.balance -= applyExtra;
        monthlyPrincipal += applyExtra;
        totalPaid += applyExtra;
        extraAvailable -= applyExtra;

        if (extraAvailable <= 0) break;
      }

      totalInterest += monthlyInterest;

      simulation.push({
        month: months,
        remainingBalance: parseFloat(remainingDebts.reduce((sum, d) => sum + d.balance, 0).toFixed(2)),
        interestPaid: parseFloat(monthlyInterest.toFixed(2)),
        principalPaid: parseFloat(monthlyPrincipal.toFixed(2))
      });
    }

    return {
      strategy: strategyName,
      totalMonths: months,
      totalInterest: parseFloat(totalInterest.toFixed(2)),
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      simulation,
      payoffOrder: sortedDebts.map(d => d.name)
    };
  }

  /**
   * Save the amortization schedule to the database for a specific strategy
   */
  async saveAmortizationSchedule(userId, debtId, strategyId, schedule) {
    return await db.transaction(async (tx) => {
      // Delete old schedule for this debt/strategy
      await tx.delete(amortizationSchedules)
        .where(and(
          eq(amortizationSchedules.debtId, debtId),
          eq(amortizationSchedules.strategyId, strategyId)
        ));

      // Insert new schedule in chunks
      const chunkSize = 50;
      for (let i = 0; i < schedule.length; i += chunkSize) {
        const chunk = schedule.slice(i, i + chunkSize).map((entry, index) => ({
          debtId,
          strategyId,
          scheduledDate: entry.date,
          paymentNumber: i + index + 1,
          paymentAmount: entry.payment.toString(),
          principalComponent: entry.principal.toString(),
          interestComponent: entry.interest.toString(),
          remainingBalance: entry.balance.toString(),
          isPaid: false
        }));

        await tx.insert(amortizationSchedules).values(chunk);
      }
    });
  }

  /**
   * Get or create active strategy for user
   */
  async getActiveStrategy(userId) {
    let strategy = await db.query.payoffStrategies.findFirst({
      where: and(eq(payoffStrategies.userId, userId), eq(payoffStrategies.isActive, true))
    });

    if (!strategy) {
      const [newStrategy] = await db.insert(payoffStrategies).values({
        userId,
        strategyName: 'avalanche',
        monthlyExtraPayment: '0',
        isActive: true
      }).returning();
      strategy = newStrategy;
    }

    return strategy;
  }

  /**
   * Update user strategy
   */
  async updateStrategy(userId, strategyData) {
    const { strategyName, monthlyExtraPayment, customPriorityOrder } = strategyData;

    return await db.transaction(async (tx) => {
      // Deactivate existing
      await tx.update(payoffStrategies)
        .set({ isActive: false })
        .where(eq(payoffStrategies.userId, userId));

      // Create new
      const [newStrategy] = await tx.insert(payoffStrategies).values({
        userId,
        strategyName,
        monthlyExtraPayment: monthlyExtraPayment?.toString() || '0',
        customPriorityOrder: customPriorityOrder || [],
        isActive: true
      }).returning();

      return newStrategy;
    });
  }

  /**
   * Calculate "Freedom Date" (when total debt becomes zero)
   */
  async calculateFreedomDate(userId) {
    const strategy = await this.getActiveStrategy(userId);
    const result = await this.simulatePayoff(userId, strategy.strategyName, parseFloat(strategy.monthlyExtraPayment));

    if (!result) return null;

    const date = new Date();
    date.setMonth(date.getMonth() + result.totalMonths);
    return date;
  }

  /**
   * Generate Optimal Payoff Strategy (L3)
   * Ranks debts based on interest rate and potential arbitrage alpha.
   */
  async generateStrategy(userId) {
    const userDebts = await db.query.debts.findMany({
      where: and(eq(debts.userId, userId), eq(debts.isActive, true))
    });

    if (userDebts.length === 0) return { recommendedAction: 'NONE', details: 'No active debts found.' };

    const targetROI = 0.08;

    const rankedDebts = await Promise.all(userDebts.map(async (d) => {
      const arbitrage = await debtEngine.calculateArbitrageAlpha(d.id, targetROI);
      return {
        ...d,
        arbitrageAlpha: arbitrage.alpha,
        isGoodDebt: arbitrage.isGoodDebt,
        rankingScore: parseFloat(d.apr)
      };
    }));

    rankedDebts.sort((a, b) => b.rankingScore - a.rankingScore);

    const primaryTarget = rankedDebts[0];
    const details = rankedDebts.map(d => ({
      name: d.name,
      apr: d.apr,
      balance: d.currentBalance,
      recommendation: d.isGoodDebt ? 'HOLD (Invest excess)' : 'AGGRESSIVE PAYOFF'
    }));

    return {
      userId,
      strategyType: 'WACC-Optimized',
      primaryTarget: {
        id: primaryTarget.id,
        name: primaryTarget.name,
        reason: primaryTarget.isGoodDebt ? 'Highest yield but still below ROI threshold' : 'High interest expense'
      },
      rankedDebts: details,
      globalAlpha: rankedDebts.reduce((sum, d) => sum + d.arbitrageAlpha, 0)
    };
  }

  /**
   * Calculate Opportunity Cost (L3)
   * What is the cost of NOT paying off a high-interest debt?
   */
  async calculateOpportunityCost(debtId, monthlyExtra = 500) {
    const debt = await db.query.debts.findFirst({
      where: eq(debts.id, debtId)
    });

    if (!debt) return null;

    const currentMonths = debtEngine.calculateMonthsToPayoff(
      parseFloat(debt.currentBalance),
      parseFloat(debt.apr),
      parseFloat(debt.minimumPayment)
    );

    const optimizedMonths = debtEngine.calculateMonthsToPayoff(
      parseFloat(debt.currentBalance),
      parseFloat(debt.apr),
      parseFloat(debt.minimumPayment) + monthlyExtra
    );

    const totalInterestSaved = (currentMonths - optimizedMonths) * parseFloat(debt.minimumPayment);

    return {
      debtId,
      estimatedMonthsSaved: Math.max(0, currentMonths - optimizedMonths),
      estimatedInterestSaved: Math.max(0, totalInterestSaved),
      roiOnExtraPayment: parseFloat(debt.apr) * 100
    };
  }
}

export default new PayoffOptimizer();
