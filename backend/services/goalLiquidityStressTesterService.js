import db from '../config/db.js';
import { financialGoals } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import savingsVelocityOptimizer from './savingsVelocityOptimizer.js';
import multiGoalConflictResolver from './multiGoalConflictResolver.js';

/**
 * Goal Liquidity Stress Tester
 * Simulates 30/60/90-day cash shocks and computes survivable goal allocations.
 */
class GoalLiquidityStressTesterService {
  constructor() {
    this.scenarioConfig = [
      {
        horizonDays: 30,
        scenarioName: 'Short-Term Shock (30d)',
        incomeDropPct: 0.10,
        expenseSpikePct: 0.12,
        debtIncreasePct: 0.08
      },
      {
        horizonDays: 60,
        scenarioName: 'Mid-Term Shock (60d)',
        incomeDropPct: 0.18,
        expenseSpikePct: 0.20,
        debtIncreasePct: 0.12
      },
      {
        horizonDays: 90,
        scenarioName: 'Extended Shock (90d)',
        incomeDropPct: 0.25,
        expenseSpikePct: 0.30,
        debtIncreasePct: 0.18
      }
    ];
  }

  /**
   * Full stress test for authenticated user.
   */
  async runStressTest(userId) {
    const [goals, income, debt, expenses] = await Promise.all([
      this.getActiveGoals(userId),
      savingsVelocityOptimizer.analyzeIncomeTrajectory(userId),
      savingsVelocityOptimizer.calculateDebtObligations(userId),
      savingsVelocityOptimizer.calculateMonthlyExpenses(userId)
    ]);

    const baselineCapacity = savingsVelocityOptimizer.calculateFinancialCapacity({
      income,
      debt,
      expenses
    });

    const scenarios = [];
    for (const config of this.scenarioConfig) {
      scenarios.push(await this.simulateScenario({
        userId,
        goals,
        income,
        debt,
        expenses,
        baselineCapacity,
        config
      }));
    }

    const stressScore = this.calculateStressScore({ baselineCapacity, scenarios });
    const survivableAllocation = this.calculateSurvivableAllocation({ baselineCapacity, scenarios });
    const goalDelayRiskMap = this.buildGoalDelayRiskMap(scenarios);
    const recommendedBufferTarget = this.calculateRecommendedBufferTarget({
      baselineIncome: income.currentMonthIncome,
      monthlyExpenses: expenses.monthlyExpenses,
      monthlyDebt: debt.totalMonthlyPayment,
      scenarios
    });

    return {
      userId,
      analyzedAt: new Date(),
      recalculatedWithinHours: 24,
      nextRecommendedRecalculationAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      baseline: {
        goalsCount: goals.length,
        monthlyIncome: income.currentMonthIncome,
        monthlyExpenses: expenses.monthlyExpenses,
        monthlyDebtPayments: debt.totalMonthlyPayment,
        safeAllocation: baselineCapacity.safeCapacity,
        targetAllocation: baselineCapacity.targetCapacity,
        debtToIncomeRatio: baselineCapacity.debtToIncomeRatio
      },
      stressScore,
      survivableAllocation,
      goalDelayRiskMap,
      recommendedBufferTarget,
      scenarios,
      summary: this.buildSummary({
        stressScore,
        survivableAllocation,
        scenarios,
        goalDelayRiskMap
      })
    };
  }

  async simulateScenario({ userId, goals, income, debt, expenses, baselineCapacity, config }) {
    const stressedIncome = {
      ...income,
      currentMonthIncome: Math.max(0, income.currentMonthIncome * (1 - config.incomeDropPct))
    };

    const stressedDebt = {
      ...debt,
      totalMonthlyPayment: Math.max(0, debt.totalMonthlyPayment * (1 + config.debtIncreasePct))
    };

    const stressedExpenses = {
      ...expenses,
      monthlyExpenses: Math.max(0, expenses.monthlyExpenses * (1 + config.expenseSpikePct))
    };

    const stressedCapacity = savingsVelocityOptimizer.calculateFinancialCapacity({
      income: stressedIncome,
      debt: stressedDebt,
      expenses: stressedExpenses
    });

    const scoredGoals = await Promise.all(
      goals.map(goal => multiGoalConflictResolver.scoreGoal(goal, userId, stressedCapacity))
    );

    const conflicts = multiGoalConflictResolver.detectConflicts(scoredGoals, stressedCapacity);
    const rankedGoals = multiGoalConflictResolver.rankGoals(scoredGoals);
    const allocation = multiGoalConflictResolver.generateAllocation(rankedGoals, stressedCapacity, conflicts);

    const goalFeasibility = allocation.allocations.map(item => {
      const isFeasible = item.allocationPercentage >= 80 && item.impact.delayMonths <= 2;
      const riskLevel = this.classifyDelayRisk(item.allocationPercentage, item.impact.delayMonths);

      return {
        goalId: item.goalId,
        goalName: item.goalName,
        tier: item.tier,
        allocatedMonthly: item.allocatedMonthly,
        requiredMonthly: item.requiredMonthly,
        allocationCoveragePct: item.allocationPercentage,
        projectedDelayMonths: item.impact.delayMonths,
        meetsOriginalDeadline: item.impact.meetsOriginalDeadline,
        feasibleUnderScenario: isFeasible,
        delayRisk: riskLevel
      };
    });

    const feasibleGoals = goalFeasibility.filter(goal => goal.feasibleUnderScenario).length;

    return {
      horizonDays: config.horizonDays,
      scenarioName: config.scenarioName,
      shocks: {
        incomeDropPct: config.incomeDropPct * 100,
        expenseSpikePct: config.expenseSpikePct * 100,
        debtPaymentIncreasePct: config.debtIncreasePct * 100
      },
      stressedFinancials: {
        monthlyIncome: stressedIncome.currentMonthIncome,
        monthlyExpenses: stressedExpenses.monthlyExpenses,
        monthlyDebtPayments: stressedDebt.totalMonthlyPayment
      },
      allocationUnderStress: {
        safeAllocation: stressedCapacity.safeCapacity,
        targetAllocation: stressedCapacity.targetCapacity,
        safeAllocationDelta: stressedCapacity.safeCapacity - baselineCapacity.safeCapacity,
        utilizationRate: allocation.utilizationRate,
        totalAllocated: allocation.totalAllocated
      },
      stressOutcome: {
        conflictsDetected: conflicts.detected,
        conflictCount: conflicts.conflictCount,
        feasibleGoals,
        nonFeasibleGoals: goalFeasibility.length - feasibleGoals,
        scenarioFeasibilityPct: goalFeasibility.length > 0 ? (feasibleGoals / goalFeasibility.length) * 100 : 100
      },
      goalFeasibility,
      recommendedActions: this.getScenarioActions({ stressedCapacity, conflicts, goalFeasibility })
    };
  }

  classifyDelayRisk(allocationCoveragePct, delayMonths) {
    if (allocationCoveragePct < 40 || delayMonths > 6) return 'high';
    if (allocationCoveragePct < 80 || delayMonths > 2) return 'medium';
    return 'low';
  }

  calculateStressScore({ baselineCapacity, scenarios }) {
    if (!scenarios.length) {
      return {
        score: 0,
        level: 'low',
        rationale: 'No scenarios available'
      };
    }

    const avgCapacityDrop = scenarios.reduce((sum, scenario) => {
      const baselineSafe = baselineCapacity.safeCapacity || 1;
      const dropPct = Math.max(0, (baselineSafe - scenario.allocationUnderStress.safeAllocation) / baselineSafe);
      return sum + dropPct;
    }, 0) / scenarios.length;

    const avgInfeasibility = scenarios.reduce((sum, scenario) => {
      const infeasibleRatio = scenario.goalFeasibility.length > 0
        ? (scenario.stressOutcome.nonFeasibleGoals / scenario.goalFeasibility.length)
        : 0;
      return sum + infeasibleRatio;
    }, 0) / scenarios.length;

    const conflictPressure = scenarios.reduce((sum, scenario) => {
      return sum + Math.min(1, scenario.stressOutcome.conflictCount / 5);
    }, 0) / scenarios.length;

    const rawScore = (avgCapacityDrop * 45) + (avgInfeasibility * 40) + (conflictPressure * 15);
    const score = Math.max(0, Math.min(100, rawScore));

    const level = score >= 75 ? 'critical' : score >= 55 ? 'high' : score >= 30 ? 'medium' : 'low';

    return {
      score,
      level,
      components: {
        capacityDrop: avgCapacityDrop * 100,
        infeasibleGoals: avgInfeasibility * 100,
        conflictPressure: conflictPressure * 100
      },
      rationale: this.stressRationale(level)
    };
  }

  stressRationale(level) {
    if (level === 'critical') return 'Severe liquidity vulnerability under stress scenarios.';
    if (level === 'high') return 'Material vulnerability with multiple goals at risk during shocks.';
    if (level === 'medium') return 'Moderate resilience; some goals require adaptive planning under stress.';
    return 'Healthy liquidity resilience across tested stress scenarios.';
  }

  calculateSurvivableAllocation({ baselineCapacity, scenarios }) {
    const scenarioSafeAllocations = scenarios.map(scenario => scenario.allocationUnderStress.safeAllocation);
    const minimumSafe = scenarioSafeAllocations.length ? Math.min(...scenarioSafeAllocations) : baselineCapacity.safeCapacity;
    const averageSafe = scenarioSafeAllocations.length
      ? scenarioSafeAllocations.reduce((sum, value) => sum + value, 0) / scenarioSafeAllocations.length
      : baselineCapacity.safeCapacity;

    return {
      baselineSafeAllocation: baselineCapacity.safeCapacity,
      minimumSurvivableAllocation: Math.max(0, minimumSafe),
      averageSurvivableAllocation: Math.max(0, averageSafe),
      recommendedStressSafeAllocation: Math.max(0, Math.min(minimumSafe, baselineCapacity.safeCapacity * 0.9)),
      bufferFromBaseline: Math.max(0, baselineCapacity.safeCapacity - minimumSafe)
    };
  }

  buildGoalDelayRiskMap(scenarios) {
    const map = {};

    for (const scenario of scenarios) {
      for (const goal of scenario.goalFeasibility) {
        if (!map[goal.goalId]) {
          map[goal.goalId] = {
            goalId: goal.goalId,
            goalName: goal.goalName,
            scenarioRisks: [],
            worstDelayMonths: 0,
            highestRisk: 'low',
            feasibleInAllScenarios: true
          };
        }

        map[goal.goalId].scenarioRisks.push({
          horizonDays: scenario.horizonDays,
          delayRisk: goal.delayRisk,
          projectedDelayMonths: goal.projectedDelayMonths,
          feasible: goal.feasibleUnderScenario
        });

        map[goal.goalId].worstDelayMonths = Math.max(
          map[goal.goalId].worstDelayMonths,
          goal.projectedDelayMonths
        );

        if (goal.delayRisk === 'high') map[goal.goalId].highestRisk = 'high';
        else if (goal.delayRisk === 'medium' && map[goal.goalId].highestRisk !== 'high') {
          map[goal.goalId].highestRisk = 'medium';
        }

        if (!goal.feasibleUnderScenario) {
          map[goal.goalId].feasibleInAllScenarios = false;
        }
      }
    }

    return Object.values(map)
      .sort((a, b) => {
        const riskOrder = { high: 3, medium: 2, low: 1 };
        return (riskOrder[b.highestRisk] || 0) - (riskOrder[a.highestRisk] || 0);
      });
  }

  calculateRecommendedBufferTarget({ baselineIncome, monthlyExpenses, monthlyDebt, scenarios }) {
    const fixedMonthlyObligations = Math.max(0, monthlyExpenses + monthlyDebt);

    const worstSafeAllocation = scenarios.length
      ? Math.min(...scenarios.map(scenario => scenario.allocationUnderStress.safeAllocation))
      : 0;

    const monthlyCoverageGap = Math.max(0, fixedMonthlyObligations - (baselineIncome - worstSafeAllocation));

    const threeMonthEmergencyTarget = fixedMonthlyObligations * 3;
    const stressGapBuffer = monthlyCoverageGap * 3;

    const recommendedBuffer = Math.max(threeMonthEmergencyTarget, threeMonthEmergencyTarget + stressGapBuffer * 0.5);

    return {
      fixedMonthlyObligations,
      worstCaseMonthlyCoverageGap: monthlyCoverageGap,
      threeMonthEmergencyTarget,
      stressAdjustedTarget: recommendedBuffer,
      recommendation: `Maintain approximately ${Math.round(recommendedBuffer)} as a liquidity buffer for stress resilience.`
    };
  }

  getScenarioActions({ stressedCapacity, conflicts, goalFeasibility }) {
    const actions = [];

    if (stressedCapacity.safeCapacity <= 0) {
      actions.push('Temporarily pause low-priority goals to preserve essential cash flow.');
    }

    if (conflicts.detected) {
      actions.push('Use priority-based allocation to protect urgent/high-impact goals first.');
    }

    const highRiskGoals = goalFeasibility.filter(goal => goal.delayRisk === 'high').length;
    if (highRiskGoals > 0) {
      actions.push(`Reforecast deadlines for ${highRiskGoals} high-risk goals.`);
    }

    if (actions.length === 0) {
      actions.push('Current plan is resilient for this scenario; continue monitoring monthly.');
    }

    return actions;
  }

  buildSummary({ stressScore, survivableAllocation, scenarios, goalDelayRiskMap }) {
    const feasibleAcrossAll = goalDelayRiskMap.filter(goal => goal.feasibleInAllScenarios).length;
    const totalGoals = goalDelayRiskMap.length;
    const worstScenario = scenarios.reduce((worst, scenario) => {
      if (!worst) return scenario;
      return scenario.stressOutcome.scenarioFeasibilityPct < worst.stressOutcome.scenarioFeasibilityPct ? scenario : worst;
    }, null);

    return {
      stressLevel: stressScore.level,
      stressScore: stressScore.score,
      survivableMonthlyAllocation: survivableAllocation.minimumSurvivableAllocation,
      goalsFeasibleAcrossAllScenarios: `${feasibleAcrossAll}/${totalGoals}`,
      worstScenario: worstScenario
        ? {
            horizonDays: worstScenario.horizonDays,
            feasibilityPct: worstScenario.stressOutcome.scenarioFeasibilityPct
          }
        : null
    };
  }

  async getActiveGoals(userId) {
    return db
      .select()
      .from(financialGoals)
      .where(
        and(
          eq(financialGoals.userId, userId),
          inArray(financialGoals.status, ['active', 'planning', 'in_progress'])
        )
      );
  }
}

export default new GoalLiquidityStressTesterService();
