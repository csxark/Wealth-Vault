import { and, desc, eq, gte } from "drizzle-orm";
import db from "../config/db.js";
import { goals, goalContributionLineItems } from "../db/schema.js";
import smartSavingsAllocationService from "./smartSavingsAllocationService.js";

class GoalsDashboardService {
  _toNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  _daysRemaining(deadline) {
    if (!deadline) return null;
    const now = new Date();
    const target = new Date(deadline);
    const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  }

  _urgency(daysRemaining) {
    if (daysRemaining == null) return { level: "none", color: "gray", label: "No deadline" };
    if (daysRemaining < 0) return { level: "overdue", color: "red", label: "Overdue" };
    if (daysRemaining <= 30) return { level: "critical", color: "red", label: "Critical" };
    if (daysRemaining <= 90) return { level: "high", color: "orange", label: "High" };
    if (daysRemaining <= 180) return { level: "medium", color: "amber", label: "Medium" };
    return { level: "low", color: "green", label: "Low" };
  }

  async _getUserGoals(userId) {
    return db.query.goals.findMany({
      where: eq(goals.userId, userId),
      orderBy: [desc(goals.updatedAt)],
    });
  }

  _buildSummary(goalsList) {
    const totalGoals = goalsList.length;
    const activeGoals = goalsList.filter((goal) => goal.status === "active").length;
    const completedGoals = goalsList.filter((goal) => goal.status === "completed").length;

    const totalTarget = goalsList.reduce((sum, goal) => sum + this._toNumber(goal.targetAmount), 0);
    const totalCurrent = goalsList.reduce((sum, goal) => sum + this._toNumber(goal.currentAmount), 0);
    const totalRemaining = Math.max(0, totalTarget - totalCurrent);
    const overallProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

    return {
      totalGoals,
      activeGoals,
      completedGoals,
      completionRate: totalGoals > 0 ? Number(((completedGoals / totalGoals) * 100).toFixed(2)) : 0,
      totalTarget: Number(totalTarget.toFixed(2)),
      totalCurrent: Number(totalCurrent.toFixed(2)),
      totalRemaining: Number(totalRemaining.toFixed(2)),
      overallProgress: Number(overallProgress.toFixed(2)),
    };
  }

  _buildGoalsOverview(goalsList) {
    return goalsList.map((goal) => {
      const targetAmount = this._toNumber(goal.targetAmount);
      const currentAmount = this._toNumber(goal.currentAmount);
      const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
      const remainingAmount = Math.max(0, targetAmount - currentAmount);
      const daysRemaining = this._daysRemaining(goal.deadline);
      const urgency = this._urgency(daysRemaining);

      return {
        id: goal.id,
        title: goal.title,
        status: goal.status,
        priority: goal.priority,
        type: goal.type,
        targetAmount: Number(targetAmount.toFixed(2)),
        currentAmount: Number(currentAmount.toFixed(2)),
        remainingAmount: Number(remainingAmount.toFixed(2)),
        progressPercentage: Number(progress.toFixed(2)),
        daysRemaining,
        deadline: goal.deadline,
        urgency,
      };
    });
  }

  async _buildProgressTrend(userId) {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const rows = await db
      .select({
        goalId: goalContributionLineItems.goalId,
        amountCents: goalContributionLineItems.amountCents,
        createdAt: goalContributionLineItems.createdAt,
      })
      .from(goalContributionLineItems)
      .where(and(eq(goalContributionLineItems.userId, userId), gte(goalContributionLineItems.createdAt, since)))
      .orderBy(desc(goalContributionLineItems.createdAt));

    const byDay = new Map();
    for (const row of rows) {
      const dayKey = new Date(row.createdAt).toISOString().slice(0, 10);
      const amount = this._toNumber(row.amountCents) / 100;
      byDay.set(dayKey, (byDay.get(dayKey) || 0) + amount);
    }

    const timeline = [];
    for (let i = 29; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      timeline.push({
        date: key,
        amount: Number((byDay.get(key) || 0).toFixed(2)),
      });
    }

    const total30d = timeline.reduce((sum, item) => sum + item.amount, 0);
    const velocityMonthly = Number(total30d.toFixed(2));

    return {
      days: 30,
      velocityMonthly,
      timeline,
    };
  }

  _buildMilestones(goalsOverview) {
    const checkpoints = [25, 50, 75, 100];
    const milestones = [];

    for (const goal of goalsOverview) {
      for (const checkpoint of checkpoints) {
        milestones.push({
          goalId: goal.id,
          goalTitle: goal.title,
          checkpoint,
          isReached: goal.progressPercentage >= checkpoint,
        });
      }
    }

    return milestones;
  }

  _buildInsights(goalsOverview) {
    const overdue = goalsOverview.filter((goal) => goal.daysRemaining != null && goal.daysRemaining < 0 && goal.status !== "completed");
    const nearComplete = goalsOverview.filter((goal) => goal.progressPercentage >= 80 && goal.status !== "completed");
    const behind = goalsOverview.filter(
      (goal) => goal.daysRemaining != null && goal.daysRemaining <= 90 && goal.progressPercentage < 50 && goal.status === "active",
    );

    const insights = [];
    if (overdue.length) {
      insights.push({
        type: "overdue",
        severity: "high",
        message: `${overdue.length} goal(s) are overdue and need immediate catch-up contributions.`,
      });
    }
    if (behind.length) {
      insights.push({
        type: "behind",
        severity: "medium",
        message: `${behind.length} goal(s) are at risk based on remaining time and current progress.`,
      });
    }
    if (nearComplete.length) {
      insights.push({
        type: "near_complete",
        severity: "low",
        message: `${nearComplete.length} goal(s) are near completion and can be closed soon.`,
      });
    }

    if (!insights.length) {
      insights.push({
        type: "healthy",
        severity: "low",
        message: "Goals are progressing steadily with no immediate risks detected.",
      });
    }

    return insights;
  }

  _buildNextActions(goalsOverview) {
    return goalsOverview
      .filter((goal) => goal.status === "active")
      .sort((a, b) => {
        const urgencyScoreA = a.daysRemaining == null ? 9999 : a.daysRemaining;
        const urgencyScoreB = b.daysRemaining == null ? 9999 : b.daysRemaining;
        if (urgencyScoreA !== urgencyScoreB) return urgencyScoreA - urgencyScoreB;
        return b.progressPercentage - a.progressPercentage;
      })
      .slice(0, 5)
      .map((goal, index) => ({
        priority: index + 1,
        goalId: goal.id,
        title: goal.title,
        action: goal.progressPercentage >= 80 ? "Finish goal" : "Increase contribution",
        reason: goal.daysRemaining != null && goal.daysRemaining <= 30 ? "Deadline approaching" : "Improve completion pace",
      }));
  }

  async getGoalsDashboard(userId) {
    const goalsList = await this._getUserGoals(userId);
    const goalsOverview = this._buildGoalsOverview(goalsList);

    const [progressTrend, autoAllocation] = await Promise.all([
      this._buildProgressTrend(userId),
      smartSavingsAllocationService.recommendAutoAllocation(userId, { strategy: "balanced" }),
    ]);

    const milestones = this._buildMilestones(goalsOverview);
    const insights = this._buildInsights(goalsOverview);
    const nextActions = this._buildNextActions(goalsOverview);

    return {
      generatedAt: new Date().toISOString(),
      summary: this._buildSummary(goalsList),
      goalsOverview,
      progressTrend,
      allocationRecommendations: autoAllocation,
      milestones,
      insights,
      nextActions,
    };
  }
}

export default new GoalsDashboardService();
