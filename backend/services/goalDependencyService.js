import db from '../config/db.js';
import { and, eq } from 'drizzle-orm';
import { goals } from '../db/schema.js';

/**
 * Goal Dependency Service - Issue #708
 * Manages goal dependencies and funding sequence enforcement
 * (e.g., emergency fund thresholds before vacation/investment goals)
 */
class GoalDependencyService {
  constructor() {
    // Predefined dependency rules by goal type
    this.DEPENDENCY_RULES = {
      // Emergency fund must reach threshold before discretionary goals
      emergency_fund: {
        requiredProgressPercent: 50, // At least 50% funded
        blockingGoalTypes: [], // Not blocked by anything
        priority: 100, // Highest priority
      },
      essential_savings: {
        requiredProgressPercent: 30,
        blockingGoalTypes: [],
        priority: 90,
      },
      debt_repayment: {
        requiredProgressPercent: 0,
        blockingGoalTypes: [],
        priority: 85,
      },
      retirement: {
        requiredProgressPercent: 0,
        blockingGoalTypes: ['emergency_fund'], // Requires emergency fund at threshold
        dependencyThreshold: 50, // Emergency fund needs 50%+ progress
        priority: 70,
      },
      home_purchase: {
        requiredProgressPercent: 0,
        blockingGoalTypes: ['emergency_fund'],
        dependencyThreshold: 50,
        priority: 65,
      },
      education: {
        requiredProgressPercent: 0,
        blockingGoalTypes: ['emergency_fund'],
        dependencyThreshold: 40,
        priority: 60,
      },
      investment: {
        requiredProgressPercent: 0,
        blockingGoalTypes: ['emergency_fund', 'debt_repayment'],
        dependencyThreshold: 50,
        priority: 55,
      },
      vacation: {
        requiredProgressPercent: 0,
        blockingGoalTypes: ['emergency_fund'],
        dependencyThreshold: 70, // Stricter: emergency fund needs 70%+
        priority: 40,
      },
      luxury_purchase: {
        requiredProgressPercent: 0,
        blockingGoalTypes: ['emergency_fund', 'essential_savings'],
        dependencyThreshold: 80,
        priority: 30,
      },
      savings: {
        requiredProgressPercent: 0,
        blockingGoalTypes: [],
        priority: 50, // Default/generic savings
      },
    };
  }

  _toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  _normalizeGoalType(type) {
    if (!type) return 'savings';
    const normalized = type.toLowerCase().replace(/[-\s]/g, '_');
    return this.DEPENDENCY_RULES[normalized] ? normalized : 'savings';
  }

  /**
   * Calculate progress percentage for a goal
   */
  _calculateProgress(goal) {
    const target = this._toNumber(goal.targetAmount, 1);
    const current = this._toNumber(goal.currentAmount, 0);
    return target > 0 ? (current / target) * 100 : 0;
  }

  /**
   * Check if a blocking goal meets the required threshold
   */
  async _checkBlockingGoal(userId, blockingGoalType, requiredThreshold) {
    const blockingGoals = await db.query.goals.findMany({
      where: and(eq(goals.userId, userId), eq(goals.status, 'active')),
    });

    const relevantBlockers = blockingGoals.filter(
      (g) => this._normalizeGoalType(g.type) === blockingGoalType
    );

    if (!relevantBlockers.length) {
      return {
        isSatisfied: false,
        reason: `No active ${blockingGoalType.replace(/_/g, ' ')} goal found`,
        progress: 0,
        requiredProgress: requiredThreshold,
      };
    }

    // Check if ANY of the blocking goals meets the threshold
    for (const blocker of relevantBlockers) {
      const progress = this._calculateProgress(blocker);
      if (progress >= requiredThreshold) {
        return {
          isSatisfied: true,
          reason: `${blocker.title} is at ${progress.toFixed(1)}% (threshold: ${requiredThreshold}%)`,
          progress: Number(progress.toFixed(2)),
          requiredProgress: requiredThreshold,
          blockingGoalId: blocker.id,
          blockingGoalTitle: blocker.title,
        };
      }
    }

    // No blocker met threshold
    const maxProgress = Math.max(...relevantBlockers.map((g) => this._calculateProgress(g)));
    const blockerWithMaxProgress = relevantBlockers.find(
      (g) => this._calculateProgress(g) === maxProgress
    );

    return {
      isSatisfied: false,
      reason: `${blockingGoalType.replace(/_/g, ' ')} needs ${requiredThreshold}% progress (currently ${maxProgress.toFixed(1)}%)`,
      progress: Number(maxProgress.toFixed(2)),
      requiredProgress: requiredThreshold,
      blockingGoalId: blockerWithMaxProgress?.id,
      blockingGoalTitle: blockerWithMaxProgress?.title,
    };
  }

  /**
   * Evaluate if a goal is unlocked based on dependency rules
   */
  async evaluateGoalDependencies(userId, goal) {
    const normalizedType = this._normalizeGoalType(goal.type);
    const rules = this.DEPENDENCY_RULES[normalizedType];

    if (!rules || !rules.blockingGoalTypes || rules.blockingGoalTypes.length === 0) {
      return {
        isUnlocked: true,
        goal: {
          id: goal.id,
          title: goal.title,
          type: goal.type,
        },
        dependencies: [],
        blockingReasons: [],
      };
    }

    const dependencyChecks = await Promise.all(
      rules.blockingGoalTypes.map((blockingType) =>
        this._checkBlockingGoal(userId, blockingType, rules.dependencyThreshold || 50)
      )
    );

    const unsatisfiedDependencies = dependencyChecks.filter((check) => !check.isSatisfied);
    const isUnlocked = unsatisfiedDependencies.length === 0;

    return {
      isUnlocked,
      goal: {
        id: goal.id,
        title: goal.title,
        type: goal.type,
        normalizedType,
      },
      dependencies: dependencyChecks,
      blockingReasons: unsatisfiedDependencies.map((d) => d.reason),
      requiredActions: unsatisfiedDependencies.map((d) => ({
        action: `Increase ${d.blockingGoalTitle || 'blocking goal'} to ${d.requiredProgress}% progress`,
        currentProgress: d.progress,
        requiredProgress: d.requiredProgress,
        gap: Number((d.requiredProgress - d.progress).toFixed(2)),
      })),
    };
  }

  /**
   * Get dependency status for all active goals
   */
  async getDependencyStatusForAllGoals(userId) {
    const userGoals = await db.query.goals.findMany({
      where: and(eq(goals.userId, userId), eq(goals.status, 'active')),
    });

    const statuses = await Promise.all(
      userGoals.map((goal) => this.evaluateGoalDependencies(userId, goal))
    );

    const locked = statuses.filter((s) => !s.isUnlocked);
    const unlocked = statuses.filter((s) => s.isUnlocked);

    return {
      userId,
      totalGoals: userGoals.length,
      unlockedGoals: unlocked.length,
      lockedGoals: locked.length,
      goals: statuses,
      fundingSequence: this._generateFundingSequence(userGoals, statuses),
    };
  }

  /**
   * Generate ordered funding sequence respecting dependencies and priorities
   */
  _generateFundingSequence(goals, dependencyStatuses) {
    const statusById = new Map(dependencyStatuses.map((s) => [s.goal.id, s]));

    const sorted = goals
      .map((goal) => {
        const status = statusById.get(goal.id);
        const normalizedType = this._normalizeGoalType(goal.type);
        const rules = this.DEPENDENCY_RULES[normalizedType];

        return {
          goalId: goal.id,
          title: goal.title,
          type: goal.type,
          isUnlocked: status?.isUnlocked ?? true,
          priority: rules?.priority || 50,
          progress: this._calculateProgress(goal),
        };
      })
      .sort((a, b) => {
        // Unlocked goals come first
        if (a.isUnlocked !== b.isUnlocked) {
          return a.isUnlocked ? -1 : 1;
        }
        // Then by priority
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        // Then by progress (lower progress first for fairness)
        return a.progress - b.progress;
      });

    return sorted.map((item, index) => ({
      sequenceOrder: index + 1,
      goalId: item.goalId,
      title: item.title,
      type: item.type,
      isUnlocked: item.isUnlocked,
      priority: item.priority,
      shouldReceiveFunding: item.isUnlocked,
    }));
  }

  /**
   * Filter goals for allocation based on dependency state
   */
  filterUnlockedGoals(goals, dependencyStatuses) {
    const statusById = new Map(dependencyStatuses.map((s) => [s.goal.id, s]));
    return goals.filter((goal) => {
      const status = statusById.get(goal.id);
      return status?.isUnlocked !== false;
    });
  }
}

export default new GoalDependencyService();
