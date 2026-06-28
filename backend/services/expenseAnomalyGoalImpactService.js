import db from '../config/db.js';
import {
  expenses,
  financialGoals,
  goalFailureAlerts
} from '../db/schema.js';
import { eq, and, gte, lt, inArray, desc } from 'drizzle-orm';
import savingsVelocityOptimizer from './savingsVelocityOptimizer.js';
import multiGoalConflictResolver from './multiGoalConflictResolver.js';
import notificationService from './notificationService.js';

/**
 * Expense Anomaly Goal Impact Detector
 * Detects unusual spending changes and auto-recalculates safe goal allocation.
 */
class ExpenseAnomalyGoalImpactService {
  constructor() {
    this.config = {
      baselineDays: 30,
      anomalyWindowHours: 24,
      minimumAnomalyAmount: 100,
      zScoreThreshold: 2,
      spikeRatioThreshold: 1.75,
      dropRatioThreshold: 0.4
    };
  }

  /**
   * Main entry: detect anomaly and compute goal impact plan.
   */
  async detectAndRecalculate(userId, options = {}) {
    const { notify = true } = options;

    const spending = await this.analyzeSpendingAnomaly(userId);
    if (!spending.isAnomalous) {
      return {
        userId,
        analyzedAt: new Date(),
        isAnomalous: false,
        message: 'No significant spending anomaly detected in the last 24 hours',
        anomalyAlert: null,
        safeAllocationDelta: null,
        updatedGoalTargets: [],
        impactProjections: {
          totalGoalsImpacted: 0,
          highRiskGoals: 0,
          moderateRiskGoals: 0,
          projectedTotalDelayMonths: 0
        },
        userActionRecommendations: [
          {
            action: 'monitor_trend',
            priority: 'low',
            description: 'No immediate changes required. Continue current contribution strategy.'
          }
        ]
      };
    }

    const [income, debt, currentExpenseProfile, goals] = await Promise.all([
      savingsVelocityOptimizer.analyzeIncomeTrajectory(userId),
      savingsVelocityOptimizer.calculateDebtObligations(userId),
      savingsVelocityOptimizer.calculateMonthlyExpenses(userId),
      this.getActiveGoals(userId)
    ]);

    const baseCapacity = savingsVelocityOptimizer.calculateFinancialCapacity({
      income,
      debt,
      expenses: currentExpenseProfile
    });

    const adjustedExpenses = this.buildAnomalyAdjustedExpenseProfile(currentExpenseProfile, spending);

    const adjustedCapacity = savingsVelocityOptimizer.calculateFinancialCapacity({
      income,
      debt,
      expenses: adjustedExpenses
    });

    const capacityDelta = this.calculateSafeAllocationDelta(baseCapacity, adjustedCapacity, spending);

    const goalImpact = await this.calculateGoalImpacts({
      userId,
      goals,
      adjustedCapacity,
      spending,
      capacityDelta
    });

    const userActionRecommendations = this.generateActionRecommendations({
      spending,
      capacityDelta,
      goalImpact
    });

    const result = {
      userId,
      analyzedAt: new Date(),
      isAnomalous: true,
      anomalyAlert: this.buildAnomalyAlert(spending),
      safeAllocationDelta: capacityDelta,
      updatedGoalTargets: goalImpact.updatedGoalTargets,
      impactProjections: goalImpact.impactProjections,
      userActionRecommendations,
      metadata: {
        baseline: {
          averageDailySpend: spending.baselineAverageDaily,
          baselineDays: this.config.baselineDays
        },
        observed: {
          spendLast24h: spending.last24hTotal,
          zScore: spending.zScore,
          changeRatio: spending.changeRatio
        },
        capacity: {
          previousSafeAllocation: baseCapacity.safeCapacity,
          newSafeAllocation: adjustedCapacity.safeCapacity,
          previousTargetAllocation: baseCapacity.targetCapacity,
          newTargetAllocation: adjustedCapacity.targetCapacity
        }
      }
    };

    if (notify) {
      await this.createAndSendImpactAlerts(userId, result);
    }

    return result;
  }

  /**
   * Detect spending anomaly in the last 24h against prior 30-day baseline.
   */
  async analyzeSpendingAnomaly(userId) {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.anomalyWindowHours * 60 * 60 * 1000);
    const baselineStart = new Date(now.getTime() - (this.config.baselineDays + 1) * 24 * 60 * 60 * 1000);

    const records = await db
      .select()
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.date, baselineStart),
          lt(expenses.date, now)
        )
      );

    const last24hExpenses = records.filter(e => new Date(e.date) >= windowStart);
    const baselineRecords = records.filter(e => new Date(e.date) < windowStart);

    const last24hTotal = this.sumAmounts(last24hExpenses);
    const baselineDailyTotals = this.buildDailyTotals(baselineRecords, this.config.baselineDays);

    const baselineAverageDaily = baselineDailyTotals.length > 0
      ? baselineDailyTotals.reduce((sum, value) => sum + value, 0) / baselineDailyTotals.length
      : 0;

    const baselineStdDev = this.standardDeviation(baselineDailyTotals, baselineAverageDaily);

    const zScore = baselineStdDev > 0
      ? (last24hTotal - baselineAverageDaily) / baselineStdDev
      : (last24hTotal > baselineAverageDaily ? 3 : 0);

    const changeRatio = baselineAverageDaily > 0
      ? last24hTotal / baselineAverageDaily
      : (last24hTotal > 0 ? 2 : 1);

    const absoluteDelta = last24hTotal - baselineAverageDaily;

    const isSpike = (
      last24hTotal >= this.config.minimumAnomalyAmount &&
      (
        zScore >= this.config.zScoreThreshold ||
        changeRatio >= this.config.spikeRatioThreshold
      )
    );

    const isDrop = (
      baselineAverageDaily >= this.config.minimumAnomalyAmount &&
      changeRatio <= this.config.dropRatioThreshold
    );

    const anomalyType = isSpike ? 'spike' : isDrop ? 'drop' : 'none';
    const isAnomalous = anomalyType !== 'none';

    return {
      isAnomalous,
      anomalyType,
      last24hTotal,
      baselineAverageDaily,
      baselineStdDev,
      zScore,
      changeRatio,
      absoluteDelta,
      severity: this.classifySeverity(zScore, changeRatio, absoluteDelta, anomalyType),
      anomalyDrivers: this.extractAnomalyDrivers(last24hExpenses, baselineAverageDaily)
    };
  }

  classifySeverity(zScore, changeRatio, absoluteDelta, anomalyType) {
    if (anomalyType === 'drop') {
      if (changeRatio <= 0.2) return 'high';
      if (changeRatio <= 0.3) return 'medium';
      return 'low';
    }

    if (zScore >= 3 || changeRatio >= 2.5 || absoluteDelta >= 500) return 'critical';
    if (zScore >= 2.5 || changeRatio >= 2.0 || absoluteDelta >= 300) return 'high';
    if (zScore >= 2 || changeRatio >= 1.75 || absoluteDelta >= 150) return 'medium';
    return 'low';
  }

  extractAnomalyDrivers(last24hExpenses, baselineAverageDaily) {
    if (last24hExpenses.length === 0) {
      return [];
    }

    const byCategory = {};
    for (const expense of last24hExpenses) {
      const key = expense.categoryId || 'uncategorized';
      if (!byCategory[key]) byCategory[key] = 0;
      byCategory[key] += parseFloat(expense.amount || 0);
    }

    return Object.entries(byCategory)
      .map(([categoryId, total]) => ({
        categoryId,
        amount: total,
        shareOf24hSpend: baselineAverageDaily > 0 ? (total / Math.max(1, this.sumObjectValues(byCategory))) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
  }

  buildAnomalyAdjustedExpenseProfile(currentExpenseProfile, spending) {
    const baseMonthly = parseFloat(currentExpenseProfile.monthlyExpenses || 0);

    const anomalyDailyDelta = spending.last24hTotal - spending.baselineAverageDaily;

    const persistenceFactor = spending.severity === 'critical'
      ? 0.85
      : spending.severity === 'high'
        ? 0.7
        : spending.severity === 'medium'
          ? 0.55
          : 0.4;

    const projectedMonthlyDelta = anomalyDailyDelta * 30 * persistenceFactor;

    const adjustedMonthly = Math.max(0, baseMonthly + projectedMonthlyDelta);

    return {
      ...currentExpenseProfile,
      monthlyExpenses: adjustedMonthly,
      anomalyAdjusted: true,
      anomalyProjectedMonthlyDelta: projectedMonthlyDelta,
      persistenceFactor
    };
  }

  calculateSafeAllocationDelta(baseCapacity, adjustedCapacity, spending) {
    const previousSafe = parseFloat(baseCapacity.safeCapacity || 0);
    const newSafe = parseFloat(adjustedCapacity.safeCapacity || 0);
    const safeDelta = newSafe - previousSafe;

    const previousTarget = parseFloat(baseCapacity.targetCapacity || 0);
    const newTarget = parseFloat(adjustedCapacity.targetCapacity || 0);

    return {
      anomalyType: spending.anomalyType,
      previousSafeAllocation: previousSafe,
      newSafeAllocation: newSafe,
      safeAllocationDelta: safeDelta,
      safeAllocationDeltaPercent: previousSafe > 0 ? (safeDelta / previousSafe) * 100 : 0,
      previousTargetAllocation: previousTarget,
      newTargetAllocation: newTarget,
      targetAllocationDelta: newTarget - previousTarget,
      impactDirection: safeDelta < 0 ? 'reduced_capacity' : safeDelta > 0 ? 'increased_capacity' : 'neutral'
    };
  }

  async calculateGoalImpacts({ userId, goals, adjustedCapacity, spending, capacityDelta }) {
    if (!goals.length) {
      return {
        updatedGoalTargets: [],
        impactProjections: {
          totalGoalsImpacted: 0,
          highRiskGoals: 0,
          moderateRiskGoals: 0,
          projectedTotalDelayMonths: 0
        }
      };
    }

    const scoredGoals = await Promise.all(
      goals.map(goal => multiGoalConflictResolver.scoreGoal(goal, userId, adjustedCapacity))
    );

    const conflicts = multiGoalConflictResolver.detectConflicts(scoredGoals, adjustedCapacity);
    const rankedGoals = multiGoalConflictResolver.rankGoals(scoredGoals);
    const allocation = multiGoalConflictResolver.generateAllocation(rankedGoals, adjustedCapacity, conflicts);

    const updatedGoalTargets = allocation.allocations.map(item => {
      const riskLevel = this.classifyGoalRisk(item);
      return {
        goalId: item.goalId,
        goalName: item.goalName,
        rank: item.rank,
        tier: item.tier,
        requiredMonthlyContribution: item.requiredMonthly,
        recommendedMonthlyContribution: item.allocatedMonthly,
        contributionDelta: item.allocatedMonthly - item.requiredMonthly,
        allocationPercentage: item.allocationPercentage,
        originalDeadlineAtRisk: !item.impact.meetsOriginalDeadline,
        projectedCompletionDate: item.impact.projectedCompletion,
        projectedDelayMonths: item.impact.delayMonths,
        completionConfidence: item.impact.completionConfidence,
        riskLevel,
        adjustmentReason: this.buildGoalAdjustmentReason(spending, capacityDelta, item)
      };
    });

    const highRiskGoals = updatedGoalTargets.filter(g => g.riskLevel === 'high').length;
    const moderateRiskGoals = updatedGoalTargets.filter(g => g.riskLevel === 'medium').length;
    const totalDelayMonths = updatedGoalTargets.reduce((sum, goal) => sum + (goal.projectedDelayMonths || 0), 0);

    return {
      updatedGoalTargets,
      impactProjections: {
        totalGoalsImpacted: updatedGoalTargets.length,
        highRiskGoals,
        moderateRiskGoals,
        projectedTotalDelayMonths: totalDelayMonths,
        conflictCount: conflicts.conflictCount,
        utilizationRate: allocation.utilizationRate
      }
    };
  }

  classifyGoalRisk(goalAllocation) {
    if (goalAllocation.allocationPercentage < 40 || goalAllocation.impact.delayMonths > 6) {
      return 'high';
    }
    if (goalAllocation.allocationPercentage < 75 || goalAllocation.impact.delayMonths > 2) {
      return 'medium';
    }
    return 'low';
  }

  buildGoalAdjustmentReason(spending, capacityDelta, allocation) {
    const reasons = [];

    if (spending.anomalyType === 'spike') {
      reasons.push(`Spending spike detected (+${Math.round(spending.changeRatio * 100 - 100)}% vs baseline)`);
    } else if (spending.anomalyType === 'drop') {
      reasons.push('Unusually low spending detected; allocation updated conservatively');
    }

    if (capacityDelta.safeAllocationDelta < 0) {
      reasons.push(`Safe monthly allocation reduced by ${Math.abs(Math.round(capacityDelta.safeAllocationDelta))}`);
    } else if (capacityDelta.safeAllocationDelta > 0) {
      reasons.push(`Safe monthly allocation increased by ${Math.round(capacityDelta.safeAllocationDelta)}`);
    }

    reasons.push(`Goal tier ${allocation.tier} with ${Math.round(allocation.allocationPercentage)}% funding coverage`);

    return reasons;
  }

  buildAnomalyAlert(spending) {
    const direction = spending.anomalyType === 'spike' ? 'increased' : 'decreased';

    return {
      type: `expense_${spending.anomalyType}`,
      severity: spending.severity,
      title: `Expense anomaly detected: spending ${direction} sharply`,
      message: `Last 24h spending is ${spending.last24hTotal.toFixed(2)} vs baseline ${spending.baselineAverageDaily.toFixed(2)} (${((spending.changeRatio - 1) * 100).toFixed(1)}%).`,
      detectedAt: new Date(),
      metrics: {
        spendLast24h: spending.last24hTotal,
        baselineDailySpend: spending.baselineAverageDaily,
        zScore: spending.zScore,
        changeRatio: spending.changeRatio,
        absoluteDelta: spending.absoluteDelta
      },
      drivers: spending.anomalyDrivers
    };
  }

  generateActionRecommendations({ spending, capacityDelta, goalImpact }) {
    const recommendations = [];

    if (capacityDelta.safeAllocationDelta < 0) {
      recommendations.push({
        action: 'reduce_non_essential_spend',
        priority: 'high',
        description: 'Temporarily reduce discretionary spending categories for the next 2-4 weeks.',
        expectedImpact: `Recover up to ${Math.round(Math.abs(capacityDelta.safeAllocationDelta) * 0.5)} monthly allocation capacity`
      });
    }

    if (goalImpact.impactProjections.highRiskGoals > 0) {
      recommendations.push({
        action: 'reforecast_high_risk_goals',
        priority: 'high',
        description: 'Reforecast deadlines for high-risk goals to avoid repeated misses.',
        expectedImpact: `${goalImpact.impactProjections.highRiskGoals} goals may need timeline adjustments`
      });
    }

    if (spending.severity === 'critical' || spending.severity === 'high') {
      recommendations.push({
        action: 'activate_budget_guardrails',
        priority: 'high',
        description: 'Enable tighter category budgets and anomaly alerts for critical categories.',
        expectedImpact: 'Limits additional variance while maintaining essential obligations'
      });
    }

    recommendations.push({
      action: 'review_allocation_in_7_days',
      priority: 'medium',
      description: 'Re-run anomaly impact detection in 7 days to confirm whether changes persist.',
      expectedImpact: 'Prevents overreaction to one-off events and supports adaptive planning'
    });

    return recommendations;
  }

  async createAndSendImpactAlerts(userId, analysis) {
    if (!analysis?.updatedGoalTargets?.length) return [];

    const now = new Date();
    const alertsCreated = [];

    for (const goalImpact of analysis.updatedGoalTargets) {
      if (goalImpact.riskLevel === 'low') continue;

      const shouldSkip = await this.hasRecentAlert(goalImpact.goalId, userId);
      if (shouldSkip) continue;

      const title = `⚠️ Expense Anomaly Impact: ${goalImpact.goalName}`;
      const message = `Recent spending anomaly changed your safe allocation. ${goalImpact.goalName} is now ${goalImpact.originalDeadlineAtRisk ? 'at risk of delay' : 'partially impacted'}.`;

      const [alert] = await db
        .insert(goalFailureAlerts)
        .values({
          goalId: goalImpact.goalId,
          userId,
          alertType: 'expense_anomaly_goal_impact',
          severity: goalImpact.riskLevel === 'high' ? 'high' : 'medium',
          title,
          message,
          recoveryActions: analysis.userActionRecommendations,
          triggerData: {
            anomalyAlert: analysis.anomalyAlert,
            safeAllocationDelta: analysis.safeAllocationDelta,
            goalImpact
          },
          sentVia: ['in-app', 'push'],
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          createdAt: now
        })
        .returning();

      alertsCreated.push(alert);

      await notificationService.sendNotification(userId, {
        title,
        message,
        type: 'alert',
        data: {
          alertType: 'expense_anomaly_goal_impact',
          alertId: alert.id,
          goalId: goalImpact.goalId,
          riskLevel: goalImpact.riskLevel
        }
      });
    }

    return alertsCreated;
  }

  async hasRecentAlert(goalId, userId) {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recent = await db
      .select()
      .from(goalFailureAlerts)
      .where(
        and(
          eq(goalFailureAlerts.goalId, goalId),
          eq(goalFailureAlerts.userId, userId),
          eq(goalFailureAlerts.alertType, 'expense_anomaly_goal_impact'),
          gte(goalFailureAlerts.createdAt, last24h)
        )
      )
      .limit(1);

    return recent.length > 0;
  }

  async getImpactAlerts({ userId, goalId, unreadOnly = false, limit = 20, offset = 0 }) {
    const conditions = [
      eq(goalFailureAlerts.userId, userId),
      eq(goalFailureAlerts.alertType, 'expense_anomaly_goal_impact')
    ];

    if (goalId) {
      conditions.push(eq(goalFailureAlerts.goalId, goalId));
    }

    if (unreadOnly) {
      conditions.push(eq(goalFailureAlerts.isRead, false));
    }

    return db
      .select()
      .from(goalFailureAlerts)
      .where(and(...conditions))
      .orderBy(desc(goalFailureAlerts.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async markAlertRead(alertId, userId) {
    const [updated] = await db
      .update(goalFailureAlerts)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(goalFailureAlerts.id, alertId),
          eq(goalFailureAlerts.userId, userId),
          eq(goalFailureAlerts.alertType, 'expense_anomaly_goal_impact')
        )
      )
      .returning();

    return updated;
  }

  async getActiveGoals(userId) {
    return db
      .select()
      .from(financialGoals)
      .where(
        and(
          eq(financialGoals.userId, userId),
          inArray(financialGoals.status, ['active', 'planning', 'in_progress'])
        )
      );
  }

  sumAmounts(records) {
    return records.reduce((sum, row) => sum + parseFloat(row.amount || 0), 0);
  }

  buildDailyTotals(records, expectedDays) {
    const grouped = {};

    for (const row of records) {
      const dateKey = new Date(row.date).toISOString().split('T')[0];
      if (!grouped[dateKey]) grouped[dateKey] = 0;
      grouped[dateKey] += parseFloat(row.amount || 0);
    }

    const totals = Object.values(grouped);

    while (totals.length < expectedDays) {
      totals.push(0);
    }

    return totals;
  }

  standardDeviation(values, mean) {
    if (!values.length) return 0;
    const variance = values.reduce((acc, value) => acc + ((value - mean) ** 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  sumObjectValues(obj) {
    return Object.values(obj).reduce((sum, value) => sum + value, 0);
  }
}

export default new ExpenseAnomalyGoalImpactService();
