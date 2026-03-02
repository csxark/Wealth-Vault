import db from '../config/db.js';
import { financialGoals } from '../db/schema.js';
import { and, eq, inArray } from 'drizzle-orm';
import savingsVelocityOptimizer from './savingsVelocityOptimizer.js';
import multiGoalConflictResolver from './multiGoalConflictResolver.js';

/**
 * Income Volatility Adaptive Goal Planner
 * Builds monthly adaptive contribution bands (floor/target/ceiling)
 * based on latest income variance and goal priority.
 */
class IncomeVolatilityAdaptivePlannerService {
  async generateAdaptivePlans(userId) {
    const [goals, income, debt, expenses] = await Promise.all([
      this.getActiveGoals(userId),
      savingsVelocityOptimizer.analyzeIncomeTrajectory(userId),
      savingsVelocityOptimizer.calculateDebtObligations(userId),
      savingsVelocityOptimizer.calculateMonthlyExpenses(userId)
    ]);

    if (!goals.length) {
      return {
        userId,
        generatedAt: new Date(),
        monthlyCycle: this.getMonthlyCycle(),
        volatilityProfile: this.buildVolatilityProfile(income),
        adaptiveCapacity: null,
        plans: [],
        summary: {
          totalGoals: 0,
          feasibleAtFloor: 0,
          feasibleAtTarget: 0,
          feasibleAtCeiling: 0
        }
      };
    }

    const baselineCapacity = savingsVelocityOptimizer.calculateFinancialCapacity({
      income,
      debt,
      expenses
    });

    const volatilityProfile = this.buildVolatilityProfile(income);
    const adaptiveCapacity = this.buildAdaptiveCapacity(baselineCapacity, volatilityProfile);

    const scoredGoals = await Promise.all(
      goals.map(goal => multiGoalConflictResolver.scoreGoal(goal, userId, baselineCapacity))
    );
    const rankedGoals = multiGoalConflictResolver.rankGoals(scoredGoals);

    const floorAllocation = this.allocateByCapacity(rankedGoals, adaptiveCapacity.floorCapacity);
    const targetAllocation = this.allocateByCapacity(rankedGoals, adaptiveCapacity.targetCapacity);
    const ceilingAllocation = this.allocateByCapacity(rankedGoals, adaptiveCapacity.ceilingCapacity);

    const plans = rankedGoals.map(goal => {
      const floor = this.getGoalAllocation(floorAllocation, goal.goalId);
      const target = this.getGoalAllocation(targetAllocation, goal.goalId);
      const ceiling = this.getGoalAllocation(ceilingAllocation, goal.goalId);

      const forecasts = this.buildForecasts(goal, { floor, target, ceiling });
      const rolloverRules = this.buildRolloverRules(goal, { floor, target, ceiling }, volatilityProfile);

      return {
        goalId: goal.goalId,
        goalName: goal.goalName,
        rank: goal.rank,
        tier: goal.tier,
        urgencyScore: goal.scores.urgency,
        requiredMonthlyContribution: goal.requiredMonthly,
        contributionBands: {
          floor: this.roundMoney(floor),
          target: this.roundMoney(target),
          ceiling: this.roundMoney(ceiling)
        },
        volatilityAdjustedCompletionForecasts: forecasts,
        rolloverRules,
        recommendation: this.recommendBand(goal, forecasts, volatilityProfile)
      };
    });

    return {
      userId,
      generatedAt: new Date(),
      monthlyCycle: this.getMonthlyCycle(),
      volatilityProfile,
      adaptiveCapacity,
      plans,
      summary: this.buildSummary(plans)
    };
  }

  async generateSingleGoalPlan(userId, goalId) {
    const allPlans = await this.generateAdaptivePlans(userId);
    const goalPlan = allPlans.plans.find(plan => plan.goalId === goalId);

    if (!goalPlan) {
      return null;
    }

    return {
      ...allPlans,
      plans: [goalPlan],
      summary: {
        ...allPlans.summary,
        totalGoals: 1
      }
    };
  }

  buildVolatilityProfile(income) {
    const volatility = income.volatility || 0;

    let band = 'stable';
    let bandScore = 1;

    if (volatility >= 0.5) {
      band = 'extreme';
      bandScore = 4;
    } else if (volatility >= 0.35) {
      band = 'high';
      bandScore = 3;
    } else if (volatility >= 0.2) {
      band = 'moderate';
      bandScore = 2;
    }

    const trendAdjustment = income.trend?.direction === 'declining'
      ? -0.1
      : income.trend?.direction === 'improving'
        ? 0.05
        : 0;

    return {
      volatility,
      band,
      bandScore,
      trend: income.trend,
      projectedNextMonthIncome: income.projectedNextMonth,
      averageIncome: income.avgMonthlyIncome,
      currentIncome: income.currentMonthIncome,
      confidencePenalty: this.getConfidencePenalty(band) + trendAdjustment
    };
  }

  buildAdaptiveCapacity(baselineCapacity, volatilityProfile) {
    const safe = baselineCapacity.safeCapacity;
    const target = baselineCapacity.targetCapacity;
    const aggressive = baselineCapacity.aggressiveCapacity;

    const multipliers = this.getBandMultipliers(volatilityProfile.band);

    const floorCapacity = Math.max(0, safe * multipliers.floor);
    const targetCapacity = Math.max(0, Math.min(aggressive, target * multipliers.target));
    const ceilingCapacity = Math.max(0, aggressive * multipliers.ceiling);

    return {
      baselineSafeCapacity: safe,
      baselineTargetCapacity: target,
      baselineAggressiveCapacity: aggressive,
      floorCapacity,
      targetCapacity,
      ceilingCapacity,
      multipliers
    };
  }

  getBandMultipliers(volatilityBand) {
    if (volatilityBand === 'extreme') {
      return { floor: 0.55, target: 0.75, ceiling: 0.95 };
    }
    if (volatilityBand === 'high') {
      return { floor: 0.65, target: 0.85, ceiling: 1.0 };
    }
    if (volatilityBand === 'moderate') {
      return { floor: 0.75, target: 0.95, ceiling: 1.05 };
    }
    return { floor: 0.85, target: 1.0, ceiling: 1.1 };
  }

  getConfidencePenalty(volatilityBand) {
    if (volatilityBand === 'extreme') return 0.35;
    if (volatilityBand === 'high') return 0.25;
    if (volatilityBand === 'moderate') return 0.15;
    return 0.05;
  }

  allocateByCapacity(rankedGoals, capacity) {
    if (!rankedGoals.length) return [];

    const totalRequired = rankedGoals.reduce((sum, goal) => sum + goal.requiredMonthly, 0);

    if (totalRequired <= capacity) {
      return rankedGoals.map(goal => ({
        goalId: goal.goalId,
        allocated: goal.requiredMonthly
      }));
    }

    const weighted = rankedGoals.map(goal => {
      const urgencyBoost = goal.scores.urgency >= 70 ? 1.25 : goal.scores.urgency >= 50 ? 1.1 : 1;
      const tierWeight = goal.tier === 'high' ? 1.35 : goal.tier === 'medium' ? 1 : 0.7;
      const weight = Math.max(0.1, goal.scores.composite / 100) * urgencyBoost * tierWeight;

      return { goal, weight };
    });

    const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);

    const allocations = weighted.map(item => {
      const proportional = totalWeight > 0 ? (capacity * item.weight) / totalWeight : 0;
      const capped = Math.min(proportional, item.goal.requiredMonthly);

      return {
        goalId: item.goal.goalId,
        allocated: Math.max(0, capped)
      };
    });

    let allocatedTotal = allocations.reduce((sum, item) => sum + item.allocated, 0);
    let remaining = Math.max(0, capacity - allocatedTotal);

    if (remaining > 0) {
      for (const item of allocations) {
        if (remaining <= 0) break;
        const goal = rankedGoals.find(goalEntry => goalEntry.goalId === item.goalId);
        const room = Math.max(0, goal.requiredMonthly - item.allocated);
        const topUp = Math.min(room, remaining);
        item.allocated += topUp;
        remaining -= topUp;
      }
    }

    return allocations;
  }

  getGoalAllocation(allocation, goalId) {
    const found = allocation.find(item => item.goalId === goalId);
    return found ? found.allocated : 0;
  }

  buildForecasts(goal, bands) {
    const remaining = Math.max(0, goal.remainingAmount);
    const today = new Date();
    const deadline = new Date(goal.targetDate);
    const monthsToDeadline = Math.max(1, Math.ceil((deadline - today) / (1000 * 60 * 60 * 24 * 30)));

    return {
      floor: this.forecastByBand(remaining, bands.floor, monthsToDeadline),
      target: this.forecastByBand(remaining, bands.target, monthsToDeadline),
      ceiling: this.forecastByBand(remaining, bands.ceiling, monthsToDeadline)
    };
  }

  forecastByBand(remainingAmount, monthlyContribution, monthsToDeadline) {
    const monthsToComplete = monthlyContribution > 0
      ? Math.ceil(remainingAmount / monthlyContribution)
      : 999;

    const projectedCompletionDate = this.addMonths(new Date(), monthsToComplete);
    const delayMonths = Math.max(0, monthsToComplete - monthsToDeadline);

    return {
      monthlyContribution: this.roundMoney(monthlyContribution),
      projectedCompletionDate,
      monthsToComplete,
      meetsDeadline: delayMonths === 0,
      delayMonths
    };
  }

  buildRolloverRules(goal, bands, volatilityProfile) {
    const monthlyShortfallAtFloor = Math.max(0, goal.requiredMonthly - bands.floor);

    const rolloverCapMonths = volatilityProfile.band === 'extreme'
      ? 2
      : volatilityProfile.band === 'high'
        ? 3
        : 4;

    const autoStepUpPct = volatilityProfile.band === 'extreme'
      ? 0.25
      : volatilityProfile.band === 'high'
        ? 0.2
        : 0.15;

    return {
      trigger: 'when_actual_contribution_below_floor',
      policy: {
        carryForwardShortfall: true,
        shortfallFormula: 'shortfall = floor - actual_contribution',
        applyToNextMonths: true,
        rolloverCapMonths,
        maxMonthlyCatchup: this.roundMoney(Math.max(0, bands.ceiling - bands.target)),
        monthlyShortfallAtFloor: this.roundMoney(monthlyShortfallAtFloor)
      },
      adaptiveRule: {
        ifIncomeRecoversAboveAverage: `increase contribution by ${Math.round(autoStepUpPct * 100)}% of rolled shortfall`,
        ifIncomeDeclinesFurther: 'freeze catch-up and preserve floor band only',
        ifMissedForConsecutiveMonths: 'recommend deadline reforecast after 2 missed months'
      }
    };
  }

  recommendBand(goal, forecasts, volatilityProfile) {
    if (volatilityProfile.band === 'extreme' || volatilityProfile.band === 'high') {
      return {
        selectedBand: forecasts.target.meetsDeadline ? 'target' : 'floor',
        reason: 'Income volatility is elevated; prioritize survivability and controlled catch-up.'
      };
    }

    if (goal.scores.urgency >= 70 && forecasts.ceiling.meetsDeadline) {
      return {
        selectedBand: 'ceiling',
        reason: 'High urgency goal with feasible acceleration capacity.'
      };
    }

    return {
      selectedBand: 'target',
      reason: 'Balanced monthly contribution for stable progress.'
    };
  }

  buildSummary(plans) {
    const feasibleAtFloor = plans.filter(plan => plan.volatilityAdjustedCompletionForecasts.floor.meetsDeadline).length;
    const feasibleAtTarget = plans.filter(plan => plan.volatilityAdjustedCompletionForecasts.target.meetsDeadline).length;
    const feasibleAtCeiling = plans.filter(plan => plan.volatilityAdjustedCompletionForecasts.ceiling.meetsDeadline).length;

    return {
      totalGoals: plans.length,
      feasibleAtFloor,
      feasibleAtTarget,
      feasibleAtCeiling,
      goalsRequiringRolloverSupport: plans.filter(plan => plan.rolloverRules.policy.monthlyShortfallAtFloor > 0).length
    };
  }

  getMonthlyCycle() {
    const now = new Date();
    const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
      cycleMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      cycleStart,
      cycleEnd,
      recommendationRefresh: 'monthly_or_when_income_variance_changes'
    };
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

  addMonths(date, months) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  roundMoney(value) {
    return Math.round((value || 0) * 100) / 100;
  }
}

export default new IncomeVolatilityAdaptivePlannerService();
