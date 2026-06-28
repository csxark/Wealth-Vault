import db from '../config/db.js';
import { 
  financialGoals,
  goalProgressSnapshots,
  goalContributions,
  users
} from '../db/schema.js';
import { eq, and, desc, gte, inArray } from 'drizzle-orm';
import savingsVelocityOptimizer from './savingsVelocityOptimizer.js';

/**
 * Multi-Goal Conflict Resolver
 * Intelligent prioritization engine that resolves goal conflicts using urgency scoring,
 * financial health impact, and dependency mapping
 */
class MultiGoalConflictResolver {
  constructor() {
    this.priorityWeights = {
      urgency: 0.35,           // 35% - Deadline pressure and time sensitivity
      financialImpact: 0.25,   // 25% - Impact on financial health
      userPriority: 0.20,      // 20% - User-defined priority
      progress: 0.15,          // 15% - Current progress and momentum
      dependencies: 0.05       // 5% - Goal dependencies
    };
  }

  /**
   * Detect and resolve conflicts for all user goals
   */
  async resolveGoalConflicts(userId) {
    try {
      // Get all active goals
      const goals = await this.getAllActiveGoals(userId);

      if (goals.length === 0) {
        return {
          userId,
          hasConflicts: false,
          message: 'No active goals found'
        };
      }

      // Get user's financial capacity
      const [incomeAnalysis, debtObligations, expenseAnalysis] = await Promise.all([
        savingsVelocityOptimizer.analyzeIncomeTrajectory(userId),
        savingsVelocityOptimizer.calculateDebtObligations(userId),
        savingsVelocityOptimizer.calculateMonthlyExpenses(userId)
      ]);

      const financialCapacity = savingsVelocityOptimizer.calculateFinancialCapacity({
        income: incomeAnalysis,
        debt: debtObligations,
        expenses: expenseAnalysis
      });

      // Score all goals
      const scoredGoals = await Promise.all(
        goals.map(goal => this.scoreGoal(goal, userId, financialCapacity))
      );

      // Detect conflicts
      const conflicts = this.detectConflicts(scoredGoals, financialCapacity);

      // Generate prioritized ranking
      const rankedGoals = this.rankGoals(scoredGoals);

      // Generate allocation recommendations
      const allocation = this.generateAllocation(
        rankedGoals,
        financialCapacity,
        conflicts
      );

      // Generate impact simulation
      const impactSimulation = this.simulateImpact(allocation, financialCapacity);

      // Generate what-if scenarios
      const whatIfScenarios = this.generateWhatIfScenarios(
        rankedGoals,
        financialCapacity
      );

      return {
        userId,
        analysisDate: new Date(),
        hasConflicts: conflicts.detected,
        financialCapacity: {
          totalAvailable: financialCapacity.safeCapacity,
          targetSavings: financialCapacity.targetCapacity,
          aggressiveSavings: financialCapacity.aggressiveCapacity,
          debtToIncomeRatio: financialCapacity.debtToIncomeRatio
        },
        conflicts: conflicts.details,
        prioritizedGoals: rankedGoals,
        recommendedAllocation: allocation,
        impactSimulation,
        whatIfScenarios
      };
    } catch (error) {
      console.error('Error resolving goal conflicts:', error);
      throw error;
    }
  }

  /**
   * Get all active goals for a user
   */
  async getAllActiveGoals(userId) {
    try {
      const goals = await db
        .select()
        .from(financialGoals)
        .where(
          and(
            eq(financialGoals.userId, userId),
            inArray(financialGoals.status, ['active', 'planning', 'in_progress'])
          )
        );

      return goals;
    } catch (error) {
      console.error('Error fetching active goals:', error);
      return [];
    }
  }

  /**
   * Score a goal across multiple dimensions
   */
  async scoreGoal(goal, userId, financialCapacity) {
    const targetDate = new Date(goal.targetDate);
    const today = new Date();
    const daysRemaining = Math.max(0, Math.floor((targetDate - today) / (1000 * 60 * 60 * 24)));
    const monthsRemaining = daysRemaining / 30;
    
    const currentAmount = parseFloat(goal.currentAmount || 0);
    const targetAmount = parseFloat(goal.targetAmount);
    const remainingAmount = targetAmount - currentAmount;
    const progressPercentage = parseFloat(goal.progressPercentage || 0);

    // Get current contribution rate
    const currentContribution = await this.getCurrentMonthlyContribution(goal.id);

    // 1. Urgency Score (0-100)
    const urgencyScore = this.calculateUrgencyScore({
      daysRemaining,
      progressPercentage,
      currentContribution,
      remainingAmount,
      monthsRemaining
    });

    // 2. Financial Impact Score (0-100)
    const financialImpactScore = this.calculateFinancialImpactScore({
      goal,
      targetAmount,
      remainingAmount,
      monthsRemaining
    });

    // 3. User Priority Score (0-100)
    const userPriorityScore = this.normalizeUserPriority(goal.priority || 0, goal.importance || 50);

    // 4. Progress Score (0-100)
    const progressScore = this.calculateProgressScore({
      progressPercentage,
      currentContribution,
      monthsRemaining,
      remainingAmount
    });

    // 5. Dependency Score (0-100)
    const dependencyScore = this.calculateDependencyScore(goal);

    // Calculate weighted composite score
    const compositeScore = 
      (urgencyScore * this.priorityWeights.urgency) +
      (financialImpactScore * this.priorityWeights.financialImpact) +
      (userPriorityScore * this.priorityWeights.userPriority) +
      (progressScore * this.priorityWeights.progress) +
      (dependencyScore * this.priorityWeights.dependencies);

    // Calculate required monthly contribution
    const requiredMonthly = monthsRemaining > 0 ? remainingAmount / monthsRemaining : remainingAmount;

    return {
      goalId: goal.id,
      goalName: goal.goalName,
      category: goal.category,
      targetAmount,
      currentAmount,
      remainingAmount,
      targetDate: goal.targetDate,
      daysRemaining,
      monthsRemaining,
      progressPercentage,
      currentContribution,
      requiredMonthly,
      scores: {
        urgency: urgencyScore,
        financialImpact: financialImpactScore,
        userPriority: userPriorityScore,
        progress: progressScore,
        dependency: dependencyScore,
        composite: compositeScore
      },
      priority: goal.priority || 0,
      importance: goal.importance || 50,
      goalType: goal.goalType,
      status: goal.status
    };
  }

  /**
   * Calculate urgency score
   */
  calculateUrgencyScore({ daysRemaining, progressPercentage, currentContribution, remainingAmount, monthsRemaining }) {
    let score = 0;

    // Time pressure (0-40 points)
    if (daysRemaining <= 30) {
      score += 40;
    } else if (daysRemaining <= 90) {
      score += 35;
    } else if (daysRemaining <= 180) {
      score += 30;
    } else if (daysRemaining <= 365) {
      score += 20;
    } else if (daysRemaining <= 730) {
      score += 10;
    }

    // Progress vs time ratio (0-35 points)
    const timeElapsedPercentage = 100 - ((daysRemaining / (daysRemaining + 365)) * 100);
    const progressGap = timeElapsedPercentage - progressPercentage;
    
    if (progressGap > 40) {
      score += 35;
    } else if (progressGap > 25) {
      score += 28;
    } else if (progressGap > 15) {
      score += 20;
    } else if (progressGap > 5) {
      score += 12;
    }

    // Pace sustainability (0-25 points)
    const requiredMonthly = monthsRemaining > 0 ? remainingAmount / monthsRemaining : remainingAmount;
    const paceRatio = requiredMonthly > 0 ? currentContribution / requiredMonthly : 0;
    
    if (paceRatio < 0.5) {
      score += 25;
    } else if (paceRatio < 0.7) {
      score += 20;
    } else if (paceRatio < 0.9) {
      score += 15;
    } else if (paceRatio < 1.0) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Calculate financial impact score
   */
  calculateFinancialImpactScore({ goal, targetAmount, remainingAmount, monthsRemaining }) {
    let score = 0;

    // Goal type impact (0-30 points)
    const highImpactTypes = ['emergency_fund', 'debt_payoff', 'retirement', 'health'];
    const mediumImpactTypes = ['education', 'home', 'investment'];
    
    if (highImpactTypes.includes(goal.goalType)) {
      score += 30;
    } else if (mediumImpactTypes.includes(goal.goalType)) {
      score += 20;
    } else {
      score += 10;
    }

    // Amount significance (0-30 points)
    if (targetAmount >= 100000) {
      score += 30;
    } else if (targetAmount >= 50000) {
      score += 25;
    } else if (targetAmount >= 25000) {
      score += 20;
    } else if (targetAmount >= 10000) {
      score += 15;
    } else {
      score += 10;
    }

    // Monthly burden (0-25 points)
    const requiredMonthly = monthsRemaining > 0 ? remainingAmount / monthsRemaining : remainingAmount;
    if (requiredMonthly >= 2000) {
      score += 25;
    } else if (requiredMonthly >= 1000) {
      score += 20;
    } else if (requiredMonthly >= 500) {
      score += 15;
    } else {
      score += 10;
    }

    // Category priority (0-15 points)
    const essentialCategories = ['essential', 'needs', 'security'];
    if (essentialCategories.includes(goal.category?.toLowerCase())) {
      score += 15;
    } else {
      score += 8;
    }

    return Math.min(100, score);
  }

  /**
   * Normalize user priority (0-100)
   */
  normalizeUserPriority(priority, importance) {
    // Combine priority (0-10) and importance (0-100)
    const priorityScore = Math.min(10, priority || 0) * 5; // 0-50
    const importanceScore = Math.min(100, importance || 50) * 0.5; // 0-50
    
    return Math.min(100, priorityScore + importanceScore);
  }

  /**
   * Calculate progress score
   */
  calculateProgressScore({ progressPercentage, currentContribution, monthsRemaining, remainingAmount }) {
    let score = 0;

    // Current progress (0-40 points)
    if (progressPercentage >= 75) {
      score += 40;
    } else if (progressPercentage >= 50) {
      score += 35;
    } else if (progressPercentage >= 25) {
      score += 25;
    } else if (progressPercentage >= 10) {
      score += 15;
    }

    // Momentum (0-35 points)
    if (currentContribution > 0) {
      const requiredMonthly = monthsRemaining > 0 ? remainingAmount / monthsRemaining : remainingAmount;
      const momentumRatio = requiredMonthly > 0 ? currentContribution / requiredMonthly : 0;
      
      if (momentumRatio >= 1.2) {
        score += 35;
      } else if (momentumRatio >= 1.0) {
        score += 30;
      } else if (momentumRatio >= 0.8) {
        score += 22;
      } else if (momentumRatio >= 0.5) {
        score += 15;
      }
    }

    // Completion proximity (0-25 points)
    if (progressPercentage >= 90) {
      score += 25;
    } else if (progressPercentage >= 80) {
      score += 20;
    } else if (progressPercentage >= 70) {
      score += 15;
    }

    return Math.min(100, score);
  }

  /**
   * Calculate dependency score
   */
  calculateDependencyScore(goal) {
    // Check if goal has dependencies or is depended upon
    const metadata = goal.customProperties || {};
    const hasDependencies = metadata.dependencies?.length > 0;
    const isDependedUpon = metadata.dependedUpon?.length > 0;

    let score = 50; // Base score

    if (isDependedUpon) {
      score += 30; // Higher priority if other goals depend on this
    }

    if (hasDependencies) {
      score -= 20; // Lower priority if this depends on others
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Detect conflicts between goals
   */
  detectConflicts(scoredGoals, financialCapacity) {
    const conflicts = [];
    let totalRequired = 0;

    // Calculate total required funding
    scoredGoals.forEach(goal => {
      totalRequired += goal.requiredMonthly;
    });

    const availableCapacity = financialCapacity.safeCapacity;
    const hasCapacityConflict = totalRequired > availableCapacity;

    if (hasCapacityConflict) {
      conflicts.push({
        type: 'capacity_shortage',
        severity: totalRequired > availableCapacity * 1.5 ? 'critical' : totalRequired > availableCapacity * 1.2 ? 'high' : 'medium',
        description: 'Total required contributions exceed available savings capacity',
        details: {
          totalRequired,
          availableCapacity,
          shortfall: totalRequired - availableCapacity,
          utilizationRate: (totalRequired / availableCapacity) * 100
        }
      });
    }

    // Detect deadline conflicts (goals with same/similar deadlines)
    const deadlineGroups = this.groupByDeadline(scoredGoals);
    deadlineGroups.forEach(group => {
      if (group.goals.length > 1) {
        const totalGroupRequired = group.goals.reduce((sum, g) => sum + g.requiredMonthly, 0);
        
        conflicts.push({
          type: 'deadline_conflict',
          severity: totalGroupRequired > availableCapacity * 0.7 ? 'high' : 'medium',
          description: `${group.goals.length} goals competing for the same deadline period`,
          details: {
            deadlineRange: group.range,
            goalCount: group.goals.length,
            goals: group.goals.map(g => ({ id: g.goalId, name: g.goalName, required: g.requiredMonthly })),
            totalRequired: totalGroupRequired
          }
        });
      }
    });

    // Detect category conflicts (similar goal types competing)
    const categoryGroups = this.groupByCategory(scoredGoals);
    Object.entries(categoryGroups).forEach(([category, goals]) => {
      if (goals.length > 1) {
        const totalCategoryRequired = goals.reduce((sum, g) => sum + g.requiredMonthly, 0);
        
        if (totalCategoryRequired > availableCapacity * 0.5) {
          conflicts.push({
            type: 'category_conflict',
            severity: 'medium',
            description: `Multiple goals in '${category}' category competing for resources`,
            details: {
              category,
              goalCount: goals.length,
              goals: goals.map(g => ({ id: g.goalId, name: g.goalName, required: g.requiredMonthly })),
              totalRequired: totalCategoryRequired
            }
          });
        }
      }
    });

    return {
      detected: conflicts.length > 0,
      conflictCount: conflicts.length,
      details: conflicts
    };
  }

  /**
   * Rank goals by composite score
   */
  rankGoals(scoredGoals) {
    const ranked = [...scoredGoals].sort((a, b) => b.scores.composite - a.scores.composite);

    return ranked.map((goal, index) => ({
      rank: index + 1,
      ...goal,
      tier: index < ranked.length * 0.3 ? 'high' : index < ranked.length * 0.7 ? 'medium' : 'low'
    }));
  }

  /**
   * Generate allocation recommendations
   */
  generateAllocation(rankedGoals, financialCapacity, conflicts) {
    const availableCapacity = financialCapacity.safeCapacity;
    const allocations = [];
    let remainingCapacity = availableCapacity;
    let totalAllocated = 0;

    // Strategy: Allocate based on priority ranking and urgency
    for (const goal of rankedGoals) {
      const idealAllocation = goal.requiredMonthly;
      
      let allocation = 0;
      let allocationStrategy = '';
      let rationale = [];

      if (remainingCapacity >= idealAllocation) {
        // Full funding
        allocation = idealAllocation;
        allocationStrategy = 'full_funding';
        rationale.push('Sufficient capacity for full required contribution');
        rationale.push(`Rank #${goal.rank} priority`);
      } else if (remainingCapacity > 0) {
        // Partial funding based on tier and urgency
        if (goal.tier === 'high' && goal.scores.urgency > 70) {
          // High priority + urgent: allocate remaining capacity
          allocation = remainingCapacity;
          allocationStrategy = 'priority_partial';
          rationale.push('High priority and urgency - allocated remaining capacity');
        } else if (goal.tier === 'high') {
          // High priority but not urgent: allocate 70% of remaining
          allocation = Math.min(remainingCapacity, idealAllocation * 0.7);
          allocationStrategy = 'high_priority_partial';
          rationale.push('High priority - partial allocation (70% of required)');
        } else if (goal.tier === 'medium' && goal.scores.urgency > 60) {
          // Medium priority + somewhat urgent: allocate 50%
          allocation = Math.min(remainingCapacity, idealAllocation * 0.5);
          allocationStrategy = 'medium_priority_partial';
          rationale.push('Medium priority with urgency - partial allocation (50%)');
        } else {
          // Lower priority: minimal allocation or defer
          allocation = Math.min(remainingCapacity, idealAllocation * 0.3);
          allocationStrategy = 'minimal_allocation';
          rationale.push('Lower priority - minimal allocation to maintain momentum');
        }
      } else {
        // No capacity remaining
        allocation = 0;
        allocationStrategy = 'deferred';
        rationale.push('Insufficient capacity - recommend deferral or deadline extension');
      }

      remainingCapacity -= allocation;
      totalAllocated += allocation;

      // Add impact assessment
      const allocationRatio = idealAllocation > 0 ? (allocation / idealAllocation) * 100 : 0;
      const impact = this.assessAllocationImpact(goal, allocation, allocationRatio);

      allocations.push({
        goalId: goal.goalId,
        goalName: goal.goalName,
        rank: goal.rank,
        tier: goal.tier,
        requiredMonthly: idealAllocation,
        allocatedMonthly: allocation,
        allocationPercentage: allocationRatio,
        allocationStrategy,
        rationale,
        impact
      });
    }

    return {
      totalAvailableCapacity: availableCapacity,
      totalAllocated,
      remainingCapacity,
      utilizationRate: (totalAllocated / availableCapacity) * 100,
      allocations,
      resolutionStrategy: this.determineResolutionStrategy(allocations, conflicts)
    };
  }

  /**
   * Assess allocation impact
   */
  assessAllocationImpact(goal, allocation, allocationRatio) {
    const projectedMonthsToCompletion = allocation > 0 
      ? Math.ceil(goal.remainingAmount / allocation)
      : 999;

    const delayFromOriginal = projectedMonthsToCompletion - goal.monthsRemaining;

    return {
      projectedCompletion: this.addMonths(new Date(), projectedMonthsToCompletion),
      monthsToCompletion: projectedMonthsToCompletion,
      meetsOriginalDeadline: delayFromOriginal <= 0,
      delayMonths: Math.max(0, delayFromOriginal),
      completionConfidence: this.calculateCompletionConfidence(allocationRatio, goal.scores.urgency),
      recommendation: this.generateImpactRecommendation(allocationRatio, delayFromOriginal, goal)
    };
  }

  /**
   * Calculate completion confidence
   */
  calculateCompletionConfidence(allocationRatio, urgencyScore) {
    let confidence = 50; // Base confidence

    if (allocationRatio >= 100) {
      confidence += 40;
    } else if (allocationRatio >= 80) {
      confidence += 30;
    } else if (allocationRatio >= 60) {
      confidence += 20;
    } else if (allocationRatio >= 40) {
      confidence += 10;
    }

    // Adjust for urgency
    if (urgencyScore > 70 && allocationRatio < 80) {
      confidence -= 20;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Generate impact recommendation
   */
  generateImpactRecommendation(allocationRatio, delayMonths, goal) {
    if (allocationRatio >= 100 && delayMonths <= 0) {
      return 'On track to meet deadline with current allocation';
    } else if (allocationRatio >= 80 && delayMonths <= 2) {
      return 'Slight delay possible - consider small increase if feasible';
    } else if (allocationRatio < 50) {
      return 'Significant underfunding - recommend deadline extension or target reduction';
    } else if (delayMonths > 6) {
      return 'Major delay expected - consider reforecasting deadline';
    } else {
      return 'Moderate allocation - monitor progress and adjust as income changes';
    }
  }

  /**
   * Determine resolution strategy
   */
  determineResolutionStrategy(allocations, conflicts) {
    const strategies = [];

    if (conflicts.detected) {
      conflicts.details.forEach(conflict => {
        if (conflict.type === 'capacity_shortage') {
          if (conflict.severity === 'critical') {
            strategies.push({
              strategy: 'tiered_priority_allocation',
              description: 'Allocate all capacity to high-priority goals, defer low-priority goals',
              actions: [
                'Focus on top 3 highest priority goals',
                'Defer or extend deadlines for lower tier goals',
                'Consider income increase strategies'
              ]
            });
          } else {
            strategies.push({
              strategy: 'balanced_reduction',
              description: 'Reduce allocations proportionally while maintaining momentum',
              actions: [
                'Reduce non-urgent goal contributions by 20-30%',
                'Maintain full funding for urgent/high-impact goals',
                'Review and adjust monthly as income changes'
              ]
            });
          }
        }

        if (conflict.type === 'deadline_conflict') {
          strategies.push({
            strategy: 'deadline_staggering',
            description: 'Stagger goal deadlines to avoid resource competition',
            actions: [
              'Extend lower-priority goal deadlines',
              'Focus resources on nearest deadline first',
              'Reforecast timeline for conflicting goals'
            ]
          });
        }

        if (conflict.type === 'category_conflict') {
          strategies.push({
            strategy: 'category_consolidation',
            description: 'Consider consolidating similar goals or prioritizing by impact',
            actions: [
              'Evaluate if multiple goals in same category can be combined',
              'Prioritize highest-impact goal in each category',
              'Phase other category goals sequentially'
            ]
          });
        }
      });
    } else {
      strategies.push({
        strategy: 'maintain_course',
        description: 'No conflicts detected - maintain current allocation strategy',
        actions: [
          'Continue with recommended allocations',
          'Monitor progress monthly',
          'Adjust as financial capacity changes'
        ]
      });
    }

    return strategies;
  }

  /**
   * Simulate impact of different allocation scenarios
   */
  simulateImpact(allocation, financialCapacity) {
    return {
      currentAllocation: {
        totalAllocated: allocation.totalAllocated,
        utilizationRate: allocation.utilizationRate,
        goalsFullyFunded: allocation.allocations.filter(a => a.allocationPercentage >= 100).length,
        goalsPartiallyFunded: allocation.allocations.filter(a => a.allocationPercentage > 0 && a.allocationPercentage < 100).length,
        goalsDeferred: allocation.allocations.filter(a => a.allocationPercentage === 0).length
      },
      alternativeScenarios: [
        {
          scenario: 'aggressive_allocation',
          description: 'Use aggressive savings capacity',
          capacity: financialCapacity.aggressiveCapacity,
          impact: 'Could fund more goals but higher financial stress',
          additionalGoalsFunded: this.calculateAdditionalFunded(
            allocation.allocations,
            financialCapacity.aggressiveCapacity - allocation.totalAllocated
          )
        },
        {
          scenario: 'conservative_allocation',
          description: 'Use only 80% of safe capacity',
          capacity: financialCapacity.safeCapacity * 0.8,
          impact: 'More financial buffer but fewer goals fully funded',
          goalsAffected: allocation.allocations.filter(a => a.allocatedMonthly > 0).length
        }
      ]
    };
  }

  /**
   * Calculate additional goals that could be funded
   */
  calculateAdditionalFunded(allocations, additionalCapacity) {
    let count = 0;
    let remaining = additionalCapacity;

    for (const alloc of allocations) {
      if (alloc.allocationPercentage < 100) {
        const needed = alloc.requiredMonthly - alloc.allocatedMonthly;
        if (needed <= remaining) {
          count++;
          remaining -= needed;
        }
      }
    }

    return count;
  }

  /**
   * Generate what-if scenarios
   */
  generateWhatIfScenarios(rankedGoals, financialCapacity) {
    return [
      {
        scenario: 'income_increase_10',
        description: 'What if income increases by 10%?',
        changes: {
          newCapacity: financialCapacity.safeCapacity * 1.1,
          additionalCapacity: financialCapacity.safeCapacity * 0.1
        },
        impact: this.simulateScenario(rankedGoals, financialCapacity.safeCapacity * 1.1)
      },
      {
        scenario: 'income_decrease_10',
        description: 'What if income decreases by 10%?',
        changes: {
          newCapacity: financialCapacity.safeCapacity * 0.9,
          reducedCapacity: financialCapacity.safeCapacity * 0.1
        },
        impact: this.simulateScenario(rankedGoals, financialCapacity.safeCapacity * 0.9)
      },
      {
        scenario: 'defer_lowest_priority',
        description: 'What if we defer lowest priority goal?',
        changes: {
          deferredGoal: rankedGoals[rankedGoals.length - 1]?.goalName,
          freedCapacity: rankedGoals[rankedGoals.length - 1]?.requiredMonthly || 0
        },
        impact: this.simulateScenario(
          rankedGoals.slice(0, -1),
          financialCapacity.safeCapacity
        )
      },
      {
        scenario: 'focus_top_three',
        description: 'What if we focus only on top 3 priorities?',
        changes: {
          focusedGoals: rankedGoals.slice(0, 3).map(g => g.goalName)
        },
        impact: this.simulateScenario(
          rankedGoals.slice(0, 3),
          financialCapacity.safeCapacity
        )
      }
    ];
  }

  /**
   * Simulate a scenario
   */
  simulateScenario(goals, capacity) {
    const totalRequired = goals.reduce((sum, g) => sum + g.requiredMonthly, 0);
    const fullyFunded = goals.filter(g => g.requiredMonthly <= capacity / goals.length).length;

    return {
      totalGoals: goals.length,
      totalRequired,
      availableCapacity: capacity,
      utilizationRate: (Math.min(totalRequired, capacity) / capacity) * 100,
      goalsFullyFundable: fullyFunded,
      feasibility: totalRequired <= capacity ? 'feasible' : 'requires_adjustment'
    };
  }

  /**
   * Helper: Group goals by deadline
   */
  groupByDeadline(goals) {
    const groups = [];
    const sortedGoals = [...goals].sort((a, b) => 
      new Date(a.targetDate) - new Date(b.targetDate)
    );

    let currentGroup = [];
    let currentDeadline = null;

    sortedGoals.forEach(goal => {
      const deadline = new Date(goal.targetDate);
      
      if (!currentDeadline) {
        currentDeadline = deadline;
        currentGroup.push(goal);
      } else {
        const daysDiff = Math.abs((deadline - currentDeadline) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 60) { // Within 60 days = same group
          currentGroup.push(goal);
        } else {
          if (currentGroup.length > 0) {
            groups.push({
              range: this.formatDateRange(currentGroup),
              goals: currentGroup
            });
          }
          currentGroup = [goal];
          currentDeadline = deadline;
        }
      }
    });

    if (currentGroup.length > 0) {
      groups.push({
        range: this.formatDateRange(currentGroup),
        goals: currentGroup
      });
    }

    return groups.filter(g => g.goals.length > 1);
  }

  /**
   * Helper: Format date range
   */
  formatDateRange(goals) {
    if (goals.length === 0) return '';
    
    const dates = goals.map(g => new Date(g.targetDate)).sort((a, b) => a - b);
    const start = dates[0].toLocaleDateString();
    const end = dates[dates.length - 1].toLocaleDateString();
    
    return start === end ? start : `${start} - ${end}`;
  }

  /**
   * Helper: Group goals by category
   */
  groupByCategory(goals) {
    return goals.reduce((groups, goal) => {
      const category = goal.category || 'Other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(goal);
      return groups;
    }, {});
  }

  /**
   * Helper: Get current monthly contribution
   */
  async getCurrentMonthlyContribution(goalId) {
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const contributions = await db
        .select()
        .from(goalContributions)
        .where(
          and(
            eq(goalContributions.goalId, goalId),
            gte(goalContributions.contributedAt, ninetyDaysAgo)
          )
        );

      if (contributions.length === 0) return 0;

      const total = contributions.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);
      return total / 3; // 90 days = 3 months
    } catch (error) {
      return 0;
    }
  }

  /**
   * Helper: Add months to date
   */
  addMonths(date, months) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }
}

export default new MultiGoalConflictResolver();
