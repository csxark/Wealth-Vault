import db from '../config/db.js';
import { 
  financialGoals,
  goalProgressSnapshots,
  goalContributions,
  users,
  expenses,
  debts,
  transactions
} from '../db/schema.js';
import { eq, and, desc, gte, sql } from 'drizzle-orm';

/**
 * Savings Velocity Optimizer
 * Recommends optimal monthly contribution based on income trajectory, 
 * debt obligations, and goal deadline urgency
 */
class SavingsVelocityOptimizer {
  constructor() {
    // Financial health thresholds
    this.healthLimits = {
      minEmergencyBuffer: 0.05,      // 5% of income reserved
      maxDebtRatio: 0.43,             // 43% DTI is max recommended
      minSavingsRate: 0.10,           // 10% minimum savings
      targetSavingsRate: 0.20,        // 20% target savings
      aggressiveSavingsRate: 0.30     // 30% aggressive savings
    };
  }

  /**
   * Analyze income trajectory over time
   */
  async analyzeIncomeTrajectory(userId) {
    try {
      // Get income transactions over last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const incomeTransactions = await db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.type, 'income'),
            gte(transactions.date, sixMonthsAgo)
          )
        )
        .orderBy(desc(transactions.date));

      // Group by month and calculate monthly income
      const monthlyIncome = this.groupByMonth(incomeTransactions);

      // Calculate trend
      const trend = this.calculateTrend(monthlyIncome);
      
      // Get current month income (or estimate)
      const currentMonthIncome = monthlyIncome.length > 0 
        ? monthlyIncome[0].total 
        : await this.getEstimatedMonthlyIncome(userId);

      // Calculate average and volatility
      const avgMonthlyIncome = monthlyIncome.length > 0
        ? monthlyIncome.reduce((sum, month) => sum + month.total, 0) / monthlyIncome.length
        : currentMonthIncome;

      const volatility = this.calculateVolatility(monthlyIncome);

      return {
        currentMonthIncome,
        avgMonthlyIncome,
        trend,
        volatility,
        monthlyData: monthlyIncome,
        projectedNextMonth: this.projectNextMonthIncome(monthlyIncome, trend)
      };
    } catch (error) {
      console.error('Error analyzing income trajectory:', error);
      throw error;
    }
  }

  /**
   * Calculate debt obligations
   */
  async calculateDebtObligations(userId) {
    try {
      const activeDebts = await db
        .select()
        .from(debts)
        .where(
          and(
            eq(debts.userId, userId),
            eq(debts.status, 'active')
          )
        );

      let totalMonthlyPayment = 0;
      let totalRemaining = 0;
      const debtBreakdown = [];

      for (const debt of activeDebts) {
        const monthlyPayment = parseFloat(debt.minimumPayment || 0);
        const remaining = parseFloat(debt.remainingBalance || debt.amount || 0);
        
        totalMonthlyPayment += monthlyPayment;
        totalRemaining += remaining;

        debtBreakdown.push({
          id: debt.id,
          name: debt.name || debt.debtType,
          type: debt.debtType,
          monthlyPayment,
          remaining,
          interestRate: parseFloat(debt.interestRate || 0),
          priority: debt.priority || 'medium'
        });
      }

      // Sort by priority and interest rate
      debtBreakdown.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = (priorityOrder[b.priority] || 2) - (priorityOrder[a.priority] || 2);
        if (priorityDiff !== 0) return priorityDiff;
        return b.interestRate - a.interestRate;
      });

      return {
        totalMonthlyPayment,
        totalRemaining,
        debtCount: activeDebts.length,
        debtBreakdown
      };
    } catch (error) {
      console.error('Error calculating debt obligations:', error);
      return {
        totalMonthlyPayment: 0,
        totalRemaining: 0,
        debtCount: 0,
        debtBreakdown: []
      };
    }
  }

  /**
   * Calculate monthly expenses
   */
  async calculateMonthlyExpenses(userId) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentExpenses = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, userId),
            gte(expenses.date, thirtyDaysAgo)
          )
        );

      const total = recentExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
      
      // Normalize to monthly
      const monthlyExpenses = total;

      // Get expense breakdown by category
      const categoryBreakdown = {};
      recentExpenses.forEach(exp => {
        const category = exp.category || 'Other';
        categoryBreakdown[category] = (categoryBreakdown[category] || 0) + parseFloat(exp.amount || 0);
      });

      return {
        monthlyExpenses,
        categoryBreakdown,
        transactionCount: recentExpenses.length
      };
    } catch (error) {
      console.error('Error calculating monthly expenses:', error);
      return {
        monthlyExpenses: 0,
        categoryBreakdown: {},
        transactionCount: 0
      };
    }
  }

  /**
   * Optimize velocity for a specific goal
   */
  async optimizeGoalVelocity(goalId, userId) {
    try {
      // Get goal details
      const [goal] = await db
        .select()
        .from(financialGoals)
        .where(eq(financialGoals.id, goalId));

      if (!goal) {
        throw new Error('Goal not found');
      }

      // Gather financial context
      const [incomeAnalysis, debtObligations, expenseAnalysis] = await Promise.all([
        this.analyzeIncomeTrajectory(userId),
        this.calculateDebtObligations(userId),
        this.calculateMonthlyExpenses(userId)
      ]);

      // Calculate available capacity
      const financialCapacity = this.calculateFinancialCapacity({
        income: incomeAnalysis,
        debt: debtObligations,
        expenses: expenseAnalysis
      });

      // Calculate goal urgency
      const urgency = this.calculateGoalUrgency(goal);

      // Get current contribution rate
      const currentContribution = await this.getCurrentMonthlyContribution(goalId);

      // Generate velocity recommendations
      const recommendations = this.generateVelocityRecommendations({
        goal,
        financialCapacity,
        urgency,
        currentContribution,
        income: incomeAnalysis,
        debt: debtObligations
      });

      // Breakeven analysis
      const breakeven = this.calculateBreakeven({
        goal,
        recommendations,
        currentContribution
      });

      return {
        goalId,
        goalName: goal.goalName,
        analysisDate: new Date(),
        financialContext: {
          income: {
            current: incomeAnalysis.currentMonthIncome,
            average: incomeAnalysis.avgMonthlyIncome,
            trend: incomeAnalysis.trend,
            volatility: incomeAnalysis.volatility,
            projected: incomeAnalysis.projectedNextMonth
          },
          debt: {
            monthlyPayment: debtObligations.totalMonthlyPayment,
            totalRemaining: debtObligations.totalRemaining,
            debtCount: debtObligations.debtCount
          },
          expenses: {
            monthly: expenseAnalysis.monthlyExpenses
          },
          capacity: financialCapacity
        },
        goalStatus: {
          currentAmount: parseFloat(goal.currentAmount || 0),
          targetAmount: parseFloat(goal.targetAmount),
          remainingAmount: parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount || 0),
          progressPercentage: parseFloat(goal.progressPercentage || 0),
          targetDate: goal.targetDate,
          daysRemaining: Math.max(0, Math.floor((new Date(goal.targetDate) - new Date()) / (1000 * 60 * 60 * 24))),
          urgency: urgency
        },
        currentVelocity: {
          monthlyContribution: currentContribution,
          projectedCompletion: this.projectCompletion(
            parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount || 0),
            currentContribution
          )
        },
        recommendations,
        breakeven
      };
    } catch (error) {
      console.error('Error optimizing goal velocity:', error);
      throw error;
    }
  }

  /**
   * Calculate financial capacity for savings
   */
  calculateFinancialCapacity({ income, debt, expenses }) {
    const monthlyIncome = income.currentMonthIncome;
    const monthlyDebt = debt.totalMonthlyPayment;
    const monthlyExpenses = expenses.monthlyExpenses;

    // Calculate disposable income
    const disposableIncome = monthlyIncome - monthlyExpenses - monthlyDebt;

    // Calculate DTI ratio
    const debtToIncomeRatio = monthlyIncome > 0 ? monthlyDebt / monthlyIncome : 0;

    // Calculate safe savings capacity (conservative)
    const emergencyBuffer = monthlyIncome * this.healthLimits.minEmergencyBuffer;
    const safeCapacity = Math.max(0, disposableIncome - emergencyBuffer);

    // Calculate aggressive capacity (if DTI is healthy)
    const aggressiveCapacity = debtToIncomeRatio < 0.36 
      ? disposableIncome * 0.9  // Can save 90% of disposable income
      : safeCapacity;

    // Calculate target capacity (20% of income)
    const targetCapacity = monthlyIncome * this.healthLimits.targetSavingsRate;

    return {
      disposableIncome,
      safeCapacity: Math.max(0, safeCapacity),
      aggressiveCapacity: Math.max(0, aggressiveCapacity),
      targetCapacity: Math.max(0, targetCapacity),
      debtToIncomeRatio,
      utilizationRate: disposableIncome > 0 ? (monthlyExpenses + monthlyDebt) / monthlyIncome : 1
    };
  }

  /**
   * Calculate goal urgency score (0-100)
   */
  calculateGoalUrgency(goal) {
    const targetDate = new Date(goal.targetDate);
    const today = new Date();
    const daysRemaining = Math.max(0, Math.floor((targetDate - today) / (1000 * 60 * 60 * 24)));
    const progressPercentage = parseFloat(goal.progressPercentage || 0);

    let urgencyScore = 0;

    // Time pressure (0-50 points)
    if (daysRemaining <= 30) {
      urgencyScore += 50;
    } else if (daysRemaining <= 90) {
      urgencyScore += 40;
    } else if (daysRemaining <= 180) {
      urgencyScore += 30;
    } else if (daysRemaining <= 365) {
      urgencyScore += 20;
    } else {
      urgencyScore += 10;
    }

    // Progress lag (0-30 points)
    const monthsTotal = Math.max(1, Math.floor((targetDate - new Date(goal.createdAt)) / (1000 * 60 * 60 * 24 * 30)));
    const monthsElapsed = Math.max(0, Math.floor((today - new Date(goal.createdAt)) / (1000 * 60 * 60 * 24 * 30)));
    const expectedProgress = monthsTotal > 0 ? (monthsElapsed / monthsTotal) * 100 : 0;
    const progressLag = expectedProgress - progressPercentage;

    if (progressLag > 30) {
      urgencyScore += 30;
    } else if (progressLag > 15) {
      urgencyScore += 20;
    } else if (progressLag > 5) {
      urgencyScore += 10;
    }

    // Priority (0-20 points)
    const priority = goal.priority || 0;
    urgencyScore += Math.min(20, priority * 2);

    const urgencyLevel = urgencyScore >= 70 ? 'critical' : urgencyScore >= 50 ? 'high' : urgencyScore >= 30 ? 'medium' : 'low';

    return {
      score: Math.min(100, urgencyScore),
      level: urgencyLevel,
      daysRemaining,
      progressPercentage,
      progressLag: Math.max(0, progressLag)
    };
  }

  /**
   * Generate velocity recommendations
   */
  generateVelocityRecommendations({ goal, financialCapacity, urgency, currentContribution, income, debt }) {
    const remainingAmount = parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount || 0);
    const daysRemaining = urgency.daysRemaining;
    const monthsRemaining = Math.max(1, daysRemaining / 30);

    const recommendations = [];

    // Recommendation 1: Conservative (Safe Capacity)
    const conservativeVelocity = Math.min(
      financialCapacity.safeCapacity * 0.8,  // 80% of safe capacity
      remainingAmount / monthsRemaining
    );

    const conservativeMonths = conservativeVelocity > 0 
      ? Math.ceil(remainingAmount / conservativeVelocity) 
      : 999;

    recommendations.push({
      strategy: 'conservative',
      recommendedMonthlyVelocity: Math.max(0, conservativeVelocity),
      adjustedTimeline: {
        months: conservativeMonths,
        completionDate: this.addMonths(new Date(), conservativeMonths),
        meetsOriginalDeadline: conservativeMonths <= monthsRemaining
      },
      incomeAdjustedGrowthFactor: income.trend.direction === 'improving' ? 1.05 : income.trend.direction === 'declining' ? 0.95 : 1.0,
      feasibilityConfidence: this.calculateFeasibility({
        velocity: conservativeVelocity,
        capacity: financialCapacity.safeCapacity,
        income: income,
        debt: debt
      }),
      riskLevel: 'low',
      pros: [
        'Maintains financial safety buffer',
        'Sustainable long-term',
        'Low stress on cash flow',
        'Flexible for unexpected expenses'
      ],
      cons: [
        conservativeMonths > monthsRemaining ? `Extends deadline by ${conservativeMonths - Math.floor(monthsRemaining)} months` : null,
        'Slower goal achievement',
        'May miss market opportunities'
      ].filter(Boolean),
      cashFlowImpact: {
        percentOfIncome: income.currentMonthIncome > 0 ? (conservativeVelocity / income.currentMonthIncome) * 100 : 0,
        percentOfDisposable: financialCapacity.disposableIncome > 0 ? (conservativeVelocity / financialCapacity.disposableIncome) * 100 : 0
      }
    });

    // Recommendation 2: Balanced (Target Capacity)
    const balancedVelocity = Math.min(
      financialCapacity.targetCapacity,
      remainingAmount / monthsRemaining
    );

    const balancedMonths = balancedVelocity > 0 
      ? Math.ceil(remainingAmount / balancedVelocity) 
      : 999;

    recommendations.push({
      strategy: 'balanced',
      recommendedMonthlyVelocity: Math.max(0, balancedVelocity),
      adjustedTimeline: {
        months: balancedMonths,
        completionDate: this.addMonths(new Date(), balancedMonths),
        meetsOriginalDeadline: balancedMonths <= monthsRemaining
      },
      incomeAdjustedGrowthFactor: income.trend.direction === 'improving' ? 1.08 : income.trend.direction === 'declining' ? 0.93 : 1.0,
      feasibilityConfidence: this.calculateFeasibility({
        velocity: balancedVelocity,
        capacity: financialCapacity.targetCapacity,
        income: income,
        debt: debt
      }),
      riskLevel: 'medium',
      pros: [
        'Healthy savings rate (20% of income)',
        'Good balance of progress and safety',
        'Industry-standard recommendation',
        balancedMonths <= monthsRemaining ? 'Meets original deadline' : null
      ].filter(Boolean),
      cons: [
        'Requires disciplined budgeting',
        balancedMonths > monthsRemaining ? 'May need deadline adjustment' : null,
        'Less flexibility than conservative'
      ].filter(Boolean),
      cashFlowImpact: {
        percentOfIncome: income.currentMonthIncome > 0 ? (balancedVelocity / income.currentMonthIncome) * 100 : 0,
        percentOfDisposable: financialCapacity.disposableIncome > 0 ? (balancedVelocity / financialCapacity.disposableIncome) * 100 : 0
      }
    });

    // Recommendation 3: Aggressive (if feasible and urgent)
    if (urgency.level === 'high' || urgency.level === 'critical' || financialCapacity.debtToIncomeRatio < 0.36) {
      const aggressiveVelocity = Math.min(
        financialCapacity.aggressiveCapacity,
        remainingAmount / Math.max(1, monthsRemaining)
      );

      const aggressiveMonths = aggressiveVelocity > 0 
        ? Math.ceil(remainingAmount / aggressiveVelocity) 
        : 999;

      recommendations.push({
        strategy: 'aggressive',
        recommendedMonthlyVelocity: Math.max(0, aggressiveVelocity),
        adjustedTimeline: {
          months: aggressiveMonths,
          completionDate: this.addMonths(new Date(), aggressiveMonths),
          meetsOriginalDeadline: aggressiveMonths <= monthsRemaining
        },
        incomeAdjustedGrowthFactor: income.trend.direction === 'improving' ? 1.12 : income.trend.direction === 'declining' ? 0.90 : 1.0,
        feasibilityConfidence: this.calculateFeasibility({
          velocity: aggressiveVelocity,
          capacity: financialCapacity.aggressiveCapacity,
          income: income,
          debt: debt
        }),
        riskLevel: 'high',
        pros: [
          'Fastest path to goal completion',
          urgency.level === 'critical' || urgency.level === 'high' ? 'Addresses high urgency' : null,
          'Maximizes savings momentum',
          'Compounds interest benefits'
        ].filter(Boolean),
        cons: [
          'Very limited discretionary spending',
          'High stress on monthly budget',
          'Vulnerable to unexpected expenses',
          'Requires strict discipline'
        ],
        cashFlowImpact: {
          percentOfIncome: income.currentMonthIncome > 0 ? (aggressiveVelocity / income.currentMonthIncome) * 100 : 0,
          percentOfDisposable: financialCapacity.disposableIncome > 0 ? (aggressiveVelocity / financialCapacity.disposableIncome) * 100 : 0
        }
      });
    }

    // Recommendation 4: Deadline-Driven (meet original deadline)
    const requiredVelocity = monthsRemaining > 0 ? remainingAmount / monthsRemaining : remainingAmount;
    const isFeasible = requiredVelocity <= financialCapacity.aggressiveCapacity;

    if (isFeasible && requiredVelocity > 0) {
      recommendations.push({
        strategy: 'deadline_driven',
        recommendedMonthlyVelocity: requiredVelocity,
        adjustedTimeline: {
          months: Math.ceil(monthsRemaining),
          completionDate: new Date(goal.targetDate),
          meetsOriginalDeadline: true
        },
        incomeAdjustedGrowthFactor: income.trend.direction === 'improving' ? 1.10 : income.trend.direction === 'declining' ? 0.92 : 1.0,
        feasibilityConfidence: this.calculateFeasibility({
          velocity: requiredVelocity,
          capacity: financialCapacity.aggressiveCapacity,
          income: income,
          debt: debt
        }),
        riskLevel: requiredVelocity > financialCapacity.targetCapacity ? 'high' : 'medium',
        pros: [
          'Meets original commitment date',
          'No plan adjustment needed',
          'Maintains goal integrity'
        ],
        cons: [
          requiredVelocity > financialCapacity.targetCapacity ? 'Requires above-average savings rate' : null,
          'Less flexibility for adjustments',
          requiredVelocity > financialCapacity.safeCapacity ? 'May impact financial cushion' : null
        ].filter(Boolean),
        cashFlowImpact: {
          percentOfIncome: income.currentMonthIncome > 0 ? (requiredVelocity / income.currentMonthIncome) * 100 : 0,
          percentOfDisposable: financialCapacity.disposableIncome > 0 ? (requiredVelocity / financialCapacity.disposableIncome) * 100 : 0
        }
      });
    }

    // Select best recommendation
    const bestRecommendation = this.selectBestRecommendation(recommendations, {
      urgency,
      capacity: financialCapacity,
      debt: debt,
      income: income
    });

    return {
      options: recommendations,
      recommended: bestRecommendation
    };
  }

  /**
   * Calculate feasibility confidence (0-100)
   */
  calculateFeasibility({ velocity, capacity, income, debt }) {
    let confidence = 100;

    // Check if velocity exceeds capacity
    if (velocity > capacity) {
      confidence -= 50;
    } else if (velocity > capacity * 0.9) {
      confidence -= 20;
    }

    // Income volatility penalty
    if (income.volatility > 0.3) {
      confidence -= 20;
    } else if (income.volatility > 0.2) {
      confidence -= 10;
    }

    // Debt burden penalty
    const dtiRatio = debt.totalMonthlyPayment / income.currentMonthIncome;
    if (dtiRatio > 0.43) {
      confidence -= 25;
    } else if (dtiRatio > 0.36) {
      confidence -= 15;
    }

    // Income trend adjustment
    if (income.trend.direction === 'declining') {
      confidence -= 15;
    } else if (income.trend.direction === 'improving') {
      confidence += 10;
    }

    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Select best recommendation
   */
  selectBestRecommendation(recommendations, context) {
    const { urgency, capacity, debt, income } = context;

    // High urgency + healthy finances → aggressive or deadline-driven
    if ((urgency.level === 'critical' || urgency.level === 'high') && capacity.debtToIncomeRatio < 0.36) {
      const deadlineDriven = recommendations.find(r => r.strategy === 'deadline_driven');
      if (deadlineDriven && deadlineDriven.feasibilityConfidence > 60) {
        return deadlineDriven.strategy;
      }
      const aggressive = recommendations.find(r => r.strategy === 'aggressive');
      if (aggressive) return aggressive.strategy;
    }

    // High debt → conservative
    if (capacity.debtToIncomeRatio > 0.43) {
      return 'conservative';
    }

    // Volatile income → conservative
    if (income.volatility > 0.3) {
      return 'conservative';
    }

    // Default to balanced
    return 'balanced';
  }

  /**
   * Calculate breakeven analysis
   */
  calculateBreakeven({ goal, recommendations, currentContribution }) {
    const remainingAmount = parseFloat(goal.targetAmount) - parseFloat(goal.currentAmount || 0);
    const daysToDeadline = Math.max(0, Math.floor((new Date(goal.targetDate) - new Date()) / (1000 * 60 * 60 * 24)));
    const monthsToDeadline = Math.max(1, daysToDeadline / 30);

    // Current pace analysis
    const currentPaceMonths = currentContribution > 0 ? Math.ceil(remainingAmount / currentContribution) : 999;
    const currentPaceReachesGoal = currentPaceMonths <= monthsToDeadline;
    const currentPaceDate = this.addMonths(new Date(), currentPaceMonths);

    // Gap analysis
    const gapToDeadline = currentPaceReachesGoal ? 0 : currentPaceMonths - monthsToDeadline;
    const shortfall = gapToDeadline > 0 ? remainingAmount - (currentContribution * monthsToDeadline) : 0;

    return {
      currentPace: {
        monthlyContribution: currentContribution,
        projectedMonths: currentPaceMonths,
        projectedCompletionDate: currentPaceDate,
        reachesGoalOnTime: currentPaceReachesGoal
      },
      gap: {
        monthsShort: Math.max(0, gapToDeadline),
        amountShort: Math.max(0, shortfall),
        additionalMonthlyNeeded: gapToDeadline > 0 && monthsToDeadline > 0 
          ? shortfall / monthsToDeadline 
          : 0
      },
      recommendations: recommendations.options.map(rec => ({
        strategy: rec.strategy,
        meetsDeadline: rec.adjustedTimeline.meetsOriginalDeadline,
        monthsToCompletion: rec.adjustedTimeline.months,
        increaseNeeded: rec.recommendedMonthlyVelocity - currentContribution,
        increasePercentage: currentContribution > 0 
          ? ((rec.recommendedMonthlyVelocity - currentContribution) / currentContribution) * 100 
          : 0
      }))
    };
  }

  /**
   * Helper: Group transactions by month
   */
  groupByMonth(transactions) {
    const months = {};
    
    transactions.forEach(txn => {
      const date = new Date(txn.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!months[key]) {
        months[key] = { month: key, total: 0, count: 0 };
      }
      
      months[key].total += parseFloat(txn.amount || 0);
      months[key].count += 1;
    });

    return Object.values(months).sort((a, b) => b.month.localeCompare(a.month));
  }

  /**
   * Helper: Calculate trend
   */
  calculateTrend(monthlyData) {
    if (monthlyData.length < 2) {
      return { direction: 'stable', slope: 0, strength: 'unknown' };
    }

    // Simple linear regression
    const n = monthlyData.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = monthlyData.reduce((sum, month) => sum + month.total, 0);
    const sumXY = monthlyData.reduce((sum, month, idx) => sum + (idx * month.total), 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const avgY = sumY / n;
    const percentageSlope = avgY !== 0 ? (slope / avgY) * 100 : 0;

    let direction = 'stable';
    let strength = 'weak';

    if (percentageSlope > 5) {
      direction = 'improving';
      strength = percentageSlope > 10 ? 'strong' : 'moderate';
    } else if (percentageSlope < -5) {
      direction = 'declining';
      strength = percentageSlope < -10 ? 'strong' : 'moderate';
    }

    return { direction, slope: percentageSlope, strength };
  }

  /**
   * Helper: Calculate volatility
   */
  calculateVolatility(monthlyData) {
    if (monthlyData.length < 2) return 0;

    const values = monthlyData.map(m => m.total);
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return mean > 0 ? stdDev / mean : 0; // Coefficient of variation
  }

  /**
   * Helper: Project next month income
   */
  projectNextMonthIncome(monthlyData, trend) {
    if (monthlyData.length === 0) return 0;
    
    const latestIncome = monthlyData[0].total;
    const avgIncome = monthlyData.reduce((sum, m) => sum + m.total, 0) / monthlyData.length;

    if (trend.direction === 'improving') {
      return latestIncome * 1.05;
    } else if (trend.direction === 'declining') {
      return latestIncome * 0.95;
    }

    return (latestIncome + avgIncome) / 2;
  }

  /**
   * Helper: Get estimated monthly income from user profile
   */
  async getEstimatedMonthlyIncome(userId) {
    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      return parseFloat(user?.monthlyIncome || 0);
    } catch (error) {
      return 0;
    }
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
      const months = 3; // 90 days = 3 months
      
      return total / months;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Helper: Project completion date
   */
  projectCompletion(remainingAmount, monthlyContribution) {
    if (monthlyContribution <= 0) {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 10);
      return farFuture;
    }

    const months = Math.ceil(remainingAmount / monthlyContribution);
    return this.addMonths(new Date(), months);
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

export default new SavingsVelocityOptimizer();
