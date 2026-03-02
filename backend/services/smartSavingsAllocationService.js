import db from '../config/db.js';
import { and, eq } from 'drizzle-orm';
import { goals, users } from '../db/schema.js';

class SmartSavingsAllocationService {
  _daysBetween(from, to) {
    const ms = new Date(to).getTime() - new Date(from).getTime();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }

  _toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  _priorityForGoal(goal) {
    const now = new Date();
    const deadline = goal.deadline ? new Date(goal.deadline) : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    const target = this._toNumber(goal.targetAmount, 0);
    const current = this._toNumber(goal.currentAmount, 0);
    const remaining = Math.max(0, target - current);

    const importanceMap = { low: 35, medium: 60, high: 85 };
    const priorityMap = { low: 35, medium: 60, high: 85 };

    const importanceScore = goal.importanceScore
      ? Math.min(100, Math.max(0, this._toNumber(goal.importanceScore) * 10))
      : (importanceMap[goal.priority] || priorityMap[goal.priority] || 55);

    const progressPct = target > 0 ? (current / target) * 100 : 0;
    const progressScore = Math.min(100, progressPct >= 80 ? progressPct * 1.15 : progressPct);

    const daysLeft = this._daysBetween(now, deadline);
    let urgency = 20;
    if (daysLeft <= 7) urgency = 100;
    else if (daysLeft <= 30) urgency = 90;
    else if (daysLeft <= 90) urgency = 75;
    else if (daysLeft <= 180) urgency = 55;
    else if (daysLeft <= 365) urgency = 40;

    const impact = target > 0
      ? Math.min(100, Math.max(15, (remaining / Math.max(target, 1)) * 100))
      : 25;

    const score =
      (urgency * 0.4) +
      (importanceScore * 0.3) +
      (progressScore * 0.2) +
      (impact * 0.1);

    return {
      goalId: goal.id,
      title: goal.title,
      priorityScore: Number(score.toFixed(2)),
      urgency: Number(urgency.toFixed(2)),
      importance: Number(importanceScore.toFixed(2)),
      progress: Number(progressScore.toFixed(2)),
      impact: Number(impact.toFixed(2)),
      targetAmount: target,
      currentAmount: current,
      remainingAmount: remaining,
      daysToDeadline: daysLeft,
      deadline,
      status: goal.status,
      type: goal.type,
      categoryId: goal.categoryId,
    };
  }

  async _activeGoals(userId) {
    return db.query.goals.findMany({
      where: and(eq(goals.userId, userId), eq(goals.status, 'active')),
    });
  }

  async getPrioritizedGoals(userId) {
    const list = await this._activeGoals(userId);
    const prioritized = list.map((goal) => this._priorityForGoal(goal));
    prioritized.sort((a, b) => b.priorityScore - a.priorityScore);

    return {
      totalGoals: prioritized.length,
      generatedAt: new Date(),
      priorities: prioritized,
    };
  }

  async getMonthlySurplus(userId) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const income = this._toNumber(user?.monthlyIncome, 0);
    const expenses = this._toNumber(user?.monthlyExpenses, 0);
    return Math.max(0, income - expenses);
  }

  async recommendAutoAllocation(userId, options = {}) {
    const strategy = options.strategy || 'balanced';
    const providedSurplus = options.monthlySurplus != null ? this._toNumber(options.monthlySurplus, 0) : null;
    const monthlySurplus = providedSurplus != null ? providedSurplus : await this.getMonthlySurplus(userId);

    const prioritized = await this.getPrioritizedGoals(userId);
    const goalsList = prioritized.priorities;

    if (!goalsList.length || monthlySurplus <= 0) {
      return {
        strategy,
        monthlySurplus,
        totalAllocated: 0,
        unallocated: monthlySurplus,
        allocations: [],
      };
    }

    let weights;
    if (strategy === 'deadline') {
      weights = goalsList.map((goal) => 1 / Math.max(goal.daysToDeadline, 1));
    } else if (strategy === 'priority') {
      weights = goalsList.map((goal) => Math.max(goal.priorityScore, 1));
    } else {
      weights = goalsList.map((goal) => Math.max(goal.priorityScore, 1) * 0.7 + (1 / Math.max(goal.daysToDeadline, 1)) * 30);
    }

    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    const rawAllocations = goalsList.map((goal, index) => {
      const amount = weightTotal > 0 ? (monthlySurplus * weights[index]) / weightTotal : 0;
      const capped = Math.min(amount, goal.remainingAmount);
      return {
        goalId: goal.goalId,
        title: goal.title,
        priorityScore: goal.priorityScore,
        recommendedAmount: Number(capped.toFixed(2)),
        projectedMonthsToComplete: capped > 0 ? Math.ceil(goal.remainingAmount / capped) : null,
      };
    });

    const totalAllocated = rawAllocations.reduce((sum, item) => sum + item.recommendedAmount, 0);
    const unallocated = Number((monthlySurplus - totalAllocated).toFixed(2));

    return {
      strategy,
      monthlySurplus,
      totalAllocated: Number(totalAllocated.toFixed(2)),
      unallocated,
      allocations: rawAllocations,
    };
  }

  async detectGoalConflicts(userId) {
    const prioritized = await this.getPrioritizedGoals(userId);
    const goalsList = prioritized.priorities;
    const monthlySurplus = await this.getMonthlySurplus(userId);

    const conflicts = [];

    for (const goal of goalsList) {
      const monthlyRequired = goal.daysToDeadline > 0
        ? (goal.remainingAmount / Math.max(1, Math.ceil(goal.daysToDeadline / 30)))
        : goal.remainingAmount;

      if (monthlyRequired > monthlySurplus && monthlySurplus > 0) {
        conflicts.push({
          type: 'capacity_conflict',
          severity: monthlyRequired > monthlySurplus * 1.5 ? 'high' : 'medium',
          goalId: goal.goalId,
          title: goal.title,
          monthlyRequired: Number(monthlyRequired.toFixed(2)),
          availableMonthlySurplus: Number(monthlySurplus.toFixed(2)),
          gap: Number((monthlyRequired - monthlySurplus).toFixed(2)),
        });
      }
    }

    for (let i = 0; i < goalsList.length; i += 1) {
      for (let j = i + 1; j < goalsList.length; j += 1) {
        const first = goalsList[i];
        const second = goalsList[j];
        const dateGapDays = Math.abs(this._daysBetween(first.deadline, second.deadline));

        if (dateGapDays <= 45 && first.remainingAmount > 0 && second.remainingAmount > 0) {
          conflicts.push({
            type: 'deadline_overlap',
            severity: 'medium',
            goals: [
              { goalId: first.goalId, title: first.title, deadline: first.deadline },
              { goalId: second.goalId, title: second.title, deadline: second.deadline },
            ],
            description: 'Two active goals have very close deadlines and may compete for monthly surplus.',
          });
        }
      }
    }

    return {
      monthlySurplus,
      conflictCount: conflicts.length,
      conflicts,
    };
  }

  async runSavingsScenario(userId, options = {}) {
    const monthlySurplus = options.monthlySurplus != null
      ? this._toNumber(options.monthlySurplus, 0)
      : await this.getMonthlySurplus(userId);

    const monthlyDelta = this._toNumber(options.monthlyDelta, 0);
    const strategy = options.strategy || 'balanced';
    const scenarioSurplus = Math.max(0, monthlySurplus + monthlyDelta);

    const base = await this.recommendAutoAllocation(userId, { monthlySurplus, strategy });
    const scenario = await this.recommendAutoAllocation(userId, { monthlySurplus: scenarioSurplus, strategy });

    return {
      base,
      scenario,
      delta: {
        monthlySurplusChange: Number((scenarioSurplus - monthlySurplus).toFixed(2)),
        allocatedChange: Number((scenario.totalAllocated - base.totalAllocated).toFixed(2)),
      },
    };
  }

  getGoalTemplates() {
    return [
      {
        key: 'emergency_fund',
        title: 'Emergency Fund',
        type: 'savings',
        priority: 'high',
        targetAmountRule: '3-6 months of expenses',
        recommendedTimelineMonths: 12,
      },
      {
        key: 'vacation',
        title: 'Vacation',
        type: 'savings',
        priority: 'medium',
        targetAmountRule: 'Trip budget + 15% buffer',
        recommendedTimelineMonths: 6,
      },
      {
        key: 'home_down_payment',
        title: 'Home Down Payment',
        type: 'savings',
        priority: 'high',
        targetAmountRule: '10-20% of home value',
        recommendedTimelineMonths: 36,
      },
    ];
  }

  async getSmartReminders(userId) {
    const prioritized = await this.getPrioritizedGoals(userId);

    const reminders = prioritized.priorities
      .filter((goal) => goal.daysToDeadline <= 90 || goal.priorityScore >= 75)
      .slice(0, 5)
      .map((goal) => ({
        goalId: goal.goalId,
        title: goal.title,
        type: goal.daysToDeadline <= 30 ? 'deadline_alert' : 'priority_alert',
        message: goal.daysToDeadline <= 30
          ? `Deadline approaching in ${goal.daysToDeadline} days. Consider increasing monthly allocation.`
          : `High-priority goal detected. Maintain consistent contribution this month.`,
      }));

    return {
      count: reminders.length,
      reminders,
      generatedAt: new Date(),
    };
  }
}

export default new SmartSavingsAllocationService();
