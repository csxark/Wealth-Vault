import db from '../config/db.js';
import { 
  goalRiskTracking, 
  contributionStreaks, 
  goalFailureAlerts,
  financialGoals,
  goalProgressSnapshots,
  goalContributions
} from '../db/schema.js';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import notificationService from './notificationService.js';

/**
 * Goal Failure Early-Warning Service
 * Monitors risk score transitions, missed contribution streaks, and triggers alerts
 */
class GoalEarlyWarningService {
  constructor() {
    this.riskThresholds = {
      low: { min: 0, max: 33 },
      medium: { min: 34, max: 66 },
      high: { min: 67, max: 100 }
    };
    
    this.missedContributionThreshold = 2; // Alert after 2 missed contributions
    this.prolongedInactivityDays = 30; // Alert after 30 days of no contributions
  }

  /**
   * Calculate risk score for a goal based on multiple factors
   */
  async calculateGoalRiskScore(goalId) {
    try {
      // Get goal details
      const [goal] = await db
        .select()
        .from(financialGoals)
        .where(eq(financialGoals.id, goalId));

      if (!goal) return null;

      // Get latest progress snapshot
      const [latestSnapshot] = await db
        .select()
        .from(goalProgressSnapshots)
        .where(eq(goalProgressSnapshots.goalId, goalId))
        .orderBy(desc(goalProgressSnapshots.createdAt))
        .limit(1);

      // Get contribution streak data
      const [streak] = await db
        .select()
        .from(contributionStreaks)
        .where(eq(contributionStreaks.goalId, goalId));

      let riskScore = 0;
      const factors = {};

      // Factor 1: Pace Ratio (40% weight)
      if (latestSnapshot?.paceRatio) {
        const paceRatio = parseFloat(latestSnapshot.paceRatio);
        if (paceRatio < 0.5) {
          riskScore += 40;
          factors.paceRatio = { value: paceRatio, impact: 40, status: 'critical' };
        } else if (paceRatio < 0.8) {
          riskScore += 25;
          factors.paceRatio = { value: paceRatio, impact: 25, status: 'warning' };
        } else if (paceRatio < 1.0) {
          riskScore += 15;
          factors.paceRatio = { value: paceRatio, impact: 15, status: 'caution' };
        } else {
          factors.paceRatio = { value: paceRatio, impact: 0, status: 'good' };
        }
      }

      // Factor 2: Deadline Proximity (25% weight)
      const daysRemaining = latestSnapshot?.daysRemaining || 0;
      const progressPercentage = parseFloat(goal.progressPercentage || 0);
      
      if (daysRemaining <= 30 && progressPercentage < 70) {
        riskScore += 25;
        factors.deadlineProximity = { daysRemaining, progressPercentage, impact: 25, status: 'critical' };
      } else if (daysRemaining <= 60 && progressPercentage < 50) {
        riskScore += 15;
        factors.deadlineProximity = { daysRemaining, progressPercentage, impact: 15, status: 'warning' };
      } else {
        factors.deadlineProximity = { daysRemaining, progressPercentage, impact: 0, status: 'good' };
      }

      // Factor 3: Missed Contributions (20% weight)
      if (streak?.missedCount) {
        const missedCount = streak.missedCount;
        if (missedCount >= 3) {
          riskScore += 20;
          factors.missedContributions = { count: missedCount, impact: 20, status: 'critical' };
        } else if (missedCount >= 2) {
          riskScore += 12;
          factors.missedContributions = { count: missedCount, impact: 12, status: 'warning' };
        } else {
          factors.missedContributions = { count: missedCount, impact: 0, status: 'caution' };
        }
      }

      // Factor 4: Achievement Probability (15% weight)
      if (latestSnapshot?.achievementProbability) {
        const probability = parseFloat(latestSnapshot.achievementProbability);
        if (probability < 30) {
          riskScore += 15;
          factors.achievementProbability = { value: probability, impact: 15, status: 'critical' };
        } else if (probability < 50) {
          riskScore += 8;
          factors.achievementProbability = { value: probability, impact: 8, status: 'warning' };
        } else {
          factors.achievementProbability = { value: probability, impact: 0, status: 'good' };
        }
      }

      // Cap risk score at 100
      riskScore = Math.min(riskScore, 100);

      // Determine risk level
      const riskLevel = this.getRiskLevel(riskScore);

      return {
        goalId,
        riskScore,
        riskLevel,
        factors,
        calculatedAt: new Date()
      };
    } catch (error) {
      console.error(`Error calculating risk score for goal ${goalId}:`, error);
      return null;
    }
  }

  /**
   * Get risk level from score
   */
  getRiskLevel(score) {
    if (score >= this.riskThresholds.high.min) return 'high';
    if (score >= this.riskThresholds.medium.min) return 'medium';
    return 'low';
  }

  /**
   * Track risk score and detect transitions
   */
  async trackRiskScore(goalId, userId) {
    try {
      const riskData = await this.calculateGoalRiskScore(goalId);
      if (!riskData) return null;

      // Get previous risk tracking record
      const [previousTracking] = await db
        .select()
        .from(goalRiskTracking)
        .where(eq(goalRiskTracking.goalId, goalId))
        .orderBy(desc(goalRiskTracking.calculatedAt))
        .limit(1);

      const previousRiskLevel = previousTracking?.currentRiskLevel || null;
      const previousRiskScore = previousTracking?.riskScore 
        ? parseFloat(previousTracking.riskScore) 
        : null;

      // Determine transition type
      let transitionType = 'stable';
      if (previousRiskLevel && previousRiskLevel !== riskData.riskLevel) {
        transitionType = this.isEscalation(previousRiskLevel, riskData.riskLevel)
          ? 'escalation'
          : 'improvement';
      }

      // Insert new tracking record
      const [newTracking] = await db
        .insert(goalRiskTracking)
        .values({
          goalId,
          userId,
          previousRiskLevel,
          currentRiskLevel: riskData.riskLevel,
          riskScore: riskData.riskScore.toString(),
          previousRiskScore: previousRiskScore?.toString() || null,
          transitionType,
          contributingFactors: riskData.factors,
          calculatedAt: new Date()
        })
        .returning();

      // Trigger alerts if there's a risk escalation
      if (transitionType === 'escalation') {
        await this.triggerRiskEscalationAlert(goalId, userId, {
          previousLevel: previousRiskLevel,
          currentLevel: riskData.riskLevel,
          riskScore: riskData.riskScore,
          factors: riskData.factors
        });
      }

      return {
        tracking: newTracking,
        transitionType,
        riskData
      };
    } catch (error) {
      console.error(`Error tracking risk score for goal ${goalId}:`, error);
      throw error;
    }
  }

  /**
   * Check if transition is an escalation
   */
  isEscalation(previousLevel, currentLevel) {
    const levels = { low: 1, medium: 2, high: 3 };
    return levels[currentLevel] > levels[previousLevel];
  }

  /**
   * Update contribution streak tracking
   */
  async updateContributionStreak(goalId, userId, contributionMade = false) {
    try {
      // Get goal details
      const [goal] = await db
        .select()
        .from(financialGoals)
        .where(eq(financialGoals.id, goalId));

      if (!goal) return null;

      // Get or create streak record
      let [streak] = await db
        .select()
        .from(contributionStreaks)
        .where(eq(contributionStreaks.goalId, goalId));

      const now = new Date();
      
      if (!streak) {
        // Create new streak record
        [streak] = await db
          .insert(contributionStreaks)
          .values({
            goalId,
            userId,
            streakType: contributionMade ? 'active' : 'missed',
            currentStreak: contributionMade ? 1 : 0,
            longestStreak: contributionMade ? 1 : 0,
            lastContributionDate: contributionMade ? now : null,
            missedCount: contributionMade ? 0 : 1,
            expectedFrequency: 'monthly', // Default, can be customized
            nextExpectedDate: this.calculateNextExpectedDate('monthly', now),
            isAtRisk: false,
            lastUpdated: now
          })
          .returning();
      } else {
        // Update existing streak
        const updates = {
          lastUpdated: now
        };

        if (contributionMade) {
          updates.streakType = 'active';
          updates.currentStreak = (streak.currentStreak || 0) + 1;
          updates.longestStreak = Math.max(updates.currentStreak, streak.longestStreak || 0);
          updates.lastContributionDate = now;
          updates.missedCount = 0;
          updates.isAtRisk = false;
          updates.nextExpectedDate = this.calculateNextExpectedDate(
            streak.expectedFrequency || 'monthly',
            now
          );
        } else {
          updates.streakType = 'missed';
          updates.currentStreak = 0;
          updates.missedCount = (streak.missedCount || 0) + 1;
          updates.isAtRisk = updates.missedCount >= (streak.riskThreshold || this.missedContributionThreshold);
        }

        [streak] = await db
          .update(contributionStreaks)
          .set(updates)
          .where(eq(contributionStreaks.goalId, goalId))
          .returning();
      }

      // Trigger alert if at risk
      if (streak.isAtRisk && streak.missedCount >= this.missedContributionThreshold) {
        await this.triggerMissedContributionAlert(goalId, userId, {
          missedCount: streak.missedCount,
          lastContributionDate: streak.lastContributionDate,
          nextExpectedDate: streak.nextExpectedDate
        });
      }

      // Check for prolonged inactivity
      if (streak.lastContributionDate) {
        const daysSinceLastContribution = Math.floor(
          (now - new Date(streak.lastContributionDate)) / (1000 * 60 * 60 * 24)
        );
        
        if (daysSinceLastContribution >= this.prolongedInactivityDays) {
          await this.triggerProlongedInactivityAlert(goalId, userId, {
            daysSinceLastContribution,
            lastContributionDate: streak.lastContributionDate
          });
        }
      }

      return streak;
    } catch (error) {
      console.error(`Error updating contribution streak for goal ${goalId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate next expected contribution date
   */
  calculateNextExpectedDate(frequency, fromDate) {
    const date = new Date(fromDate);
    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'biweekly':
        date.setDate(date.getDate() + 14);
        break;
      case 'monthly':
      default:
        date.setMonth(date.getMonth() + 1);
        break;
    }
    return date;
  }

  /**
   * Generate recovery actions based on risk factors
   */
  generateRecoveryActions(riskFactors, alertType) {
    const actions = [];

    if (alertType === 'risk_escalation' || alertType === 'recovery_needed') {
      if (riskFactors.paceRatio?.status === 'critical' || riskFactors.paceRatio?.status === 'warning') {
        actions.push({
          action: 'increase_contributions',
          title: 'Increase Monthly Contributions',
          description: `Your current pace is ${(riskFactors.paceRatio.value * 100).toFixed(0)}% of the required rate. Consider increasing your monthly contribution.`,
          priority: 'high',
          estimatedImpact: 'Brings you back on track to meet your goal deadline.'
        });
      }

      if (riskFactors.deadlineProximity?.status === 'critical') {
        actions.push({
          action: 'extend_deadline',
          title: 'Extend Goal Deadline',
          description: `Only ${riskFactors.deadlineProximity.daysRemaining} days remaining with ${riskFactors.deadlineProximity.progressPercentage}% progress. Consider extending the deadline.`,
          priority: 'high',
          estimatedImpact: 'Reduces monthly contribution pressure and increases success probability.'
        });
      }

      if (riskFactors.achievementProbability?.status === 'critical') {
        actions.push({
          action: 'reduce_target',
          title: 'Adjust Target Amount',
          description: `Achievement probability is ${riskFactors.achievementProbability.value}%. Consider reducing the target amount to a more realistic level.`,
          priority: 'medium',
          estimatedImpact: 'Makes goal more achievable with current financial capacity.'
        });
      }
    }

    if (alertType === 'missed_contribution_streak') {
      actions.push({
        action: 'setup_auto_transfer',
        title: 'Enable Automatic Transfers',
        description: 'Set up automatic recurring transfers to ensure consistent contributions.',
        priority: 'high',
        estimatedImpact: 'Prevents future missed contributions and maintains progress momentum.'
      });

      actions.push({
        action: 'adjust_frequency',
        title: 'Adjust Contribution Frequency',
        description: 'Switch to a smaller, more frequent contribution schedule that fits your cash flow.',
        priority: 'medium',
        estimatedImpact: 'Makes contributions more manageable and reduces likelihood of missing payments.'
      });
    }

    if (alertType === 'prolonged_inactivity') {
      actions.push({
        action: 'review_goal',
        title: 'Review Goal Relevance',
        description: 'It\'s been a while since your last contribution. Review if this goal is still a priority.',
        priority: 'medium',
        estimatedImpact: 'Ensures your financial focus aligns with current priorities.'
      });

      actions.push({
        action: 'make_contribution',
        title: 'Make a Contribution',
        description: 'Even a small contribution can restart your momentum.',
        priority: 'high',
        estimatedImpact: 'Restarts progress tracking and prevents goal abandonment.'
      });
    }

    return actions;
  }

  /**
   * Trigger risk escalation alert
   */
  async triggerRiskEscalationAlert(goalId, userId, data) {
    try {
      const [goal] = await db
        .select()
        .from(financialGoals)
        .where(eq(financialGoals.id, goalId));

      if (!goal) return;

      const recoveryActions = this.generateRecoveryActions(data.factors, 'risk_escalation');

      const severity = data.currentLevel === 'high' ? 'critical' : 'high';
      const title = `⚠️ Goal Risk Escalated: ${goal.goalName}`;
      const message = `Your goal "${goal.goalName}" risk level has increased from ${data.previousLevel} to ${data.currentLevel} (score: ${data.riskScore.toFixed(0)}/100). Immediate action recommended.`;

      // Create alert record
      const [alert] = await db
        .insert(goalFailureAlerts)
        .values({
          goalId,
          userId,
          alertType: 'risk_escalation',
          severity,
          title,
          message,
          recoveryActions,
          triggerData: data,
          sentVia: ['in-app', 'push'],
          createdAt: new Date()
        })
        .returning();

      // Send notification via notification service
      await notificationService.sendNotification(userId, {
        title,
        message,
        type: 'alert',
        data: {
          goalId,
          alertId: alert.id,
          alertType: 'risk_escalation',
          recoveryActions
        }
      });

      console.log(`[Goal Early Warning] Risk escalation alert sent for goal ${goalId}`);
      
      return alert;
    } catch (error) {
      console.error('Error triggering risk escalation alert:', error);
      throw error;
    }
  }

  /**
   * Trigger missed contribution streak alert
   */
  async triggerMissedContributionAlert(goalId, userId, data) {
    try {
      const [goal] = await db
        .select()
        .from(financialGoals)
        .where(eq(financialGoals.id, goalId));

      if (!goal) return;

      // Check if similar alert was sent recently (avoid spam)
      const recentAlerts = await db
        .select()
        .from(goalFailureAlerts)
        .where(
          and(
            eq(goalFailureAlerts.goalId, goalId),
            eq(goalFailureAlerts.alertType, 'missed_contribution_streak'),
            gte(goalFailureAlerts.createdAt, sql`NOW() - INTERVAL '7 days'`)
          )
        );

      if (recentAlerts.length > 0) {
        console.log(`[Goal Early Warning] Skipping duplicate missed contribution alert for goal ${goalId}`);
        return null;
      }

      const recoveryActions = this.generateRecoveryActions({}, 'missed_contribution_streak');

      const title = `📉 Missed Contributions: ${goal.goalName}`;
      const message = `You've missed ${data.missedCount} consecutive contributions for "${goal.goalName}". Let's get you back on track!`;

      const [alert] = await db
        .insert(goalFailureAlerts)
        .values({
          goalId,
          userId,
          alertType: 'missed_contribution_streak',
          severity: 'high',
          title,
          message,
          recoveryActions,
          triggerData: data,
          sentVia: ['in-app', 'push'],
          createdAt: new Date()
        })
        .returning();

      await notificationService.sendNotification(userId, {
        title,
        message,
        type: 'warning',
        data: {
          goalId,
          alertId: alert.id,
          alertType: 'missed_contribution_streak',
          recoveryActions
        }
      });

      console.log(`[Goal Early Warning] Missed contribution alert sent for goal ${goalId}`);
      
      return alert;
    } catch (error) {
      console.error('Error triggering missed contribution alert:', error);
      throw error;
    }
  }

  /**
   * Trigger prolonged inactivity alert
   */
  async triggerProlongedInactivityAlert(goalId, userId, data) {
    try {
      const [goal] = await db
        .select()
        .from(financialGoals)
        .where(eq(financialGoals.id, goalId));

      if (!goal) return;

      // Check if similar alert was sent recently
      const recentAlerts = await db
        .select()
        .from(goalFailureAlerts)
        .where(
          and(
            eq(goalFailureAlerts.goalId, goalId),
            eq(goalFailureAlerts.alertType, 'prolonged_inactivity'),
            gte(goalFailureAlerts.createdAt, sql`NOW() - INTERVAL '14 days'`)
          )
        );

      if (recentAlerts.length > 0) {
        console.log(`[Goal Early Warning] Skipping duplicate prolonged inactivity alert for goal ${goalId}`);
        return null;
      }

      const recoveryActions = this.generateRecoveryActions({}, 'prolonged_inactivity');

      const title = `⏰ Long-term Inactivity: ${goal.goalName}`;
      const message = `It's been ${data.daysSinceLastContribution} days since your last contribution to "${goal.goalName}". Is this goal still important to you?`;

      const [alert] = await db
        .insert(goalFailureAlerts)
        .values({
          goalId,
          userId,
          alertType: 'prolonged_inactivity',
          severity: 'medium',
          title,
          message,
          recoveryActions,
          triggerData: data,
          sentVia: ['in-app', 'push'],
          createdAt: new Date()
        })
        .returning();

      await notificationService.sendNotification(userId, {
        title,
        message,
        type: 'info',
        data: {
          goalId,
          alertId: alert.id,
          alertType: 'prolonged_inactivity',
          recoveryActions
        }
      });

      console.log(`[Goal Early Warning] Prolonged inactivity alert sent for goal ${goalId}`);
      
      return alert;
    } catch (error) {
      console.error('Error triggering prolonged inactivity alert:', error);
      throw error;
    }
  }

  /**
   * Get alerts for a user or goal
   */
  async getAlerts({ userId, goalId, unreadOnly = false, limit = 20, offset = 0 }) {
    try {
      let query = db.select().from(goalFailureAlerts);

      const conditions = [];
      if (userId) conditions.push(eq(goalFailureAlerts.userId, userId));
      if (goalId) conditions.push(eq(goalFailureAlerts.goalId, goalId));
      if (unreadOnly) conditions.push(eq(goalFailureAlerts.isRead, false));

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const alerts = await query
        .orderBy(desc(goalFailureAlerts.createdAt))
        .limit(limit)
        .offset(offset);

      return alerts;
    } catch (error) {
      console.error('Error fetching alerts:', error);
      throw error;
    }
  }

  /**
   * Mark alert as read
   */
  async markAlertRead(alertId, userId) {
    try {
      const [alert] = await db
        .update(goalFailureAlerts)
        .set({
          isRead: true,
          readAt: new Date()
        })
        .where(
          and(
            eq(goalFailureAlerts.id, alertId),
            eq(goalFailureAlerts.userId, userId)
          )
        )
        .returning();

      return alert;
    } catch (error) {
      console.error('Error marking alert as read:', error);
      throw error;
    }
  }

  /**
   * Dismiss alert
   */
  async dismissAlert(alertId, userId) {
    try {
      const [alert] = await db
        .update(goalFailureAlerts)
        .set({
          isDismissed: true,
          dismissedAt: new Date()
        })
        .where(
          and(
            eq(goalFailureAlerts.id, alertId),
            eq(goalFailureAlerts.userId, userId)
          )
        )
        .returning();

      return alert;
    } catch (error) {
      console.error('Error dismissing alert:', error);
      throw error;
    }
  }

  /**
   * Record action taken on alert
   */
  async recordAlertAction(alertId, userId, actionTaken) {
    try {
      const [alert] = await db
        .update(goalFailureAlerts)
        .set({
          actionTaken,
          actionTakenAt: new Date(),
          isRead: true,
          readAt: new Date()
        })
        .where(
          and(
            eq(goalFailureAlerts.id, alertId),
            eq(goalFailureAlerts.userId, userId)
          )
        )
        .returning();

      return alert;
    } catch (error) {
      console.error('Error recording alert action:', error);
      throw error;
    }
  }

  /**
   * Get risk history for a goal
   */
  async getRiskHistory(goalId, limit = 30) {
    try {
      const history = await db
        .select()
        .from(goalRiskTracking)
        .where(eq(goalRiskTracking.goalId, goalId))
        .orderBy(desc(goalRiskTracking.calculatedAt))
        .limit(limit);

      return history;
    } catch (error) {
      console.error('Error fetching risk history:', error);
      throw error;
    }
  }

  /**
   * Monitor all active goals for a user (can be run as a cron job)
   */
  async monitorUserGoals(userId) {
    try {
      // Get all active goals for user
      const activeGoals = await db
        .select()
        .from(financialGoals)
        .where(
          and(
            eq(financialGoals.userId, userId),
            eq(financialGoals.status, 'active')
          )
        );

      const results = [];

      for (const goal of activeGoals) {
        try {
          // Track risk score (this will trigger alerts if needed)
          const trackingResult = await this.trackRiskScore(goal.id, userId);
          results.push({
            goalId: goal.id,
            goalName: goal.goalName,
            status: 'monitored',
            trackingResult
          });
        } catch (error) {
          console.error(`Error monitoring goal ${goal.id}:`, error);
          results.push({
            goalId: goal.id,
            goalName: goal.goalName,
            status: 'error',
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error monitoring user goals:', error);
      throw error;
    }
  }
}

export default new GoalEarlyWarningService();
