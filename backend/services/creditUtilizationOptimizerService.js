/**
 * creditUtilizationOptimizerService.js
 * Analyzes credit utilization, simulates paydown scenarios, and recommends optimal actions for score improvement.
 */

/**
 * Helper: Calculate credit utilization for each account and overall
 */
function calculateUtilization(accounts) {
  let totalBalance = 0;
  let totalLimit = 0;
  const accountUtilization = accounts.map(acc => {
    const balance = parseFloat(acc.balance);
    const limit = parseFloat(acc.limit);
    totalBalance += balance;
    totalLimit += limit;
    return {
      id: acc.id,
      name: acc.name,
      balance,
      limit,
      utilization: limit > 0 ? balance / limit : 0
    };
  });
  const overallUtilization = totalLimit > 0 ? totalBalance / totalLimit : 0;
  return { accountUtilization, overallUtilization };
}

/**
 * Helper: Simulate paydown scenarios for score improvement
 */
function simulatePaydownScenarios(accounts, monthlyBudget = 0) {
  // Try paying down each account by $100, $200, $500, etc.
  const scenarios = [];
  [100, 200, 500, 1000].forEach(amount => {
    accounts.forEach(acc => {
      if (acc.balance > 0) {
        const newBalance = Math.max(0, acc.balance - amount);
        const newUtilization = acc.limit > 0 ? newBalance / acc.limit : 0;
        scenarios.push({
          action: `Pay $${amount} on ${acc.name}`,
          accountId: acc.id,
          newBalance,
          newUtilization,
          projectedScoreBoost: projectScoreBoost(newUtilization)
        });
      }
    });
  });
  // Try distributing monthly budget across highest utilization accounts
  if (monthlyBudget > 0) {
    const sorted = [...accounts].sort((a, b) => (b.balance / b.limit) - (a.balance / a.limit));
    let remaining = monthlyBudget;
    const actions = [];
    for (let i = 0; i < sorted.length && remaining > 0; i++) {
      const pay = Math.min(remaining, sorted[i].balance);
      actions.push({
        accountId: sorted[i].id,
        payAmount: pay
      });
      remaining -= pay;
    }
    scenarios.push({
      action: `Distribute $${monthlyBudget} across highest utilization accounts`,
      details: actions
    });
  }
  return scenarios;
}

/**
 * Helper: Project score boost from utilization change
 */
function projectScoreBoost(utilization) {
  // Simple model: <10% = +40, <30% = +20, <50% = +10, >50% = 0
  if (utilization < 0.1) return 40;
  if (utilization < 0.3) return 20;
  if (utilization < 0.5) return 10;
  return 0;
}

/**
 * Helper: Rank accounts to pay first for optimal utilization
 */
function rankAccounts(accounts) {
  // Rank by highest utilization, then highest balance
  return [...accounts].sort((a, b) => {
    const utilA = a.limit > 0 ? a.balance / a.limit : 0;
    const utilB = b.limit > 0 ? b.balance / b.limit : 0;
    if (utilB !== utilA) return utilB - utilA;
    return b.balance - a.balance;
  });
}

/**
 * Helper: Project score impact and loan eligibility changes
 */
function projectScoreAndEligibility(accounts, overallUtilization) {
  // Assume score impact and eligibility thresholds
  const score = 700 + projectScoreBoost(overallUtilization);
  const eligibleForLoan = overallUtilization < 0.3;
  return {
    projectedScore: score,
    eligibleForLoan
  };
}

/**
 * Helper: Recommend monthly paydown targets
 */
function recommendMonthlyTargets(accounts, targetUtilization = 0.3) {
  // Recommend paydown amounts to reach target utilization
  return accounts.map(acc => {
    const currentUtil = acc.limit > 0 ? acc.balance / acc.limit : 0;
    if (currentUtil > targetUtilization) {
      const targetBalance = acc.limit * targetUtilization;
      const paydown = Math.max(0, acc.balance - targetBalance);
      return {
        accountId: acc.id,
        name: acc.name,
        recommendedPaydown: paydown
      };
    }
    return null;
  }).filter(Boolean);
}

/**
 * Helper: Generate alerts for high utilization
 */
function generateAlerts(accounts, threshold = 0.5) {
  return accounts.filter(acc => acc.limit > 0 && (acc.balance / acc.limit) > threshold)
    .map(acc => ({
      accountId: acc.id,
      name: acc.name,
      message: `High utilization: ${(acc.balance / acc.limit * 100).toFixed(1)}% on ${acc.name}`
    }));
}

/**
 * Advanced: Multi-account paydown strategy simulation
 */
function simulateMultiAccountPaydown(accounts, totalBudget) {
  // Distribute budget to minimize overall utilization
  let remaining = totalBudget;
  const sorted = [...accounts].sort((a, b) => (b.balance / b.limit) - (a.balance / a.limit));
  const actions = [];
  for (let i = 0; i < sorted.length && remaining > 0; i++) {
    const pay = Math.min(remaining, sorted[i].balance);
    actions.push({
      accountId: sorted[i].id,
      name: sorted[i].name,
      payAmount: pay,
      newBalance: sorted[i].balance - pay,
      newUtilization: sorted[i].limit > 0 ? (sorted[i].balance - pay) / sorted[i].limit : 0
    });
    remaining -= pay;
  }
  // Calculate new overall utilization
  const newTotalBalance = actions.reduce((sum, a) => sum + a.newBalance, 0) + sorted.slice(actions.length).reduce((sum, a) => sum + a.balance, 0);
  const newTotalLimit = sorted.reduce((sum, a) => sum + a.limit, 0);
  const newOverallUtilization = newTotalLimit > 0 ? newTotalBalance / newTotalLimit : 0;
  return {
    actions,
    newOverallUtilization,
    projectedScoreBoost: projectScoreBoost(newOverallUtilization)
  };
}

/**
 * Advanced: Utilization trend forecasting
 */
function forecastUtilizationTrends(accounts, months = 6, monthlyPaydown = 0) {
  // Forecast utilization for each account over time
  const forecasts = accounts.map(acc => {
    let balance = acc.balance;
    const trend = [];
    for (let m = 1; m <= months; m++) {
      balance = Math.max(0, balance - monthlyPaydown);
      const utilization = acc.limit > 0 ? balance / acc.limit : 0;
      trend.push({ month: m, balance, utilization });
    }
    return {
      accountId: acc.id,
      name: acc.name,
      trend
    };
  });
  return forecasts;
}

/**
 * Advanced: Generate paydown calendar
 */
function generatePaydownCalendar(accounts, monthlyBudget, targetUtilization = 0.3) {
  // Plan monthly payments to reach target utilization
  const calendar = [];
  let month = 1;
  let currentAccounts = accounts.map(a => ({ ...a }));
  while (currentAccounts.some(a => a.limit > 0 && (a.balance / a.limit) > targetUtilization) && month <= 24) {
    const sorted = [...currentAccounts].sort((a, b) => (b.balance / b.limit) - (a.balance / a.limit));
    let remaining = monthlyBudget;
    const payments = [];
    for (let i = 0; i < sorted.length && remaining > 0; i++) {
      const pay = Math.min(remaining, sorted[i].balance);
      sorted[i].balance -= pay;
      payments.push({ accountId: sorted[i].id, name: sorted[i].name, payAmount: pay, newBalance: sorted[i].balance });
      remaining -= pay;
    }
    calendar.push({ month, payments });
    currentAccounts = sorted;
    month++;
  }
  return calendar;
}

/**
 * Advanced: Custom utilization target analysis
 */
function analyzeCustomTargets(accounts, customTargets) {
  // For each account, analyze paydown needed to reach custom target
  return accounts.map(acc => {
    const target = customTargets[acc.id] ?? 0.3;
    const currentUtil = acc.limit > 0 ? acc.balance / acc.limit : 0;
    const paydown = currentUtil > target ? acc.balance - acc.limit * target : 0;
    return {
      accountId: acc.id,
      name: acc.name,
      targetUtilization: target,
      recommendedPaydown: paydown
    };
  });
}

class CreditUtilizationOptimizerService {
  async optimizeCreditUtilization(userData) {
    const { accounts, monthlyBudget = 0, targetUtilization = 0.3 } = userData;
    // Analyze current utilization
    const { accountUtilization, overallUtilization } = calculateUtilization(accounts);
    // Simulate paydown scenarios
    const paydownScenarios = simulatePaydownScenarios(accountUtilization, monthlyBudget);
    // Rank accounts to pay first
    const rankedAccounts = rankAccounts(accountUtilization);
    // Project score impact and loan eligibility
    const scoreProjections = projectScoreAndEligibility(accountUtilization, overallUtilization);
    // Recommend monthly paydown targets
    const monthlyTargets = recommendMonthlyTargets(accountUtilization, targetUtilization);
    // Generate alerts for high utilization
    const alerts = generateAlerts(accountUtilization);
    return {
      utilizationSummary: {
        accountUtilization,
        overallUtilization
      },
      paydownScenarios,
      rankedAccounts,
      scoreProjections,
      monthlyTargets,
      alerts
    };
  }

  /**
   * Simulate multi-account paydown strategy
   */
  simulateMultiAccountPaydown(accounts, totalBudget) {
    return simulateMultiAccountPaydown(accounts, totalBudget);
  }

  /**
   * Forecast utilization trends
   */
  forecastUtilizationTrends(accounts, months, monthlyPaydown) {
    return forecastUtilizationTrends(accounts, months, monthlyPaydown);
  }

  /**
   * Generate paydown calendar
   */
  generatePaydownCalendar(accounts, monthlyBudget, targetUtilization) {
    return generatePaydownCalendar(accounts, monthlyBudget, targetUtilization);
  }

  /**
   * Analyze custom utilization targets
   */
  analyzeCustomTargets(accounts, customTargets) {
    return analyzeCustomTargets(accounts, customTargets);
  }
}

export default new CreditUtilizationOptimizerService();
