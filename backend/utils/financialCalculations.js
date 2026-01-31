/**
 * Financial Health Calculations Utility
 * Provides core mathematical functions for financial health scoring and analysis
 */

/**
 * Calculate Debt-to-Income (DTI) ratio
 * @param {number} monthlyDebt - Total monthly debt payments
 * @param {number} monthlyIncome - Gross monthly income
 * @returns {number} DTI ratio as a percentage
 */
export function calculateDTI(monthlyDebt, monthlyIncome) {
  if (!monthlyIncome || monthlyIncome <= 0) return 0;
  return (monthlyDebt / monthlyIncome) * 100;
}

/**
 * Calculate Savings Rate
 * @param {number} monthlyIncome - Gross monthly income
 * @param {number} monthlyExpenses - Total monthly expenses
 * @returns {number} Savings rate as a percentage
 */
export function calculateSavingsRate(monthlyIncome, monthlyExpenses) {
  if (!monthlyIncome || monthlyIncome <= 0) return 0;
  const savings = monthlyIncome - monthlyExpenses;
  return (savings / monthlyIncome) * 100;
}

/**
 * Calculate Spending Volatility using standard deviation
 * @param {Array<number>} monthlySpending - Array of monthly spending amounts
 * @returns {object} Object containing volatility metrics
 */
export function calculateSpendingVolatility(monthlySpending) {
  if (!monthlySpending || monthlySpending.length === 0) {
    return { volatility: 0, average: 0, stdDev: 0 };
  }

  const n = monthlySpending.length;
  const average = monthlySpending.reduce((sum, val) => sum + val, 0) / n;
  
  const squaredDiffs = monthlySpending.map(val => Math.pow(val - average, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / n;
  const stdDev = Math.sqrt(variance);
  
  // Volatility as coefficient of variation (%)
  const volatility = average > 0 ? (stdDev / average) * 100 : 0;

  return {
    volatility: Number(volatility.toFixed(2)),
    average: Number(average.toFixed(2)),
    stdDev: Number(stdDev.toFixed(2)),
  };
}

/**
 * Calculate Emergency Fund Adequacy
 * @param {number} emergencyFund - Current emergency fund amount
 * @param {number} monthlyExpenses - Average monthly expenses
 * @returns {object} Emergency fund metrics
 */
export function calculateEmergencyFundAdequacy(emergencyFund, monthlyExpenses) {
  if (!monthlyExpenses || monthlyExpenses <= 0) {
    return { monthsCovered: 0, adequacy: 'insufficient', score: 0 };
  }

  const monthsCovered = emergencyFund / monthlyExpenses;
  let adequacy, score;

  if (monthsCovered >= 6) {
    adequacy = 'excellent';
    score = 100;
  } else if (monthsCovered >= 3) {
    adequacy = 'good';
    score = 75;
  } else if (monthsCovered >= 1) {
    adequacy = 'fair';
    score = 50;
  } else {
    adequacy = 'insufficient';
    score = Math.min(monthsCovered * 50, 49);
  }

  return {
    monthsCovered: Number(monthsCovered.toFixed(2)),
    adequacy,
    score: Number(score.toFixed(0)),
  };
}

/**
 * Calculate Budget Adherence
 * @param {number} actualSpending - Actual spending amount
 * @param {number} budgetAmount - Budgeted amount
 * @returns {object} Budget adherence metrics
 */
export function calculateBudgetAdherence(actualSpending, budgetAmount) {
  if (!budgetAmount || budgetAmount <= 0) {
    return { adherence: 0, status: 'no_budget', variance: 0 };
  }

  const adherence = (budgetAmount - actualSpending) / budgetAmount * 100;
  const variance = actualSpending - budgetAmount;
  
  let status;
  if (adherence >= 10) status = 'excellent'; // Under budget by 10%+
  else if (adherence >= 0) status = 'good'; // On budget or slightly under
  else if (adherence >= -10) status = 'fair'; // Over budget by up to 10%
  else status = 'poor'; // Over budget by more than 10%

  return {
    adherence: Number(adherence.toFixed(2)),
    variance: Number(variance.toFixed(2)),
    status,
    percentage: Number(((actualSpending / budgetAmount) * 100).toFixed(2)),
  };
}

/**
 * Calculate Goal Progress Score
 * @param {Array<object>} goals - Array of goal objects with currentAmount and targetAmount
 * @returns {object} Goal progress metrics
 */
export function calculateGoalProgress(goals) {
  if (!goals || goals.length === 0) {
    return { averageProgress: 0, onTrackCount: 0, totalGoals: 0, score: 0 };
  }

  const goalsWithProgress = goals.map(goal => {
    const progress = (goal.currentAmount / goal.targetAmount) * 100;
    return {
      ...goal,
      progress: Number(progress.toFixed(2)),
      onTrack: progress >= 50, // Consider on track if >= 50% complete
    };
  });

  const averageProgress = goalsWithProgress.reduce((sum, g) => sum + g.progress, 0) / goals.length;
  const onTrackCount = goalsWithProgress.filter(g => g.onTrack).length;
  
  // Score based on average progress
  const score = Math.min(averageProgress, 100);

  return {
    averageProgress: Number(averageProgress.toFixed(2)),
    onTrackCount,
    totalGoals: goals.length,
    score: Number(score.toFixed(0)),
    goals: goalsWithProgress,
  };
}

/**
 * Calculate comprehensive Financial Health Score
 * @param {object} metrics - Object containing all financial metrics
 * @returns {object} Complete health score with breakdown
 */
export function calculateFinancialHealthScore(metrics) {
  const {
    dti = 0,
    savingsRate = 0,
    volatility = 0,
    emergencyFundScore = 0,
    budgetAdherence = 0,
    goalProgress = 0,
  } = metrics;

  // Weight each factor (total = 100%)
  const weights = {
    dti: 20,              // Debt-to-Income ratio
    savingsRate: 25,      // Savings rate
    volatility: 15,       // Spending consistency
    emergencyFund: 15,    // Emergency fund adequacy
    budgetAdherence: 15,  // Budget adherence
    goalProgress: 10,     // Goal achievement
  };

  // Calculate individual scores (0-100 scale)
  const scores = {
    dti: calculateDTIScore(dti),
    savingsRate: calculateSavingsRateScore(savingsRate),
    volatility: calculateVolatilityScore(volatility),
    emergencyFund: emergencyFundScore,
    budgetAdherence: calculateBudgetAdherenceScore(budgetAdherence),
    goalProgress: goalProgress,
  };

  // Calculate weighted average
  const totalScore = Object.keys(weights).reduce((sum, key) => {
    return sum + (scores[key] * weights[key] / 100);
  }, 0);

  // Determine overall health rating
  let rating, recommendation;
  if (totalScore >= 80) {
    rating = 'Excellent';
    recommendation = 'Your financial health is outstanding! Keep up the great work and consider advanced investment strategies.';
  } else if (totalScore >= 60) {
    rating = 'Good';
    recommendation = 'You\'re doing well! Focus on increasing your savings rate and building your emergency fund.';
  } else if (totalScore >= 40) {
    rating = 'Fair';
    recommendation = 'There\'s room for improvement. Consider reducing unnecessary expenses and creating a stricter budget.';
  } else {
    rating = 'Needs Improvement';
    recommendation = 'Immediate attention needed. Focus on reducing debt, cutting expenses, and building an emergency fund.';
  }

  return {
    overallScore: Number(totalScore.toFixed(2)),
    rating,
    recommendation,
    breakdown: scores,
    weights,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Convert DTI ratio to a 0-100 score
 */
function calculateDTIScore(dti) {
  if (dti <= 20) return 100;
  if (dti <= 28) return 90;
  if (dti <= 36) return 70;
  if (dti <= 43) return 50;
  if (dti <= 50) return 30;
  return Math.max(10, 50 - dti);
}

/**
 * Convert savings rate to a 0-100 score
 */
function calculateSavingsRateScore(savingsRate) {
  if (savingsRate >= 30) return 100;
  if (savingsRate >= 20) return 90;
  if (savingsRate >= 10) return 70;
  if (savingsRate >= 5) return 50;
  if (savingsRate >= 0) return Math.max(20, savingsRate * 4);
  return 10; // Negative savings (spending more than income)
}

/**
 * Convert volatility to a 0-100 score (lower volatility = higher score)
 */
function calculateVolatilityScore(volatility) {
  if (volatility <= 10) return 100;
  if (volatility <= 20) return 90;
  if (volatility <= 30) return 70;
  if (volatility <= 40) return 50;
  if (volatility <= 50) return 30;
  return Math.max(10, 60 - volatility);
}

/**
 * Convert budget adherence to a 0-100 score
 */
function calculateBudgetAdherenceScore(adherence) {
  // adherence is % (positive = under budget, negative = over budget)
  if (adherence >= 10) return 100;
  if (adherence >= 5) return 95;
  if (adherence >= 0) return 90;
  if (adherence >= -5) return 80;
  if (adherence >= -10) return 60;
  if (adherence >= -20) return 40;
  if (adherence >= -30) return 20;
  return Math.max(5, 30 + adherence);
}

/**
 * Predict next month's cash flow based on historical data
 * @param {Array<object>} monthlyData - Array of monthly financial data
 * @param {Array<object>} recurringExpenses - Array of recurring expenses
 * @param {number} monthlyIncome - Monthly income
 * @returns {object} Cash flow prediction
 */
export function predictCashFlow(monthlyData, recurringExpenses, monthlyIncome) {
  if (!monthlyData || monthlyData.length < 2) {
    return {
      predictedExpenses: 0,
      predictedIncome: monthlyIncome || 0,
      predictedBalance: monthlyIncome || 0,
      confidence: 'low',
      warning: null,
    };
  }

  // Calculate average monthly expenses
  const avgExpenses = monthlyData.reduce((sum, month) => sum + month.total, 0) / monthlyData.length;
  
  // Calculate trend (simple linear regression slope)
  const n = monthlyData.length;
  const xMean = (n - 1) / 2;
  const yMean = avgExpenses;
  
  let numerator = 0;
  let denominator = 0;
  
  monthlyData.forEach((month, index) => {
    numerator += (index - xMean) * (month.total - yMean);
    denominator += Math.pow(index - xMean, 2);
  });
  
  const slope = denominator !== 0 ? numerator / denominator : 0;
  
  // Predict next month's expenses
  let predictedExpenses = avgExpenses + slope;
  
  // Add recurring expenses
  const recurringTotal = recurringExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  predictedExpenses += recurringTotal;
  
  // Calculate confidence based on volatility
  const volatility = calculateSpendingVolatility(monthlyData.map(m => m.total)).volatility;
  let confidence;
  if (volatility <= 15) confidence = 'high';
  else if (volatility <= 30) confidence = 'medium';
  else confidence = 'low';
  
  const predictedBalance = monthlyIncome - predictedExpenses;
  
  // Generate warning if needed
  let warning = null;
  if (predictedBalance < 0) {
    warning = `⚠️ Budget overflow predicted: You may overspend by $${Math.abs(predictedBalance).toFixed(2)} next month.`;
  } else if (predictedBalance < monthlyIncome * 0.1) {
    warning = `⚠️ Low savings predicted: Only $${predictedBalance.toFixed(2)} expected to be saved next month.`;
  }
  
  return {
    predictedExpenses: Number(predictedExpenses.toFixed(2)),
    predictedIncome: Number(monthlyIncome.toFixed(2)),
    predictedBalance: Number(predictedBalance.toFixed(2)),
    trend: slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable',
    trendAmount: Number(slope.toFixed(2)),
    confidence,
    volatility: Number(volatility.toFixed(2)),
    recurringExpensesTotal: Number(recurringTotal.toFixed(2)),
    warning,
  };
}

/**
 * Analyze spending by day of week
 * @param {Array<object>} expenses - Array of expense objects with date and amount
 * @returns {object} Day of week spending analysis
 */
export function analyzeSpendingByDayOfWeek(expenses) {
  const dayTotals = [0, 0, 0, 0, 0, 0, 0]; // Sunday to Saturday
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  expenses.forEach(expense => {
    const date = new Date(expense.date);
    const day = date.getDay();
    dayTotals[day] += expense.amount;
    dayCounts[day]++;
  });

  const analysis = dayNames.map((name, index) => ({
    day: name,
    total: Number(dayTotals[index].toFixed(2)),
    count: dayCounts[index],
    average: dayCounts[index] > 0 ? Number((dayTotals[index] / dayCounts[index]).toFixed(2)) : 0,
  }));

  // Find highest spending day
  const maxDay = analysis.reduce((max, day) => day.total > max.total ? day : max, analysis[0]);

  return {
    byDay: analysis,
    highestSpendingDay: maxDay.day,
    highestSpendingAmount: maxDay.total,
    weekdayTotal: analysis.slice(1, 6).reduce((sum, day) => sum + day.total, 0),
    weekendTotal: analysis[0].total + analysis[6].total,
  };
}

/**
 * Calculate category concentration (how diversified spending is)
 * @param {Array<object>} categorySpending - Array of category spending data
 * @returns {object} Concentration metrics
 */
export function calculateCategoryConcentration(categorySpending) {
  if (!categorySpending || categorySpending.length === 0) {
    return { concentrationIndex: 0, dominantCategory: null, diversificationScore: 0 };
  }

  const total = categorySpending.reduce((sum, cat) => sum + cat.total, 0);
  
  // Calculate Herfindahl-Hirschman Index (HHI)
  const hhi = categorySpending.reduce((sum, cat) => {
    const share = cat.total / total;
    return sum + Math.pow(share * 100, 2);
  }, 0);

  // Normalize HHI to 0-100 scale (higher = more concentrated)
  const concentrationIndex = Math.min(100, hhi / 100);
  
  // Find dominant category
  const dominantCategory = categorySpending.reduce((max, cat) => 
    cat.total > max.total ? cat : max, categorySpending[0]
  );

  // Diversification score (inverse of concentration)
  const diversificationScore = 100 - concentrationIndex;

  return {
    concentrationIndex: Number(concentrationIndex.toFixed(2)),
    dominantCategory: dominantCategory.categoryName,
    dominantCategoryPercentage: Number(((dominantCategory.total / total) * 100).toFixed(2)),
    diversificationScore: Number(diversificationScore.toFixed(2)),
    categoryCount: categorySpending.length,
  };
}
