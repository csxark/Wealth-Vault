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

  _monthsRemaining(daysRemaining) {
    if (daysRemaining == null) return null;
    return Math.max(1, Math.ceil(daysRemaining / 30));
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

  async _getContributionStats(userId, lookbackDays = 90) {
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const rows = await db
      .select({
        goalId: goalContributionLineItems.goalId,
        amountCents: goalContributionLineItems.amountCents,
        createdAt: goalContributionLineItems.createdAt,
      })
      .from(goalContributionLineItems)
      .where(and(eq(goalContributionLineItems.userId, userId), gte(goalContributionLineItems.createdAt, since)))
      .orderBy(desc(goalContributionLineItems.createdAt));

    const now = new Date();
    const map = new Map();

    for (const row of rows) {
      if (!row.goalId) continue;
      const createdAt = new Date(row.createdAt);
      const ageDays = Math.max(0, Math.ceil((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
      const amount = this._toNumber(row.amountCents) / 100;

      if (!map.has(row.goalId)) {
        map.set(row.goalId, {
          contributionsLast30: 0,
          contributionsLast60: 0,
          contributionsLast90: 0,
          amountLast30: 0,
          amountLast60: 0,
          amountLast90: 0,
          lastContributionAt: null,
        });
      }

      const stats = map.get(row.goalId);

      if (!stats.lastContributionAt || createdAt > new Date(stats.lastContributionAt)) {
        stats.lastContributionAt = createdAt.toISOString();
      }

      if (ageDays <= 90) {
        stats.contributionsLast90 += 1;
        stats.amountLast90 += amount;
      }
      if (ageDays <= 60) {
        stats.contributionsLast60 += 1;
        stats.amountLast60 += amount;
      }
      if (ageDays <= 30) {
        stats.contributionsLast30 += 1;
        stats.amountLast30 += amount;
      }
    }

    for (const stats of map.values()) {
      stats.amountLast30 = Number(stats.amountLast30.toFixed(2));
      stats.amountLast60 = Number(stats.amountLast60.toFixed(2));
      stats.amountLast90 = Number(stats.amountLast90.toFixed(2));
    }

    return map;
  }

  _expectedContributionsPer30Days(goal) {
    const recurring = goal?.recurringContribution || {};
    const frequency = recurring?.frequency;

    if (frequency === "weekly") return 4;
    if (frequency === "biweekly") return 2;
    if (frequency === "monthly") return 1;
    return 0;
  }

  _buildRecoveryRecommendation({ goal, requiredMonthly, currentVelocityMonthly, additionalMonthlyNeeded, daysRemaining, riskLevel }) {
    const roundedRequired = Number(requiredMonthly.toFixed(2));
    const roundedVelocity = Number(currentVelocityMonthly.toFixed(2));
    const roundedAdditional = Number(additionalMonthlyNeeded.toFixed(2));

    const actions = [];

    if (roundedAdditional > 0) {
      actions.push(`Increase monthly contribution by ${roundedAdditional} (${goal.currency || "USD"})`);
    } else {
      actions.push("Maintain current contribution pace to stay on track");
    }

    if (daysRemaining != null && daysRemaining <= 60) {
      actions.push("Prioritize this goal in your next 2 pay cycles");
    }

    if (riskLevel === "high") {
      actions.push("Consider reducing target amount or extending deadline if flexibility exists");
    }

    return {
      monthlyRequired: roundedRequired,
      currentVelocityMonthly: roundedVelocity,
      additionalMonthlyNeeded: roundedAdditional,
      recommended30DayContribution: roundedAdditional > 0 ? roundedRequired : roundedVelocity,
      suggestedActions: actions,
    };
  }

  _computeGoalFailureRisk(goal, contributionStats) {
    const targetAmount = this._toNumber(goal.targetAmount);
    const currentAmount = this._toNumber(goal.currentAmount);
    const remainingAmount = Math.max(0, targetAmount - currentAmount);
    const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
    const daysRemaining = this._daysRemaining(goal.deadline);
    const monthsRemaining = this._monthsRemaining(daysRemaining);

    const currentVelocityMonthly = this._toNumber(contributionStats?.amountLast30);
    const requiredMonthly = monthsRemaining ? remainingAmount / monthsRemaining : 0;
    const velocityRatio = requiredMonthly > 0 ? currentVelocityMonthly / requiredMonthly : 1;

    let score = 0;
    const whyFactors = [];

    if (daysRemaining != null) {
      if (daysRemaining < 0) {
        score += 50;
        whyFactors.push("Goal deadline has passed");
      } else if (daysRemaining <= 30) {
        score += 40;
        whyFactors.push("Critical deadline pressure (30 days or less)");
      } else if (daysRemaining <= 60) {
        score += 30;
        whyFactors.push("High deadline pressure (60 days or less)");
      } else if (daysRemaining <= 120) {
        score += 20;
        whyFactors.push("Moderate deadline pressure");
      } else if (daysRemaining <= 180) {
        score += 10;
      }
    }

    if (requiredMonthly > 0) {
      if (velocityRatio < 0.3) {
        score += 35;
        whyFactors.push("Contribution velocity is far below required pace");
      } else if (velocityRatio < 0.6) {
        score += 25;
        whyFactors.push("Contribution velocity is below required pace");
      } else if (velocityRatio < 0.9) {
        score += 15;
        whyFactors.push("Contribution pace is slightly behind target");
      } else if (velocityRatio < 1) {
        score += 8;
      }
    }

    const expected30 = this._expectedContributionsPer30Days(goal);
    const actual30 = contributionStats?.contributionsLast30 || 0;

    if (expected30 > 0) {
      const missedStreak = Math.max(0, expected30 - actual30);
      if (missedStreak > 0) {
        score += Math.min(24, missedStreak * 8);
        whyFactors.push(`Missed expected contribution cadence (${missedStreak} missed in last 30 days)`);
      }
    } else {
      const lastContributionAt = contributionStats?.lastContributionAt ? new Date(contributionStats.lastContributionAt) : null;
      if (!lastContributionAt) {
        score += 20;
        whyFactors.push("No recent contributions detected");
      } else {
        const inactivityDays = Math.ceil((Date.now() - lastContributionAt.getTime()) / (1000 * 60 * 60 * 24));
        if (inactivityDays > 45) {
          score += 20;
          whyFactors.push("Long contribution inactivity streak");
        } else if (inactivityDays > 21) {
          score += 12;
          whyFactors.push("Contribution activity is intermittent");
        } else if (inactivityDays > 14) {
          score += 8;
        }
      }
    }

    if (progress < 25 && daysRemaining != null && daysRemaining <= 90) {
      score += 12;
      whyFactors.push("Low progress relative to near-term deadline");
    }

    score = Math.min(100, Math.max(0, Math.round(score)));

    let level = "low";
    if (score >= 67) level = "high";
    else if (score >= 34) level = "medium";

    const additionalMonthlyNeeded = Math.max(0, requiredMonthly - currentVelocityMonthly);

    return {
      score,
      level,
      whyFactors: whyFactors.slice(0, 4),
      recoveryRecommendation: this._buildRecoveryRecommendation({
        goal,
        requiredMonthly,
        currentVelocityMonthly,
        additionalMonthlyNeeded,
        daysRemaining,
        riskLevel: level,
      }),
    };
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

  _buildGoalsOverview(goalsList, contributionStatsByGoal = new Map()) {
    return goalsList.map((goal) => {
      const targetAmount = this._toNumber(goal.targetAmount);
      const currentAmount = this._toNumber(goal.currentAmount);
      const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
      const remainingAmount = Math.max(0, targetAmount - currentAmount);
      const daysRemaining = this._daysRemaining(goal.deadline);
      const urgency = this._urgency(daysRemaining);
      const contributionStats = contributionStatsByGoal.get(goal.id);
      const risk = goal.status === "active" ? this._computeGoalFailureRisk(goal, contributionStats) : null;

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
        risk,
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

    const highRisk = goalsOverview.filter((goal) => goal.status === "active" && goal.risk?.level === "high");
    const mediumRisk = goalsOverview.filter((goal) => goal.status === "active" && goal.risk?.level === "medium");

    const insights = [];
    if (highRisk.length) {
      insights.push({
        type: "high_risk_goals",
        severity: "high",
        message: `${highRisk.length} active goal(s) have a high failure risk and need immediate recovery actions.`,
      });
    }
    if (mediumRisk.length) {
      insights.push({
        type: "medium_risk_goals",
        severity: "medium",
        message: `${mediumRisk.length} active goal(s) have medium failure risk and need pace corrections.`,
      });
    }
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
        const riskScoreA = a.risk?.score || 0;
        const riskScoreB = b.risk?.score || 0;
        if (riskScoreA !== riskScoreB) return riskScoreB - riskScoreA;

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
        action: goal.risk?.recoveryRecommendation?.suggestedActions?.[0] || (goal.progressPercentage >= 80 ? "Finish goal" : "Increase contribution"),
        reason: goal.risk?.whyFactors?.[0] || (goal.daysRemaining != null && goal.daysRemaining <= 30 ? "Deadline approaching" : "Improve completion pace"),
      }));
  }

  async getGoalsDashboard(userId) {
    const goalsList = await this._getUserGoals(userId);
    const contributionStatsByGoal = await this._getContributionStats(userId, 90);
    const goalsOverview = this._buildGoalsOverview(goalsList, contributionStatsByGoal);

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
