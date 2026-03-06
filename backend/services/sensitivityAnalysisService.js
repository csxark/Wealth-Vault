import { db } from '../db/index.js';
import { sensitivityAnalysis } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Sensitivity Analysis Service
 * Issue #668
 * 
 * Performs what-if scenario modeling and impact analysis
 */

export class SensitivityAnalysisService {
  /**
   * Run sensitivity analysis on different scenarios
   */
  async runSensitivityAnalysis(userId, tenantId, currentCashFlow) {
    try {
      const scenarios = [
        this.createIncomeChangeScenario(currentCashFlow, -0.2), // 20% income reduction
        this.createIncomeChangeScenario(currentCashFlow, 0.2), // 20% income increase
        this.createExpenseChangeScenario(currentCashFlow, 0.15), // 15% expense increase
        this.createExpenseChangeScenario(currentCashFlow, -0.1), // 10% expense reduction
        this.createJobLossScenario(currentCashFlow),
        this.createInvestmentGainScenario(currentCashFlow, 0.08), // 8% investment gain
      ];

      const results = [];

      for (const scenario of scenarios) {
        const result = await this.evaluateScenario(
          userId,
          tenantId,
          scenario,
          currentCashFlow
        );
        results.push(result);
      }

      return {
        analysisCompleted: true,
        baselineScenario: {
          monthlyNetCashFlow: currentCashFlow,
        },
        scenarios: results,
        summary: this.summarizeScenarios(results),
      };
    } catch (error) {
      console.error('Error running sensitivity analysis:', error);
      throw error;
    }
  }

  /**
   * Create income change scenario
   */
  createIncomeChangeScenario(currentCashFlow, percentChange) {
    const monthlyIncome = 5000; // Base assumption - would be calculated from actual data

    return {
      name:
        percentChange > 0
          ? `Income Increase (+${Math.round(percentChange * 100)}%)`
          : `Income Decrease (${Math.round(percentChange * 100)}%)`,
      type: 'income_change',
      adjustmentType: 'percentage',
      adjustmentValue: percentChange,
      affectedComponent: 'income',
      impactAmount: monthlyIncome * percentChange,
      scenario: {
        income: monthlyIncome * (1 + percentChange),
        expenses: 3500, // Base assumption
        currentNetFlow: currentCashFlow,
      },
    };
  }

  /**
   * Create expense change scenario
   */
  createExpenseChangeScenario(currentCashFlow, percentChange) {
    const monthlyExpenses = 3500; // Base assumption

    return {
      name:
        percentChange > 0
          ? `Expense Increase (+${Math.round(percentChange * 100)}%)`
          : `Expense Decrease (${Math.round(percentChange * 100)}%)`,
      type: 'expense_change',
      adjustmentType: 'percentage',
      adjustmentValue: percentChange,
      affectedComponent: 'expenses',
      impactAmount: monthlyExpenses * percentChange,
      scenario: {
        income: 5000, // Base assumption
        expenses: monthlyExpenses * (1 + percentChange),
        currentNetFlow: currentCashFlow,
      },
    };
  }

  /**
   * Create job loss scenario
   */
  createJobLossScenario(currentCashFlow) {
    return {
      name: 'Job Loss',
      type: 'catastrophic_event',
      adjustmentType: 'fixed',
      affectedComponent: 'income',
      severityLevel: 'critical',
      scenario: {
        income: 1000, // Unemployment benefits estimate
        expenses: 3500,
        currentNetFlow: currentCashFlow,
      },
      survivalMonths: Math.floor(25000 / 2500), // Emergency fund / monthly deficit
    };
  }

  /**
   * Create investment gain scenario
   */
  createInvestmentGainScenario(currentCashFlow, percentGain) {
    return {
      name: `Investment Gain (+${Math.round(percentGain * 100)}%)`,
      type: 'investment_gain',
      adjustmentType: 'percentage',
      adjustmentValue: percentGain,
      affectedComponent: 'discretionary_income',
      scenario: {
        income: 5000,
        expenses: 3500,
        investmentIncome: 500 * percentGain,
        currentNetFlow: currentCashFlow,
      },
      timeframe: '1 year',
    };
  }

  /**
   * Evaluate a scenario and calculate impacts
   */
  async evaluateScenario(userId, tenantId, scenario, currentCashFlow) {
    const result = {
      scenarioName: scenario.name,
      type: scenario.type,
      severity: scenario.severityLevel || this.calculateSeverity(scenario),
    };

    // Calculate new net cash flow
    const scenarioData = scenario.scenario;
    const newIncome = scenarioData.income + (scenarioData.investmentIncome || 0);
    const newExpenses = scenarioData.expenses;
    const newNetCashFlow = newIncome - newExpenses;

    result.projectedIncome = newIncome;
    result.projectedExpenses = newExpenses;
    result.projectedNetCashFlow = Math.round(newNetCashFlow * 100) / 100;
    result.impactOnCashFlow = Math.round(
      (newNetCashFlow - currentCashFlow) * 100
    ) / 100;
    result.percentageChange = Math.round(
      ((newNetCashFlow - currentCashFlow) / currentCashFlow) * 100 * 100
    ) / 100;

    // Calculate recovery time
    result.recoveryMetrics = this.calculateRecoveryMetrics(
      newNetCashFlow,
      currentCashFlow,
      scenario
    );

    // Risk assessment
    result.riskLevel = this.assessRisk(newNetCashFlow, newExpenses);

    // Save to database
    const saved = await this.saveAnalysis(userId, tenantId, result);

    return saved;
  }

  /**
   * Calculate severity level
   */
  calculateSeverity(scenario) {
    if (scenario.type === 'catastrophic_event') return 'critical';

    const impact = scenario.impactAmount || 0;
    const monthlyIncome = scenario.scenario?.income || 5000;
    const percentImpact = Math.abs(impact / monthlyIncome);

    if (percentImpact > 0.3) return 'critical';
    if (percentImpact > 0.15) return 'high';
    if (percentImpact > 0.05) return 'medium';
    return 'low';
  }

  /**
   * Calculate recovery metrics
   */
  calculateRecoveryMetrics(newNetCashFlow, currentCashFlow, scenario) {
    const emergencyFund = 25000; // Base assumption
    const monthlyDeficit = Math.min(0, newNetCashFlow); // Negative cash flow

    if (monthlyDeficit === 0) {
      return {
        requiresRecovery: false,
        estimatedMonths: 0,
        message: 'No recovery needed - scenario is sustainable',
      };
    }

    const monthsToExhaust = Math.abs(emergencyFund / monthlyDeficit);

    return {
      requiresRecovery: true,
      estimatedMonths: Math.ceil(monthsToExhaust),
      emergencyFundCoverage: Math.round((emergencyFund / Math.abs(monthlyDeficit)) * 100) / 100,
      actionRequired: true,
      suggestion:
        monthsToExhaust < 6
          ? 'Immediate action required to reduce expenses or increase income'
          : 'Monitor carefully, develop contingency plan',
    };
  }

  /**
   * Assess risk level
   */
  assessRisk(netCashFlow, expenses) {
    if (netCashFlow < 0) {
      const expenseRatio = Math.abs(netCashFlow) / expenses;
      if (expenseRatio > 0.5) return 'critical';
      if (expenseRatio > 0.2) return 'high';
      return 'medium';
    }

    if (netCashFlow < expenses * 0.1) return 'medium';
    return 'low';
  }

  /**
   * Summarize scenarios
   */
  summarizeScenarios(results) {
    const summary = {
      bestCase: null,
      worstCase: null,
      averageCase: 0,
      criticalRiskScenarios: [],
    };

    let maxNetFlow = -Infinity;
    let minNetFlow = Infinity;
    let totalNetFlow = 0;

    results.forEach((result) => {
      const flow = result.projectedNetCashFlow;
      totalNetFlow += flow;

      if (flow > maxNetFlow) {
        maxNetFlow = flow;
        summary.bestCase = result.scenarioName;
      }

      if (flow < minNetFlow) {
        minNetFlow = flow;
        summary.worstCase = result.scenarioName;
      }

      if (result.riskLevel === 'critical') {
        summary.criticalRiskScenarios.push({
          scenario: result.scenarioName,
          netCashFlow: flow,
          recoveryTime: result.recoveryMetrics?.estimatedMonths,
        });
      }
    });

    summary.averageCase = Math.round((totalNetFlow / results.length) * 100) / 100;
    summary.bestCaseNetFlow = maxNetFlow;
    summary.worstCaseNetFlow = minNetFlow;

    return summary;
  }

  /**
   * Save analysis to database
   */
  async saveAnalysis(userId, tenantId, analysisResult) {
    return await db
      .insert(sensitivityAnalysis)
      .values({
        userId,
        tenantId,
        scenarioName: analysisResult.scenarioName,
        scenarioType: analysisResult.type,
        severity: analysisResult.severity,
        projectedIncome: analysisResult.projectedIncome,
        projectedExpenses: analysisResult.projectedExpenses,
        projectedNetCashFlow: analysisResult.projectedNetCashFlow,
        impactAmount: analysisResult.impactOnCashFlow,
        impactPercentage: analysisResult.percentageChange,
        riskLevel: analysisResult.riskLevel,
        recoveryTimeMonths: analysisResult.recoveryMetrics?.estimatedMonths,
        actionRequired: analysisResult.recoveryMetrics?.actionRequired || false,
        recommendations: {
          action: analysisResult.recoveryMetrics?.suggestion,
          priority:
            analysisResult.riskLevel === 'critical' ? 'immediate' : 'monitor',
        },
        analyzedAt: new Date(),
      })
      .returning();
  }

  /**
   * Get scenario by name
   */
  async getScenarioAnalysis(userId, tenantId, scenarioName) {
    const analysis = await db
      .select()
      .from(sensitivityAnalysis)
      .where(
        and(
          eq(sensitivityAnalysis.userId, userId),
          eq(sensitivityAnalysis.tenantId, tenantId),
          eq(sensitivityAnalysis.scenarioName, scenarioName)
        )
      );

    return analysis.length ? analysis[0] : null;
  }

  /**
   * Get all critical scenarios
   */
  async getCriticalScenarios(userId, tenantId) {
    const criticalAnalyses = await db
      .select()
      .from(sensitivityAnalysis)
      .where(
        and(
          eq(sensitivityAnalysis.userId, userId),
          eq(sensitivityAnalysis.tenantId, tenantId),
          eq(sensitivityAnalysis.riskLevel, 'critical')
        )
      );

    return criticalAnalyses.map((analysis) => ({
      scenario: analysis.scenarioName,
      impact: analysis.impactAmount,
      recoveryTime: analysis.recoveryTimeMonths,
      recommendation: analysis.recommendations?.action,
    }));
  }

  /**
   * Compare scenarios
   */
  async compareScenarios(userId, tenantId, scenarioNames) {
    const analyses = await db
      .select()
      .from(sensitivityAnalysis)
      .where(
        and(
          eq(sensitivityAnalysis.userId, userId),
          eq(sensitivityAnalysis.tenantId, tenantId)
        )
      );

    const compared = analyses.filter((a) => scenarioNames.includes(a.scenarioName));

    return compared.map((a) => ({
      scenario: a.scenarioName,
      type: a.scenarioType,
      netCashFlow: a.projectedNetCashFlow,
      impact: a.impactAmount,
      risk: a.riskLevel,
      recoveryTime: a.recoveryTimeMonths,
    }));
  }

  /**
   * Identify most resilient strategies
   */
  identifyResistantStrategies(scenarioResults) {
    // Strategies that perform well even in bad scenarios
    const resilient = [];

    scenarioResults.forEach((result) => {
      if (result.riskLevel === 'low' && result.impactOnCashFlow > -1000) {
        resilient.push({
          strategy: result.scenarioName,
          description: `Limited impact: ${result.impactOnCashFlow} in worst case`,
          recommendationStrength: 'high',
        });
      }
    });

    return resilient;
  }
}

export const sensitivityAnalysisService = new SensitivityAnalysisService();
