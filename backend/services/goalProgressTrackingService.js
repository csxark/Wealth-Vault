import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import db from "../config/db.js";
import { goals, goalContributionLineItems } from "../db/schema.js";

class GoalProgressTrackingService {
  _toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  _daysBetween(from, to) {
    const ms = new Date(to).getTime() - new Date(from).getTime();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  _grade(score) {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  }

  async _getGoal(goalId, userId) {
    const goal = await db.query.goals.findFirst({
      where: and(eq(goals.id, goalId), eq(goals.userId, userId)),
    });

    if (!goal) {
      throw new Error("Goal not found");
    }

    return goal;
  }

  async getGoalProgressMetrics(goalId, userId) {
    const goal = await this._getGoal(goalId, userId);

    const targetAmount = this._toNumber(goal.targetAmount);
    const currentAmount = this._toNumber(goal.currentAmount);
    const remainingAmount = Math.max(0, targetAmount - currentAmount);
    const progressPercentage = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;

    const now = new Date();
    const createdAt = goal.createdAt ? new Date(goal.createdAt) : now;
    const deadline = goal.deadline ? new Date(goal.deadline) : null;

    const daysElapsed = Math.max(1, this._daysBetween(createdAt, now));
    const daysRemaining = deadline ? this._daysBetween(now, deadline) : null;

    const avgDailyContribution = Number((currentAmount / daysElapsed).toFixed(2));
    const projectedCompletionDays = avgDailyContribution > 0 ? Math.ceil(remainingAmount / avgDailyContribution) : null;

    return {
      goalId: goal.id,
      title: goal.title,
      status: goal.status,
      targetAmount: Number(targetAmount.toFixed(2)),
      currentAmount: Number(currentAmount.toFixed(2)),
      remainingAmount: Number(remainingAmount.toFixed(2)),
      progressPercentage: Number(progressPercentage.toFixed(2)),
      timeline: {
        createdAt,
        deadline,
        daysElapsed,
        daysRemaining,
        projectedCompletionDays,
      },
      velocity: {
        avgDailyContribution,
        avgMonthlyContribution: Number((avgDailyContribution * 30).toFixed(2)),
      },
    };
  }

  async recordContribution(goalId, userId, tenantId, amount, note = "") {
    const goal = await this._getGoal(goalId, userId);
    const contributionAmount = this._toNumber(amount);

    if (contributionAmount <= 0) {
      throw new Error("Contribution amount must be greater than zero");
    }

    const amountCents = Math.round(contributionAmount * 100);
    const nextCurrentAmount = this._toNumber(goal.currentAmount) + contributionAmount;
    const targetAmount = this._toNumber(goal.targetAmount);

    let nextStatus = goal.status;
    if (nextCurrentAmount >= targetAmount && goal.status === "active") {
      nextStatus = "completed";
    }

    const [result] = await db.transaction(async (tx) => {
      const [lineItem] = await tx
        .insert(goalContributionLineItems)
        .values({
          goalId,
          userId,
          tenantId,
          amountCents,
          rawAmount: contributionAmount.toFixed(2),
          currency: goal.currency || "USD",
          entryType: "contribution",
          description: note || "Manual contribution",
          metadata: { source: "goal_progress_tracking" },
        })
        .returning();

      const [updatedGoal] = await tx
        .update(goals)
        .set({
          currentAmount: nextCurrentAmount.toFixed(2),
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(eq(goals.id, goalId))
        .returning();

      return [{ lineItem, updatedGoal }];
    });

    return {
      goalId,
      contribution: {
        amount: Number(contributionAmount.toFixed(2)),
        amountCents,
        note,
        createdAt: result.lineItem.createdAt,
      },
      goal: {
        currentAmount: Number(this._toNumber(result.updatedGoal.currentAmount).toFixed(2)),
        targetAmount: Number(this._toNumber(result.updatedGoal.targetAmount).toFixed(2)),
        status: result.updatedGoal.status,
      },
    };
  }

  async getContributionStreak(goalId, userId) {
    const contributions = await db
      .select({ createdAt: goalContributionLineItems.createdAt })
      .from(goalContributionLineItems)
      .where(and(eq(goalContributionLineItems.goalId, goalId), eq(goalContributionLineItems.userId, userId)))
      .orderBy(desc(goalContributionLineItems.createdAt));

    if (!contributions.length) {
      return {
        goalId,
        currentStreakDays: 0,
        longestStreakDays: 0,
        consistencyScore: 0,
      };
    }

    const uniqueDays = [...new Set(contributions.map((item) => new Date(item.createdAt).toISOString().slice(0, 10)))];

    let currentStreak = 0;
    let longestStreak = 0;
    let running = 0;

    for (let i = 0; i < uniqueDays.length; i += 1) {
      if (i === 0) {
        running = 1;
        currentStreak = 1;
        longestStreak = 1;
        continue;
      }

      const prev = new Date(uniqueDays[i - 1]);
      const curr = new Date(uniqueDays[i]);
      const delta = Math.abs(this._daysBetween(curr, prev));

      if (delta <= 1) {
        running += 1;
      } else {
        running = 1;
      }

      if (running > longestStreak) longestStreak = running;
      if (i < 7 && delta <= 1) currentStreak = running;
    }

    const consistencyScore = Math.min(100, Number(((uniqueDays.length / 30) * 100).toFixed(2)));

    return {
      goalId,
      currentStreakDays: currentStreak,
      longestStreakDays: longestStreak,
      contributionDaysLast30: uniqueDays.length,
      consistencyScore,
    };
  }

  async getComparativeMetrics(goalId, userId) {
    const metrics = await this.getGoalProgressMetrics(goalId, userId);

    const daysElapsed = Math.max(1, metrics.timeline.daysElapsed);
    const expectedProgress =
      metrics.timeline.daysRemaining == null
        ? metrics.progressPercentage
        : Math.min(100, Number(((daysElapsed / (daysElapsed + Math.max(0, metrics.timeline.daysRemaining))) * 100).toFixed(2)));

    const variance = Number((metrics.progressPercentage - expectedProgress).toFixed(2));

    return {
      goalId,
      actualProgress: metrics.progressPercentage,
      expectedProgress,
      variance,
      status: variance >= 10 ? "ahead" : variance <= -10 ? "behind" : "on_track",
    };
  }

  async getMonthlyBreakdown(goalId, userId, months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months + 1);
    since.setDate(1);

    const rows = await db
      .select({
        createdAt: goalContributionLineItems.createdAt,
        amountCents: goalContributionLineItems.amountCents,
      })
      .from(goalContributionLineItems)
      .where(
        and(
          eq(goalContributionLineItems.goalId, goalId),
          eq(goalContributionLineItems.userId, userId),
          gte(goalContributionLineItems.createdAt, since),
        ),
      )
      .orderBy(asc(goalContributionLineItems.createdAt));

    const buckets = new Map();
    for (const row of rows) {
      const date = new Date(row.createdAt);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const amount = this._toNumber(row.amountCents) / 100;
      buckets.set(key, (buckets.get(key) || 0) + amount);
    }

    const breakdown = [];
    for (let i = months - 1; i >= 0; i -= 1) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      breakdown.push({
        month: key,
        amount: Number((buckets.get(key) || 0).toFixed(2)),
      });
    }

    return {
      goalId,
      months,
      breakdown,
      total: Number(breakdown.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
    };
  }

  async getProgressIndicators(goalId, userId) {
    const metrics = await this.getGoalProgressMetrics(goalId, userId);
    const progress = metrics.progressPercentage;

    const status =
      progress >= 100 ? "completed" :
      progress >= 80 ? "near_complete" :
      progress >= 50 ? "on_track" :
      progress >= 25 ? "in_progress" :
      "starting";

    const color =
      progress >= 100 ? "green" :
      progress >= 80 ? "emerald" :
      progress >= 50 ? "blue" :
      progress >= 25 ? "amber" :
      "orange";

    const milestones = [25, 50, 75, 100].map((checkpoint) => ({
      checkpoint,
      reached: progress >= checkpoint,
    }));

    return {
      goalId,
      progressPercentage: progress,
      status,
      color,
      milestones,
      daysRemaining: metrics.timeline.daysRemaining,
    };
  }

  async getGoalHealthScore(goalId, userId) {
    const [metrics, streak, comparative] = await Promise.all([
      this.getGoalProgressMetrics(goalId, userId),
      this.getContributionStreak(goalId, userId),
      this.getComparativeMetrics(goalId, userId),
    ]);

    const progressScore = Math.min(100, metrics.progressPercentage);
    const consistencyScore = streak.consistencyScore;
    const comparativeScore = Math.max(0, Math.min(100, 50 + comparative.variance));

    const timelineScore =
      metrics.timeline.daysRemaining == null
        ? 75
        : metrics.timeline.daysRemaining < 0
          ? 25
          : metrics.timeline.daysRemaining <= 30
            ? 55
            : 80;

    const healthScore = Number(
      (
        (progressScore * 0.3) +
        (consistencyScore * 0.2) +
        (comparativeScore * 0.25) +
        (timelineScore * 0.25)
      ).toFixed(2),
    );

    return {
      goalId,
      score: healthScore,
      grade: this._grade(healthScore),
      components: {
        progressScore: Number(progressScore.toFixed(2)),
        consistencyScore: Number(consistencyScore.toFixed(2)),
        comparativeScore: Number(comparativeScore.toFixed(2)),
        timelineScore: Number(timelineScore.toFixed(2)),
      },
    };
  }
}

export default new GoalProgressTrackingService();
