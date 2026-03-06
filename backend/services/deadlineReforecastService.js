import db from '../config/db.js';
import { 
  financialGoals,
  goalProgressSnapshots,
  goalContributions,
  contributionStreaks
} from '../db/schema.js';
import { eq, and, desc, gte, sql } from 'drizzle-orm';

/**
 * Adaptive Deadline Reforecasting Engine
 * Proposes adjusted target dates based on current contribution capacity
 * Provides tradeoff options (increase contribution vs extend deadline)
 */
class DeadlineReforecastService {
  constructor() {
    this.analysisWindows = {
      recent: 30,   // Last 30 days
      medium: 60,   // Last 60 days  
      extended: 90  // Last 90 days
    };
  }

  /**
   * Analyze contribution capacity over time windows
   */
  async analyzeContributionCapacity(goalId, userId) {
    try {
      const goal = await this.getGoalDetails(goalId);
      if (!goal) return null;

      // Get contributions for different time windows
      const now = new Date();
      const contributions = {
        last30Days: await this.getContributionsInWindow(goalId, 30),
        last60Days: await this.getContributionsInWindow(goalId, 60),
        last90Days: await this.getContributionsInWindow(goalId, 90),
        allTime: await this.getAllContributions(goalId)
      };

      // Calculate monthly averages for each window
      const capacity = {
        recent30DayAvg: this.calculateMonthlyAverage(contributions.last30Days, 30),
        medium60DayAvg: this.calculateMonthlyAverage(contributions.last60Days, 60),
        extended90DayAvg: this.calculateMonthlyAverage(contributions.last90Days, 90),
        lifetimeAvg: this.calculateMonthlyAverage(contributions.allTime, this.getDaysSinceStart(goal))
      };

      // Detect trend (improving, declining, stable)
      const trend = this.detectTrend(capacity);

      // Calculate weighted current capacity (more weight to recent data)
      const currentCapacity = this.calculateWeightedCapacity(capacity);

      return {
        goalId,
        contributions,
        capacity,
        trend,
        currentCapacity,
        analyzedAt: new Date()
      };
    } catch (error) {
      console.error(`Error analyzing contribution capacity for goal ${goalId}:`, error);
      throw error;
    }
  }

  /**
   * Generate reforecast with multiple recovery path options
   */
  async generateReforecast(goalId, userId) {
    try {
      const goal = await this.getGoalDetails(goalId);
      if (!goal) {
        throw new Error('Goal not found');
      }

      // Get latest progress snapshot
      const [latestSnapshot] = await db
        .select()
        .from(goalProgressSnapshots)
        .where(eq(goalProgressSnapshots.goalId, goalId))
        .orderBy(desc(goalProgressSnapshots.createdAt))
        .limit(1);

      // Analyze current contribution capacity
      const capacityAnalysis = await this.analyzeContributionCapacity(goalId, userId);

      // Calculate current status
      const currentAmount = parseFloat(goal.currentAmount || 0);
      const targetAmount = parseFloat(goal.targetAmount);
      const remainingAmount = targetAmount - currentAmount;
      const originalDeadline = new Date(goal.targetDate);
      const today = new Date();
      const daysToDeadline = Math.max(0, Math.floor((originalDeadline - today) / (1000 * 60 * 60 * 24)));

      // Project completion date based on current capacity
      const projectedDate = this.projectCompletionDate(
        remainingAmount,
        capacityAnalysis.currentCapacity
      );

      // Calculate if deadline is realistic
      const isDeadlineRealistic = projectedDate <= originalDeadline;
      const delayDays = Math.max(0, Math.floor((projectedDate - originalDeadline) / (1000 * 60 * 60 * 24)));

      // Generate recovery path options
      const recoveryPaths = this.generateRecoveryPaths({
        goal,
        currentAmount,
        targetAmount,
        remainingAmount,
        originalDeadline,
        daysToDeadline,
        currentCapacity: capacityAnalysis.currentCapacity,
        latestSnapshot,
        trend: capacityAnalysis.trend
      });

      // Build reforecast result
      const reforecast = {
        goalId,
        goalName: goal.goalName,
        analysisDate: new Date(),
        currentStatus: {
          currentAmount,
          targetAmount,
          remainingAmount,
          progressPercentage: parseFloat(goal.progressPercentage || 0),
          originalDeadline,
          daysToDeadline
        },
        capacityAnalysis: {
          currentMonthlyCapacity: capacityAnalysis.currentCapacity,
          trend: capacityAnalysis.trend,
          recent30DayAvg: capacityAnalysis.capacity.recent30DayAvg,
          medium60DayAvg: capacityAnalysis.capacity.medium60DayAvg,
          extended90DayAvg: capacityAnalysis.capacity.extended90DayAvg
        },
        projection: {
          projectedCompletionDate: projectedDate,
          isDeadlineRealistic,
          delayDays,
          monthsBehindSchedule: delayDays > 0 ? Math.ceil(delayDays / 30) : 0,
          confidenceLevel: this.calculateConfidenceLevel(capacityAnalysis)
        },
        recoveryPaths,
        recommendation: this.selectBestRecommendation(recoveryPaths, capacityAnalysis.trend)
      };

      return reforecast;
    } catch (error) {
      console.error(`Error generating reforecast for goal ${goalId}:`, error);
      throw error;
    }
  }

  /**
   * Generate multiple recovery path options
   */
  generateRecoveryPaths(params) {
    const {
      goal,
      currentAmount,
      targetAmount,
      remainingAmount,
      originalDeadline,
      daysToDeadline,
      currentCapacity,
      trend
    } = params;

    const paths = [];

    // Path 1: Increase contributions to meet original deadline
    if (daysToDeadline > 0) {
      const monthsToDeadline = daysToDeadline / 30;
      const requiredMonthlyContribution = monthsToDeadline > 0 
        ? remainingAmount / monthsToDeadline 
        : remainingAmount;
      
      const increaseAmount = requiredMonthlyContribution - currentCapacity;
      const increasePercentage = currentCapacity > 0 
        ? (increaseAmount / currentCapacity) * 100 
        : 0;

      paths.push({
        pathId: 'increase_contributions',
        title: 'Increase Monthly Contributions',
        description: `Increase your monthly contribution to meet the original deadline of ${originalDeadline.toLocaleDateString()}.`,
        type: 'contribution_increase',
        viability: this.assessViability(increasePercentage, trend),
        changes: {
          currentMonthlyContribution: currentCapacity,
          requiredMonthlyContribution,
          increaseAmount,
          increasePercentage: Math.round(increasePercentage),
          newDeadline: originalDeadline,
          targetAmount
        },
        impact: {
          timeToCompletion: `${Math.ceil(monthsToDeadline)} months`,
          totalAdditionalContributions: increaseAmount * monthsToDeadline,
          effortLevel: this.getEffortLevel(increasePercentage)
        },
        pros: [
          'Meets original deadline',
          'No deadline extension needed',
          'Maintains original goal timeline'
        ],
        cons: [
          `Requires ${Math.round(increasePercentage)}% increase in monthly contributions`,
          'May strain current budget',
          trend.direction === 'declining' ? 'Goes against recent contribution trend' : null
        ].filter(Boolean)
      });
    }

    // Path 2: Extend deadline to match current capacity
    const monthsNeeded = currentCapacity > 0 ? remainingAmount / currentCapacity : 999;
    const extendedDeadline = new Date();
    extendedDeadline.setDate(extendedDeadline.getDate() + Math.ceil(monthsNeeded * 30));
    const extensionDays = Math.ceil((extendedDeadline - originalDeadline) / (1000 * 60 * 60 * 24));

    paths.push({
      pathId: 'extend_deadline',
      title: 'Extend Goal Deadline',
      description: `Extend the deadline to ${extendedDeadline.toLocaleDateString()} while maintaining your current contribution pace.`,
      type: 'deadline_extension',
      viability: 'high', // Usually most viable
      changes: {
        currentMonthlyContribution: currentCapacity,
        requiredMonthlyContribution: currentCapacity,
        increaseAmount: 0,
        increasePercentage: 0,
        newDeadline: extendedDeadline,
        extensionDays,
        extensionMonths: Math.ceil(extensionDays / 30),
        targetAmount
      },
      impact: {
        timeToCompletion: `${Math.ceil(monthsNeeded)} months`,
        totalAdditionalContributions: 0,
        effortLevel: 'low'
      },
      pros: [
        'No increase in monthly contributions needed',
        'Maintains sustainable contribution pace',
        'Reduces financial pressure',
        trend.direction === 'stable' || trend.direction === 'improving' ? 'Aligns with current contribution trend' : null
      ].filter(Boolean),
      cons: [
        `Delays goal completion by ${Math.ceil(extensionDays / 30)} months`,
        'Original deadline not met',
        'May affect other financial goals'
      ]
    });

    // Path 3: Hybrid approach (moderate increase + moderate extension)
    if (daysToDeadline > 0) {
      const hybridExtensionDays = Math.floor(extensionDays * 0.5); // Extend by 50% of needed extension
      const hybridDeadline = new Date(originalDeadline);
      hybridDeadline.setDate(hybridDeadline.getDate() + hybridExtensionDays);
      
      const daysToHybridDeadline = Math.floor((hybridDeadline - new Date()) / (1000 * 60 * 60 * 24));
      const monthsToHybridDeadline = daysToHybridDeadline / 30;
      
      const hybridRequiredMonthly = monthsToHybridDeadline > 0 
        ? remainingAmount / monthsToHybridDeadline 
        : remainingAmount;
      const hybridIncreaseAmount = hybridRequiredMonthly - currentCapacity;
      const hybridIncreasePercentage = currentCapacity > 0 
        ? (hybridIncreaseAmount / currentCapacity) * 100 
        : 0;

      if (hybridIncreasePercentage > 0 && hybridIncreasePercentage < increasePercentage) {
        paths.push({
          pathId: 'hybrid_approach',
          title: 'Balanced Approach',
          description: `Moderate increase in contributions plus reasonable deadline extension to ${hybridDeadline.toLocaleDateString()}.`,
          type: 'hybrid',
          viability: this.assessViability(hybridIncreasePercentage, trend),
          changes: {
            currentMonthlyContribution: currentCapacity,
            requiredMonthlyContribution: hybridRequiredMonthly,
            increaseAmount: hybridIncreaseAmount,
            increasePercentage: Math.round(hybridIncreasePercentage),
            newDeadline: hybridDeadline,
            extensionDays: hybridExtensionDays,
            extensionMonths: Math.ceil(hybridExtensionDays / 30),
            targetAmount
          },
          impact: {
            timeToCompletion: `${Math.ceil(monthsToHybridDeadline)} months`,
            totalAdditionalContributions: hybridIncreaseAmount * monthsToHybridDeadline,
            effortLevel: this.getEffortLevel(hybridIncreasePercentage)
          },
          pros: [
            'Balanced compromise between time and money',
            `Only ${Math.round(hybridIncreasePercentage)}% increase needed`,
            `Shorter extension (${Math.ceil(hybridExtensionDays / 30)} months vs ${Math.ceil(extensionDays / 30)} months)`,
            'More achievable than full contribution increase'
          ],
          cons: [
            'Still requires some contribution increase',
            'Still extends original deadline',
            'Requires commitment to both changes'
          ]
        });
      }
    }

    // Path 4: Reduce target amount (if feasible)
    if (remainingAmount > targetAmount * 0.2) { // Only if >20% remaining
      const reducedTarget = currentAmount + (remainingAmount * 0.8); // Reduce remaining by 20%
      const monthsToReducedTarget = currentCapacity > 0 ? (reducedTarget - currentAmount) / currentCapacity : 999;
      const reducedTargetDeadline = new Date();
      reducedTargetDeadline.setDate(reducedTargetDeadline.getDate() + Math.ceil(monthsToReducedTarget * 30));

      paths.push({
        pathId: 'reduce_target',
        title: 'Adjust Target Amount',
        description: `Reduce target amount to $${reducedTarget.toFixed(2)} to make goal more achievable with current capacity.`,
        type: 'target_reduction',
        viability: 'medium',
        changes: {
          currentMonthlyContribution: currentCapacity,
          requiredMonthlyContribution: currentCapacity,
          increaseAmount: 0,
          increasePercentage: 0,
          newDeadline: reducedTargetDeadline <= originalDeadline ? originalDeadline : reducedTargetDeadline,
          targetAmount: reducedTarget,
          targetReduction: targetAmount - reducedTarget,
          targetReductionPercentage: Math.round(((targetAmount - reducedTarget) / targetAmount) * 100)
        },
        impact: {
          timeToCompletion: reducedTargetDeadline <= originalDeadline 
            ? `${Math.ceil((originalDeadline - new Date()) / (1000 * 60 * 60 * 24 * 30))} months` 
            : `${Math.ceil(monthsToReducedTarget)} months`,
          totalAdditionalContributions: 0,
          effortLevel: 'low'
        },
        pros: [
          'No increase in contributions needed',
          'More realistic goal based on current capacity',
          'Reduces financial stress',
          'Likely to meet adjusted target'
        ],
        cons: [
          `Reduces target by $${(targetAmount - reducedTarget).toFixed(2)}`,
          'May not fully meet original goal objective',
          'Requires acceptance of lower target'
        ]
      });
    }

    return paths;
  }

  /**
   * Assess viability of a path based on contribution increase and trend
   */
  assessViability(increasePercentage, trend) {
    if (increasePercentage <= 15) return 'high';
    if (increasePercentage <= 30) return trend.direction === 'improving' ? 'high' : 'medium';
    if (increasePercentage <= 50) return trend.direction === 'improving' ? 'medium' : 'low';
    return 'low';
  }

  /**
   * Get effort level descriptor
   */
  getEffortLevel(increasePercentage) {
    if (increasePercentage <= 0) return 'none';
    if (increasePercentage <= 15) return 'low';
    if (increasePercentage <= 30) return 'moderate';
    if (increasePercentage <= 50) return 'high';
    return 'very_high';
  }

  /**
   * Select best recommendation based on viability and trend
   */
  selectBestRecommendation(paths, trend) {
    // Priority: high viability paths, considering trend
    const highViabilityPaths = paths.filter(p => p.viability === 'high');
    
    if (highViabilityPaths.length > 0) {
      // If improving trend, prefer contribution increase
      // If declining/stable, prefer deadline extension or hybrid
      if (trend.direction === 'improving') {
        return highViabilityPaths.find(p => p.type === 'contribution_increase') || highViabilityPaths[0];
      } else {
        return highViabilityPaths.find(p => p.type === 'hybrid') || 
               highViabilityPaths.find(p => p.type === 'deadline_extension') || 
               highViabilityPaths[0];
      }
    }

    // Fallback to deadline extension (usually most viable)
    return paths.find(p => p.type === 'deadline_extension') || paths[0];
  }

  /**
   * Calculate confidence level of projection
   */
  calculateConfidenceLevel(capacityAnalysis) {
    const { trend, capacity } = capacityAnalysis;
    
    // High confidence if stable/improving trend with consistent contributions
    const variance = this.calculateVariance([
      capacity.recent30DayAvg,
      capacity.medium60DayAvg,
      capacity.extended90DayAvg
    ]);

    if (trend.direction === 'stable' && variance < 20) return 'high';
    if (trend.direction === 'improving' && variance < 30) return 'high';
    if (trend.direction === 'stable' || (trend.direction === 'improving' && variance < 40)) return 'medium';
    return 'low';
  }

  /**
   * Calculate variance between values
   */
  calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Project completion date based on current capacity
   */
  projectCompletionDate(remainingAmount, monthlyCapacity) {
    if (monthlyCapacity <= 0) {
      // If no contributions, project far future
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 10);
      return farFuture;
    }

    const monthsNeeded = remainingAmount / monthlyCapacity;
    const daysNeeded = Math.ceil(monthsNeeded * 30);
    
    const projectedDate = new Date();
    projectedDate.setDate(projectedDate.getDate() + daysNeeded);
    
    return projectedDate;
  }

  /**
   * Get contributions within a time window (days)
   */
  async getContributionsInWindow(goalId, days) {
    try {
      const windowStart = new Date();
      windowStart.setDate(windowStart.getDate() - days);

      const contributions = await db
        .select()
        .from(goalContributions)
        .where(
          and(
            eq(goalContributions.goalId, goalId),
            gte(goalContributions.contributedAt, windowStart)
          )
        )
        .orderBy(desc(goalContributions.contributedAt));

      return contributions;
    } catch (error) {
      console.error(`Error fetching contributions for window ${days}:`, error);
      return [];
    }
  }

  /**
   * Get all contributions for a goal
   */
  async getAllContributions(goalId) {
    try {
      const contributions = await db
        .select()
        .from(goalContributions)
        .where(eq(goalContributions.goalId, goalId))
        .orderBy(desc(goalContributions.contributedAt));

      return contributions;
    } catch (error) {
      console.error(`Error fetching all contributions:`, error);
      return [];
    }
  }

  /**
   * Calculate monthly average from contributions
   */
  calculateMonthlyAverage(contributions, days) {
    if (contributions.length === 0) return 0;

    const total = contributions.reduce((sum, contrib) => {
      return sum + parseFloat(contrib.amount || 0);
    }, 0);

    // Convert to monthly average
    const months = days / 30;
    return months > 0 ? total / months : total;
  }

  /**
   * Detect trend in contribution capacity
   */
  detectTrend(capacity) {
    const { recent30DayAvg, medium60DayAvg, extended90DayAvg } = capacity;

    // Calculate percentage changes
    const recentVsMedium = medium60DayAvg > 0 
      ? ((recent30DayAvg - medium60DayAvg) / medium60DayAvg) * 100 
      : 0;
    
    const mediumVsExtended = extended90DayAvg > 0 
      ? ((medium60DayAvg - extended90DayAvg) / extended90DayAvg) * 100 
      : 0;

    let direction = 'stable';
    let strength = 'weak';

    // Determine direction
    if (recentVsMedium > 10 && mediumVsExtended > 10) {
      direction = 'improving';
      strength = 'strong';
    } else if (recentVsMedium > 5 || mediumVsExtended > 5) {
      direction = 'improving';
      strength = 'moderate';
    } else if (recentVsMedium < -10 && mediumVsExtended < -10) {
      direction = 'declining';
      strength = 'strong';
    } else if (recentVsMedium < -5 || mediumVsExtended < -5) {
      direction = 'declining';
      strength = 'moderate';
    }

    return {
      direction,
      strength,
      recentVsMediumChange: Math.round(recentVsMedium),
      mediumVsExtendedChange: Math.round(mediumVsExtended)
    };
  }

  /**
   * Calculate weighted current capacity (more weight to recent data)
   */
  calculateWeightedCapacity(capacity) {
    const { recent30DayAvg, medium60DayAvg, extended90DayAvg } = capacity;

    // Weights: 50% recent, 30% medium, 20% extended
    const weighted = (recent30DayAvg * 0.5) + (medium60DayAvg * 0.3) + (extended90DayAvg * 0.2);

    return Math.max(0, weighted);
  }

  /**
   * Get days since goal started
   */
  getDaysSinceStart(goal) {
    const startDate = goal.startedAt ? new Date(goal.startedAt) : new Date(goal.createdAt);
    const now = new Date();
    const days = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    return Math.max(1, days); // At least 1 day
  }

  /**
   * Get goal details
   */
  async getGoalDetails(goalId) {
    try {
      const [goal] = await db
        .select()
        .from(financialGoals)
        .where(eq(financialGoals.id, goalId));

      return goal || null;
    } catch (error) {
      console.error(`Error fetching goal details:`, error);
      return null;
    }
  }

  /**
   * Accept a reforecast path and update goal
   */
  async acceptReforecastPath(goalId, userId, pathId, pathData) {
    try {
      const goal = await this.getGoalDetails(goalId);
      if (!goal) {
        throw new Error('Goal not found');
      }

      const updates = {};

      // Apply changes based on path type
      if (pathData.changes.newDeadline) {
        updates.targetDate = pathData.changes.newDeadline;
      }

      if (pathData.changes.targetAmount && pathData.changes.targetAmount !== parseFloat(goal.targetAmount)) {
        updates.targetAmount = pathData.changes.targetAmount.toString();
      }

      // Add metadata about the reforecast
      const metadata = goal.customProperties || {};
      metadata.lastReforecast = {
        date: new Date().toISOString(),
        pathId,
        pathType: pathData.type,
        previousDeadline: goal.targetDate,
        previousTarget: goal.targetAmount,
        reason: pathData.description
      };
      updates.customProperties = metadata;

      // Update the goal
      const [updatedGoal] = await db
        .update(financialGoals)
        .set(updates)
        .where(eq(financialGoals.id, goalId))
        .returning();

      return {
        success: true,
        goal: updatedGoal,
        appliedPath: pathData
      };
    } catch (error) {
      console.error(`Error accepting reforecast path:`, error);
      throw error;
    }
  }
}

export default new DeadlineReforecastService();
