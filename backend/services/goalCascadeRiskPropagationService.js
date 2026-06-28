import db from '../config/db.js';
import { and, eq, desc, sql } from 'drizzle-orm';
import { goals } from '../db/schema.js';
import {
  goalDependencies,
  goalCascadeAnalyses,
  cascadedGoalImpacts,
  cascadeMitigationStrategies,
  cascadeDetectionTriggers,
  cascadeNotificationQueue,
} from '../db/schema-goal-cascade.js';

/**
 * Goal Cascade Risk Propagation Service - Issue #731
 * 
 * Manages goal dependencies and propagates timeline/funding impacts
 * when upstream goals slip, providing automated mitigation strategies.
 */
class GoalCascadeRiskPropagationService {
  constructor() {
    this.MAX_PROPAGATION_DEPTH = 5; // Prevent infinite loops
    this.RISK_THRESHOLDS = {
      low: { maxDays: 7, maxGoals: 2 },
      medium: { maxDays: 30, maxGoals: 5 },
      high: { maxDays: 90, maxGoals: 10 },
      severe: { maxDays: 180, maxGoals: 15 },
    };
  }

  /**
   * Convert Drizzle decimal/numeric to Number safely
   */
  _toNumber(value, fallback = 0) {
    if (value === null || value === undefined) return fallback;
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  /**
   * Create or update a goal dependency
   */
  async createGoalDependency({
    tenantId,
    userId,
    upstreamGoalId,
    downstreamGoalId,
    dependencyType = 'sequential',
    requiredProgress = 100.0,
    fundingImpact = 0.0,
    isBlocking = true,
    allowParallelProgress = false,
    relationshipReason = null,
    createdBy = 'user',
    strength = 'hard',
  }) {
    // Validate no circular dependencies
    const hasCircularDep = await this._detectCircularDependency(upstreamGoalId, downstreamGoalId, userId);
    if (hasCircularDep) {
      throw new Error('Circular dependency detected: Cannot create this dependency');
    }

    const [dependency] = await db
      .insert(goalDependencies)
      .values({
        tenantId,
        userId,
        upstreamGoalId,
        downstreamGoalId,
        dependencyType,
        requiredProgress: String(requiredProgress),
        fundingImpact: String(fundingImpact),
        isBlocking,
        allowParallelProgress,
        relationshipReason,
        createdBy,
        strength,
        isActive: true,
      })
      .returning();

    return dependency;
  }

  /**
   * Detect circular dependencies in the dependency graph
   */
  async _detectCircularDependency(upstreamGoalId, downstreamGoalId, userId) {
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = async (currentGoalId) => {
      visited.add(currentGoalId);
      recursionStack.add(currentGoalId);

      // Get all goals that the current goal depends on
      const dependencies = await db.query.goalDependencies.findMany({
        where: and(
          eq(goalDependencies.downstreamGoalId, currentGoalId),
          eq(goalDependencies.userId, userId),
          eq(goalDependencies.isActive, true)
        ),
      });

      for (const dep of dependencies) {
        const nextGoalId = dep.upstreamGoalId;

        if (!visited.has(nextGoalId)) {
          if (await hasCycle(nextGoalId)) {
            return true;
          }
        } else if (recursionStack.has(nextGoalId)) {
          return true; // Cycle detected
        }
      }

      recursionStack.delete(currentGoalId);
      return false;
    };

    // Check if adding this dependency would create a cycle
    // by checking if upstreamGoalId depends on downstreamGoalId
    return await hasCycle(downstreamGoalId);
  }

  /**
   * Get all dependencies for a user's goals
   */
  async getUserGoalDependencies(userId, { includeInactive = false } = {}) {
    const conditions = [eq(goalDependencies.userId, userId)];
    if (!includeInactive) {
      conditions.push(eq(goalDependencies.isActive, true));
    }

    const dependencies = await db.query.goalDependencies.findMany({
      where: and(...conditions),
      with: {
        upstreamGoal: true,
        downstreamGoal: true,
      },
    });

    return dependencies;
  }

  /**
   * Detect if a goal has slipped based on contribution trends
   */
  async detectGoalSlippage(goalId, userId) {
    const goal = await db.query.goals.findFirst({
      where: and(eq(goals.id, goalId), eq(goals.userId, userId)),
    });

    if (!goal) {
      throw new Error('Goal not found');
    }

    const targetAmount = this._toNumber(goal.targetAmount, 0);
    const currentAmount = this._toNumber(goal.currentAmount, 0);
    const deadline = new Date(goal.deadline);
    const now = new Date();
    const startDate = new Date(goal.startDate);

    // Calculate expected vs actual progress
    const totalDuration = deadline.getTime() - startDate.getTime();
    const elapsed = now.getTime() - startDate.getTime();
    const remaining = deadline.getTime() - now.getTime();

    const expectedProgress = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
    const actualProgress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
    const progressGap = expectedProgress - actualProgress;

    // Determine if goal is slipping
    const isSlipping = progressGap > 10; // More than 10% behind schedule
    const daysToDeadline = Math.ceil(remaining / (1000 * 60 * 60 * 24));
    const isAtRisk = daysToDeadline < 30 && progressGap > 5;

    // Calculate severity
    let severity = 'low';
    if (progressGap > 50 || daysToDeadline < 0) {
      severity = 'critical';
    } else if (progressGap > 30 || daysToDeadline < 7) {
      severity = 'high';
    } else if (progressGap > 15 || daysToDeadline < 30) {
      severity = 'medium';
    }

    return {
      goalId,
      isSlipping,
      isAtRisk,
      severity,
      expectedProgress: Number(expectedProgress.toFixed(2)),
      actualProgress: Number(actualProgress.toFixed(2)),
      progressGap: Number(progressGap.toFixed(2)),
      daysToDeadline,
      remainingAmount: targetAmount - currentAmount,
    };
  }

  /**
   * Run cascade analysis when a goal slips
   */
  async analyzeCascadeImpact({
    tenantId,
    userId,
    triggerGoalId,
    triggerEvent,
    maxDepth = 3,
  }) {
    // Detect slippage details
    const slippage = await this.detectGoalSlippage(triggerGoalId, userId);

    // Find all downstream goals affected
    const affectedGoals = await this._findAffectedGoals(triggerGoalId, userId, maxDepth);

    // Calculate impacts for each affected goal
    const impacts = [];
    let totalDeadlineSlip = 0;
    let maxDeadlineSlip = 0;
    let totalFundingGap = 0;

    for (const affected of affectedGoals) {
      const impact = await this._calculateGoalImpact(
        triggerGoalId,
        affected.goalId,
        affected.depth,
        affected.path,
        slippage
      );

      impacts.push(impact);
      totalDeadlineSlip += impact.deadlineSlipDays;
      maxDeadlineSlip = Math.max(maxDeadlineSlip, impact.deadlineSlipDays);
      totalFundingGap += this._toNumber(impact.contributionChangeDelta, 0);
    }

    // Calculate risk score
    const riskScore = this._calculateCascadeRiskScore(impacts, slippage);
    const riskLevel = this._determineRiskLevel(riskScore, impacts.length, maxDeadlineSlip);

    // Build impact graph
    const impactGraph = this._buildImpactGraph(triggerGoalId, impacts);

    // Create cascade analysis record
    const [analysis] = await db
      .insert(goalCascadeAnalyses)
      .values({
        tenantId,
        userId,
        triggerGoalId,
        triggerEvent,
        triggerSeverity: slippage.severity,
        analysisDepth: maxDepth,
        totalAffectedGoals: affectedGoals.length,
        directAffectedCount: affectedGoals.filter((g) => g.depth === 1).length,
        indirectAffectedCount: affectedGoals.filter((g) => g.depth > 1).length,
        totalDeadlineSlipDays: totalDeadlineSlip,
        maxDeadlineSlipDays: maxDeadlineSlip,
        totalFundingGapAmount: String(totalFundingGap),
        cascadeRiskScore: riskScore,
        riskLevel,
        criticalPathsAffected: impacts.filter((i) => i.impactLevel === 'severe' || i.impactLevel === 'high').length,
        mitigationStrategiesCount: 0, // Will update after generating mitigations
        autoResolvable: false,
        requiresUserIntervention: true,
        impactGraph,
        affectedGoalsDetails: impacts.map((i) => ({
          goalId: i.affectedGoalId,
          impact: i.impactLevel,
          deadlineSlipDays: i.deadlineSlipDays,
          newDeadline: i.revisedDeadline,
        })),
        cascadePath: affectedGoals.map((g) => ({
          goalId: g.goalId,
          depth: g.depth,
          path: g.path,
        })),
        analysisStatus: 'completed',
      })
      .returning();

    // Store detailed impacts
    for (const impact of impacts) {
      await db.insert(cascadedGoalImpacts).values({
        ...impact,
        cascadeAnalysisId: analysis.id,
        tenantId,
        userId,
      });
    }

    // Generate mitigation strategies
    const mitigations = await this._generateMitigationStrategies(analysis, impacts);

    // Update analysis with mitigation count
    await db
      .update(goalCascadeAnalyses)
      .set({
        mitigationStrategiesCount: mitigations.length,
        autoResolvable: mitigations.some((m) => m.implementationDifficulty === 'easy'),
      })
      .where(eq(goalCascadeAnalyses.id, analysis.id));

    // Queue user notification
    await this._queueCascadeNotification(analysis, impacts, mitigations);

    return {
      analysis,
      impacts,
      mitigations,
      summary: {
        totalAffectedGoals: affectedGoals.length,
        riskLevel,
        riskScore,
        maxDeadlineSlipDays: maxDeadlineSlip,
        totalFundingGap,
        recommendedActions: mitigations.filter((m) => m.isPrimaryRecommendation).length,
      },
    };
  }

  /**
   * Find all downstream goals affected by a slipping upstream goal
   */
  async _findAffectedGoals(goalId, userId, maxDepth) {
    const affected = [];
    const visited = new Set();

    const traverse = async (currentGoalId, depth, path) => {
      if (depth > maxDepth || visited.has(currentGoalId)) {
        return;
      }

      visited.add(currentGoalId);

      // Find direct dependents
      const dependents = await db.query.goalDependencies.findMany({
        where: and(
          eq(goalDependencies.upstreamGoalId, currentGoalId),
          eq(goalDependencies.userId, userId),
          eq(goalDependencies.isActive, true)
        ),
      });

      for (const dep of dependents) {
        const downstreamGoalId = dep.downstreamGoalId;
        const newPath = [...path, { goalId: downstreamGoalId, relationship: dep.dependencyType }];

        affected.push({
          goalId: downstreamGoalId,
          depth,
          path: newPath,
          dependency: dep,
        });

        // Recurse to find indirect dependents
        await traverse(downstreamGoalId, depth + 1, newPath);
      }
    };

    await traverse(goalId, 1, [{ goalId, relationship: 'trigger' }]);
    return affected;
  }

  /**
   * Calculate impact on a specific downstream goal
   */
  async _calculateGoalImpact(triggerGoalId, affectedGoalId, depth, path, slippage) {
    const goal = await db.query.goals.findFirst({
      where: eq(goals.id, affectedGoalId),
    });

    if (!goal) {
      throw new Error(`Goal ${affectedGoalId} not found`);
    }

    const originalDeadline = new Date(goal.deadline);
    const targetAmount = this._toNumber(goal.targetAmount, 0);
    const currentAmount = this._toNumber(goal.currentAmount, 0);
    const remainingAmount = targetAmount - currentAmount;

    // Calculate deadline slip (proportional to trigger slippage and depth)
    const baseSlipDays = Math.max(slippage.progressGap * 3, Math.abs(slippage.daysToDeadline) * 0.5);
    const depthMultiplier = 1 / Math.pow(1.5, depth - 1); // Reduce impact with depth
    const deadlineSlipDays = Math.ceil(baseSlipDays * depthMultiplier);

    const revisedDeadline = new Date(originalDeadline);
    revisedDeadline.setDate(revisedDeadline.getDate() + deadlineSlipDays);

    // Calculate funding impact
    const monthsToDeadline = Math.max(
      (revisedDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30),
      1
    );
    const originalMonthlyContribution = remainingAmount / monthsToDeadline;
    const revisedMonthlyContribution = originalMonthlyContribution * 0.85; // Reduced due to competing priorities
    const contributionDelta = revisedMonthlyContribution - originalMonthlyContribution;

    // Determine impact level
    let impactLevel = 'low';
    if (deadlineSlipDays > 90 || Math.abs(contributionDelta) > 500) {
      impactLevel = 'severe';
    } else if (deadlineSlipDays > 30 || Math.abs(contributionDelta) > 200) {
      impactLevel = 'high';
    } else if (deadlineSlipDays > 14 || Math.abs(contributionDelta) > 100) {
      impactLevel = 'medium';
    }

    // Feasibility assessment
    const remainsFeasible = deadlineSlipDays < 180 && revisedMonthlyContribution > 0;
    const feasibilityScore = remainsFeasible ? Math.max(100 - deadlineSlipDays / 2, 0) : 0;

    // Build explanation
    const pathDescriptor = path.map((p) => `${p.relationship}`).join(' → ');
    const impactReason = `This goal is impacted because it depends on the upstream goal that has slipped by ${Math.round(slippage.progressGap)}%. The delay propagates through ${depth} level(s) of dependencies: ${pathDescriptor}.`;

    return {
      affectedGoalId,
      impactLevel,
      propagationDepth: depth,
      originalDeadline,
      revisedDeadline,
      deadlineSlipDays,
      deadlineSlipPercentage: String(((deadlineSlipDays / 365) * 100).toFixed(2)),
      originalMonthlyContribution: String(originalMonthlyContribution.toFixed(2)),
      revisedMonthlyContribution: String(revisedMonthlyContribution.toFixed(2)),
      contributionChangeDelta: String(contributionDelta.toFixed(2)),
      contributionChangePercentage: String(
        originalMonthlyContribution > 0 ? ((contributionDelta / originalMonthlyContribution) * 100).toFixed(2) : '0.00'
      ),
      remainsFeasible,
      feasibilityScore: String(feasibilityScore.toFixed(2)),
      conflictingGoalsCount: 0, // TODO: Calculate from other active goals
      impactReason,
      propagationChain: path,
      hasMitigation: false,
      mitigationApplied: false,
    };
  }

  /**
   * Calculate overall cascade risk score (0-100)
   */
  _calculateCascadeRiskScore(impacts, slippage) {
    let score = 0;

    // Base score from trigger severity
    const severityScores = { low: 20, medium: 40, high: 60, critical: 80 };
    score += severityScores[slippage.severity] || 20;

    // Add score for number of affected goals
    score += Math.min(impacts.length * 2, 20);

    // Add score for impact severity
    const severeCount = impacts.filter((i) => i.impactLevel === 'severe').length;
    const highCount = impacts.filter((i) => i.impactLevel === 'high').length;
    score += severeCount * 10 + highCount * 5;

    // Cap at 100
    return Math.min(Math.round(score), 100);
  }

  /**
   * Determine risk level from score and metrics
   */
  _determineRiskLevel(score, affectedCount, maxSlipDays) {
    if (score >= 80 || affectedCount >= 15 || maxSlipDays >= 180) {
      return 'severe';
    } else if (score >= 60 || affectedCount >= 10 || maxSlipDays >= 90) {
      return 'high';
    } else if (score >= 40 || affectedCount >= 5 || maxSlipDays >= 30) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Build impact graph for visualization
   */
  _buildImpactGraph(triggerGoalId, impacts) {
    const nodes = [{ id: triggerGoalId, type: 'trigger', label: 'Trigger Goal' }];
    const edges = [];

    for (const impact of impacts) {
      nodes.push({
        id: impact.affectedGoalId,
        type: 'affected',
        impactLevel: impact.impactLevel,
        deadlineSlip: impact.deadlineSlipDays,
      });

      // Add edges from propagation chain
      if (impact.propagationChain && impact.propagationChain.length > 1) {
        for (let i = 0; i < impact.propagationChain.length - 1; i++) {
          const from = impact.propagationChain[i].goalId;
          const to = impact.propagationChain[i + 1].goalId;
          edges.push({
            from,
            to,
            relationship: impact.propagationChain[i + 1].relationship,
          });
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Generate mitigation strategies for cascade impacts
   */
  async _generateMitigationStrategies(analysis, impacts) {
    const strategies = [];
    const triggerGoalId = analysis.triggerGoalId;

    // Strategy 1: Extend Deadlines (bulk)
    if (impacts.length > 0) {
      const avgSlipDays = Math.round(
        impacts.reduce((sum, i) => sum + i.deadlineSlipDays, 0) / impacts.length
      );

      strategies.push({
        cascadeAnalysisId: analysis.id,
        strategyType: 'extend_deadline',
        strategyTitle: 'Extend All Affected Goal Deadlines',
        strategyDescription: `Automatically extend deadlines for all ${impacts.length} affected goals by an average of ${avgSlipDays} days to align with the upstream delay.`,
        requiredActions: impacts.map((i) => ({
          action: 'extend_deadline',
          goalId: i.affectedGoalId,
          parameter: 'deadline',
          value: i.revisedDeadline,
          originalValue: i.originalDeadline,
        })),
        affectedGoals: impacts.map((i) => ({
          goalId: i.affectedGoalId,
          changeType: 'deadline',
          oldValue: i.originalDeadline,
          newValue: i.revisedDeadline,
        })),
        resolvesSeverity: 'full',
        reducesRiskBy: String(60),
        estimatedRecoveryDays: avgSlipDays,
        implementationDifficulty: 'easy',
        budgetImpact: String(0),
        tradeoffs: [
          {
            description: 'All goals will take longer to achieve',
            severity: 'medium',
          },
          {
            description: 'May impact long-term financial planning',
            severity: 'low',
          },
        ],
        recommendationScore: String(85),
        isPrimaryRecommendation: true,
        isApplied: false,
        isActive: true,
      });
    }

    // Strategy 2: Increase Funding to Trigger Goal
    strategies.push({
      cascadeAnalysisId: analysis.id,
      strategyType: 'increase_funding',
      strategyTitle: 'Increase Contributions to Upstream Goal',
      strategyDescription: `Boost monthly contributions to the slipping upstream goal to get it back on track, preventing cascade to dependent goals.`,
      requiredActions: [
        {
          action: 'increase_contribution',
          goalId: triggerGoalId,
          parameter: 'monthly_contribution',
          value: 'calculated_increase',
        },
      ],
      affectedGoals: [
        {
          goalId: triggerGoalId,
          changeType: 'contribution',
          oldValue: 'current',
          newValue: 'increased',
        },
      ],
      resolvesSeverity: 'full',
      reducesRiskBy: String(75),
      estimatedRecoveryDays: 30,
      implementationDifficulty: 'medium',
      budgetImpact: String(200), // Estimate
      tradeoffs: [
        {
          description: 'Requires freeing up budget from other areas',
          severity: 'high',
        },
        {
          description: 'May reduce discretionary spending',
          severity: 'medium',
        },
      ],
      recommendationScore: String(70),
      isPrimaryRecommendation: false,
      isApplied: false,
      isActive: true,
    });

    // Strategy 3: Reprioritize Goals
    if (impacts.length >= 3) {
      strategies.push({
        cascadeAnalysisId: analysis.id,
        strategyType: 'reprioritize',
        strategyTitle: 'Reprioritize Goal Sequence',
        strategyDescription: `Pause or deprioritize some lower-priority affected goals to focus resources on critical path goals.`,
        requiredActions: impacts
          .filter((i) => i.impactLevel === 'low' || i.impactLevel === 'medium')
          .slice(0, 3)
          .map((i) => ({
            action: 'reduce_priority',
            goalId: i.affectedGoalId,
            parameter: 'priority',
            value: 'paused',
          })),
        affectedGoals: impacts
          .filter((i) => i.impactLevel === 'low' || i.impactLevel === 'medium')
          .slice(0, 3)
          .map((i) => ({
            goalId: i.affectedGoalId,
            changeType: 'status',
            oldValue: 'active',
            newValue: 'paused',
          })),
        resolvesSeverity: 'partial',
        reducesRiskBy: String(40),
        estimatedRecoveryDays: 0,
        implementationDifficulty: 'easy',
        budgetImpact: String(0),
        tradeoffs: [
          {
            description: 'Some goals will be delayed indefinitely',
            severity: 'high',
          },
          {
            description: 'Requires manual re-evaluation later',
            severity: 'low',
          },
        ],
        recommendationScore: String(55),
        isPrimaryRecommendation: false,
        isApplied: false,
        isActive: true,
      });
    }

    // Strategy 4: Adjust Dependency Rules
    strategies.push({
      cascadeAnalysisId: analysis.id,
      strategyType: 'adjust_dependencies',
      strategyTitle: 'Relax Dependency Constraints',
      strategyDescription: `Allow some downstream goals to progress in parallel with the slipping upstream goal, reducing blocking effects.`,
      requiredActions: impacts.slice(0, 2).map((i) => ({
        action: 'enable_parallel_progress',
        goalId: i.affectedGoalId,
        parameter: 'allow_parallel_progress',
        value: true,
      })),
      affectedGoals: impacts.slice(0, 2).map((i) => ({
        goalId: i.affectedGoalId,
        changeType: 'dependency',
        oldValue: 'sequential',
        newValue: 'parallel',
      })),
      resolvesSeverity: 'partial',
      reducesRiskBy: String(50),
      estimatedRecoveryDays: 0,
      implementationDifficulty: 'medium',
      budgetImpact: String(0),
      tradeoffs: [
        {
          description: 'May violate original dependency logic',
          severity: 'medium',
        },
        {
          description: 'Could lead to sub-optimal goal sequencing',
          severity: 'low',
        },
      ],
      recommendationScore: String(65),
      isPrimaryRecommendation: false,
      isApplied: false,
      isActive: true,
    });

    // Insert all strategies
    const insertedStrategies = [];
    for (const strategy of strategies) {
      const [inserted] = await db
        .insert(cascadeMitigationStrategies)
        .values({
          ...strategy,
          tenantId: analysis.tenantId,
          userId: analysis.userId,
          requiredActions: JSON.stringify(strategy.requiredActions),
          affectedGoals: JSON.stringify(strategy.affectedGoals),
          tradeoffs: JSON.stringify(strategy.tradeoffs),
        })
        .returning();
      insertedStrategies.push(inserted);
    }

    return insertedStrategies;
  }

  /**
   * Queue notification for user about cascade event
   */
  async _queueCascadeNotification(analysis, impacts, mitigations) {
    const primaryMitigation = mitigations.find((m) => m.isPrimaryRecommendation);

    const title = `⚠️ ${impacts.length} Goal${impacts.length > 1 ? 's' : ''} Affected by Upstream Delay`;
    const message = `A goal has slipped and is impacting ${impacts.length} dependent goal${impacts.length > 1 ? 's' : ''}. Risk Level: ${analysis.riskLevel.toUpperCase()}. ${primaryMitigation ? `Recommended: ${primaryMitigation.strategyTitle}` : 'Review mitigation options.'}`;

    await db.insert(cascadeNotificationQueue).values({
      tenantId: analysis.tenantId,
      userId: analysis.userId,
      cascadeAnalysisId: analysis.id,
      notificationType: 'cascade_detected',
      priority: analysis.riskLevel === 'severe' || analysis.riskLevel === 'high' ? 'high' : 'medium',
      title,
      message,
      actionUrl: `/goals/cascade/${analysis.id}`,
      deliveryStatus: 'pending',
      deliverViaEmail: analysis.riskLevel === 'severe' || analysis.riskLevel === 'high',
      deliverViaPush: true,
      deliverViaInApp: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });
  }

  /**
   * Get cascade analysis details by ID
   */
  async getCascadeAnalysis(analysisId, userId) {
    const analysis = await db.query.goalCascadeAnalyses.findFirst({
      where: and(eq(goalCascadeAnalyses.id, analysisId), eq(goalCascadeAnalyses.userId, userId)),
    });

    if (!analysis) {
      throw new Error('Cascade analysis not found');
    }

    // Get impacts
    const impacts = await db.query.cascadedGoalImpacts.findMany({
      where: eq(cascadedGoalImpacts.cascadeAnalysisId, analysisId),
    });

    // Get mitigations
    const mitigations = await db.query.cascadeMitigationStrategies.findMany({
      where: and(
        eq(cascadeMitigationStrategies.cascadeAnalysisId, analysisId),
        eq(cascadeMitigationStrategies.isActive, true)
      ),
      orderBy: [desc(cascadeMitigationStrategies.recommendationScore)],
    });

    return {
      analysis,
      impacts,
      mitigations,
    };
  }

  /**
   * Apply a mitigation strategy
   */
  async applyMitigationStrategy(strategyId, userId) {
    const strategy = await db.query.cascadeMitigationStrategies.findFirst({
      where: and(
        eq(cascadeMitigationStrategies.id, strategyId),
        eq(cascadeMitigationStrategies.userId, userId)
      ),
    });

    if (!strategy) {
      throw new Error('Mitigation strategy not found');
    }

    if (strategy.isApplied) {
      throw new Error('Strategy already applied');
    }

    const requiredActions = JSON.parse(strategy.requiredActions || '[]');
    const results = [];

    // Execute each action
    for (const action of requiredActions) {
      try {
        switch (action.action) {
          case 'extend_deadline':
            await db
              .update(goals)
              .set({ deadline: new Date(action.value) })
              .where(and(eq(goals.id, action.goalId), eq(goals.userId, userId)));
            results.push({ goalId: action.goalId, success: true, action: 'extend_deadline' });
            break;

          case 'increase_contribution':
            // This would interact with goal contribution service
            results.push({ goalId: action.goalId, success: true, action: 'increase_contribution', note: 'Manual adjustment needed' });
            break;

          case 'reduce_priority':
            await db
              .update(goals)
              .set({ status: action.value })
              .where(and(eq(goals.id, action.goalId), eq(goals.userId, userId)));
            results.push({ goalId: action.goalId, success: true, action: 'reduce_priority' });
            break;

          case 'enable_parallel_progress':
            await db
              .update(goalDependencies)
              .set({ allowParallelProgress: action.value })
              .where(and(eq(goalDependencies.downstreamGoalId, action.goalId), eq(goalDependencies.userId, userId)));
            results.push({ goalId: action.goalId, success: true, action: 'enable_parallel_progress' });
            break;

          default:
            results.push({ goalId: action.goalId, success: false, action: action.action, error: 'Unknown action' });
        }
      } catch (error) {
        results.push({ goalId: action.goalId, success: false, action: action.action, error: error.message });
      }
    }

    // Mark strategy as applied
    await db
      .update(cascadeMitigationStrategies)
      .set({
        isApplied: true,
        appliedAt: new Date(),
        appliedBy: userId,
        applicationResult: JSON.stringify({ results }),
      })
      .where(eq(cascadeMitigationStrategies.id, strategyId));

    return {
      success: true,
      strategyId,
      results,
      appliedActions: results.filter((r) => r.success).length,
      failedActions: results.filter((r) => !r.success).length,
    };
  }

  /**
   * Get recent cascade analyses for a user
   */
  async getUserCascadeHistory(userId, { limit = 10, offset = 0 } = {}) {
    const analyses = await db.query.goalCascadeAnalyses.findMany({
      where: eq(goalCascadeAnalyses.userId, userId),
      orderBy: [desc(goalCascadeAnalyses.createdAt)],
      limit,
      offset,
    });

    return analyses;
  }
}

export default new GoalCascadeRiskPropagationService();
