import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseHistoricalData, identifyRecurringPatterns, calculateSeasonalTrends } from './trendAnalyzer.js';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Generate AI-powered spending insights using Gemini
 * @param {string} userId - User ID
 * @param {Object} forecastData - Forecast data
 * @returns {Object} AI-generated insights
 */
export async function generateSpendingInsights(userId, forecastData) {
  try {
    const historicalData = await parseHistoricalData(userId, 12);
    const recurringPatterns = await identifyRecurringPatterns(userId);
    
    // Prepare context for Gemini
    const context = {
      summary: historicalData.summary,
      monthlyData: Object.entries(historicalData.monthlyData).slice(-6), // Last 6 months
      recurringPatterns: recurringPatterns.slice(0, 5), // Top 5 patterns
      forecast: {
        projectedBalance: forecastData.summary?.endBalance,
        netChange: forecastData.summary?.netChange,
        dangerZones: forecastData.dangerZones
      }
    };

    const prompt = `
You are a financial advisor analyzing a user's spending patterns and cash flow forecast. 

Historical Data (Last 6 months):
${JSON.stringify(context.monthlyData, null, 2)}

Recurring Patterns Detected:
${JSON.stringify(context.recurringPatterns, null, 2)}

Cash Flow Forecast:
- Current avg monthly expenses: $${context.summary.avgMonthlyExpenses}
- Current avg monthly income: $${context.summary.avgMonthlyIncome}
- Projected end balance: $${context.forecast.projectedBalance}
- Net change: $${context.forecast.netChange}
- Danger zones: ${context.forecast.dangerZones?.length || 0} periods of potential negative balance

Based on this data, provide:
1. Three key spending insights (be specific about amounts and categories)
2. Three actionable recommendations to improve financial health
3. One potential financial risk to watch out for
4. One positive trend or achievement to celebrate

Format your response as a JSON object with keys: insights, recommendations, risks, positives
Keep each item concise (1-2 sentences max).
`;

    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse AI response
    let aiInsights;
    try {
      // Extract JSON from response (handling markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      aiInsights = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        insights: ['Analysis in progress'],
        recommendations: ['Check back later'],
        risks: ['None identified'],
        positives: ['Good financial habits']
      };
    } catch (parseError) {
      console.warn('Failed to parse AI response, using fallback insights');
      aiInsights = {
        insights: [
          `Average monthly spending is $${context.summary.avgMonthlyExpenses}`,
          `${recurringPatterns.length} recurring expenses detected`,
          `Monthly savings rate: $${context.summary.avgMonthlySavings}`
        ],
        recommendations: [
          'Review recurring subscriptions for potential savings',
          'Build emergency fund to 3-6 months of expenses',
          'Monitor high-spending categories closely'
        ],
        risks: [
          context.forecast.dangerZones?.length > 0 
            ? `${context.forecast.dangerZones.length} periods of potential negative balance detected`
            : 'No immediate financial risks detected'
        ],
        positives: [
          context.summary.avgMonthlySavings > 0 
            ? `Maintaining positive cash flow of $${context.summary.avgMonthlySavings}/month`
            : 'Tracking expenses consistently'
        ]
      };
    }

    return {
      generatedAt: new Date().toISOString(),
      source: 'gemini-pro',
      ...aiInsights,
      metadata: {
        dataQuality: historicalData.summary.totalTransactions > 50 ? 'high' : 'medium',
        analysisDepth: 'comprehensive'
      }
    };
  } catch (error) {
    console.error('Error generating spending insights:', error);
    // Return fallback insights if AI fails
    return {
      generatedAt: new Date().toISOString(),
      source: 'fallback',
      insights: ['Continue tracking your expenses regularly'],
      recommendations: ['Review your budget monthly', 'Set up emergency fund'],
      risks: ['Insufficient data for detailed analysis'],
      positives: ['Building good financial habits'],
      metadata: {
        dataQuality: 'low',
        analysisDepth: 'basic',
        error: error.message
      }
    };
  }
}

/**
 * Detect unusual spending patterns (anomalies)
 * @param {string} userId - User ID
 * @returns {Array} Detected anomalies
 */
export async function detectSeasonalAnomalies(userId) {
  try {
    const historicalData = await parseHistoricalData(userId, 12);
    const seasonalTrends = await calculateSeasonalTrends(userId);
    const anomalies = [];

    // Calculate standard deviation for anomaly detection
    const allMonthlyExpenses = Object.values(historicalData.monthlyData).map(m => m.totalExpenses);
    const mean = allMonthlyExpenses.reduce((sum, val) => sum + val, 0) / allMonthlyExpenses.length;
    const stdDev = Math.sqrt(
      allMonthlyExpenses.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / allMonthlyExpenses.length
    );

    // Detect months with unusual spending (more than 2 standard deviations)
    Object.entries(historicalData.monthlyData).forEach(([monthKey, data]) => {
      const deviation = Math.abs(data.totalExpenses - mean) / stdDev;
      
      if (deviation > 2) {
        const percentDiff = ((data.totalExpenses - mean) / mean * 100).toFixed(1);
        anomalies.push({
          type: data.totalExpenses > mean ? 'high_spending' : 'low_spending',
          month: monthKey,
          amount: Math.round(data.totalExpenses * 100) / 100,
          expected: Math.round(mean * 100) / 100,
          deviation: Math.round(deviation * 100) / 100,
          percentDiff: parseFloat(percentDiff),
          severity: deviation > 3 ? 'high' : 'medium',
          description: `Spending was ${Math.abs(percentDiff)}% ${data.totalExpenses > mean ? 'above' : 'below'} average`
        });
      }
    });

    // Detect category-specific anomalies
    const categoryAnomalies = detectCategoryAnomalies(historicalData);
    anomalies.push(...categoryAnomalies);

    return anomalies.sort((a, b) => b.deviation - a.deviation);
  } catch (error) {
    console.error('Error detecting seasonal anomalies:', error);
    return [];
  }
}

/**
 * Detect anomalies in specific spending categories
 * @param {Object} historicalData - Historical data
 * @returns {Array} Category anomalies
 */
function detectCategoryAnomalies(historicalData) {
  const categoryAnomalies = [];
  const categoryTotals = {};

  // Aggregate category spending across all months
  Object.values(historicalData.monthlyData).forEach(month => {
    Object.entries(month.categoryBreakdown).forEach(([catId, amount]) => {
      if (!categoryTotals[catId]) {
        categoryTotals[catId] = [];
      }
      categoryTotals[catId].push(amount);
    });
  });

  // Analyze each category for anomalies
  Object.entries(categoryTotals).forEach(([catId, amounts]) => {
    if (amounts.length < 3) return; // Need at least 3 data points

    const mean = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
    const stdDev = Math.sqrt(
      amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length
    );

    // Check most recent amount
    const latestAmount = amounts[amounts.length - 1];
    const deviation = Math.abs(latestAmount - mean) / stdDev;

    if (deviation > 2) {
      categoryAnomalies.push({
        type: 'category_anomaly',
        categoryId: catId,
        amount: Math.round(latestAmount * 100) / 100,
        expected: Math.round(mean * 100) / 100,
        deviation: Math.round(deviation * 100) / 100,
        severity: deviation > 3 ? 'high' : 'medium',
        description: `Unusual spending in this category`
      });
    }
  });

  return categoryAnomalies;
}

/**
 * Predict future financial risks using AI
 * @param {string} userId - User ID
 * @param {Object} forecastData - Forecast data
 * @returns {Object} Risk assessment
 */
export async function predictFinancialRisks(userId, forecastData) {
  try {
    const anomalies = await detectSeasonalAnomalies(userId);
    const historicalData = await parseHistoricalData(userId, 6);

    const risks = [];

    // Risk 1: Declining balance trend
    if (forecastData.summary?.netChange < 0) {
      risks.push({
        type: 'declining_balance',
        severity: forecastData.summary.netChange < -500 ? 'high' : 'medium',
        impact: Math.abs(forecastData.summary.netChange),
        description: `Projected to lose $${Math.abs(forecastData.summary.netChange)} over forecast period`,
        mitigation: 'Review and reduce discretionary spending'
      });
    }

    // Risk 2: High spending volatility
    if (anomalies.length > 2) {
      risks.push({
        type: 'spending_volatility',
        severity: 'medium',
        impact: anomalies.length,
        description: `${anomalies.length} unusual spending patterns detected`,
        mitigation: 'Establish more consistent spending habits'
      });
    }

    // Risk 3: Insufficient emergency fund
    const avgMonthlyExpenses = historicalData.summary.avgMonthlyExpenses;
    const emergencyFundMonths = forecastData.currentBalance / avgMonthlyExpenses;
    
    if (emergencyFundMonths < 3) {
      risks.push({
        type: 'low_emergency_fund',
        severity: emergencyFundMonths < 1 ? 'critical' : 'high',
        impact: 3 - emergencyFundMonths,
        description: `Emergency fund covers only ${emergencyFundMonths.toFixed(1)} months of expenses`,
        mitigation: 'Aim for 3-6 months of expenses in emergency fund'
      });
    }

    // Risk 4: Danger zones
    if (forecastData.dangerZones && forecastData.dangerZones.length > 0) {
      risks.push({
        type: 'negative_balance_periods',
        severity: 'critical',
        impact: forecastData.dangerZones.length,
        description: `${forecastData.dangerZones.length} periods of potential overdraft detected`,
        mitigation: 'Increase income or reduce fixed expenses immediately'
      });
    }

    return {
      overallRisk: calculateOverallRiskLevel(risks),
      riskCount: risks.length,
      risks: risks.sort((a, b) => getRiskScore(b) - getRiskScore(a)),
      assessedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error predicting financial risks:', error);
    return {
      overallRisk: 'unknown',
      riskCount: 0,
      risks: [],
      error: error.message
    };
  }
}

/**
 * Calculate overall risk level from individual risks
 * @param {Array} risks - List of risks
 * @returns {string} Overall risk level
 */
function calculateOverallRiskLevel(risks) {
  if (risks.length === 0) return 'low';
  
  const criticalCount = risks.filter(r => r.severity === 'critical').length;
  const highCount = risks.filter(r => r.severity === 'high').length;
  
  if (criticalCount > 0) return 'critical';
  if (highCount > 1) return 'high';
  if (risks.length > 2) return 'medium';
  return 'low';
}

/**
 * Get numeric risk score for sorting
 * @param {Object} risk - Risk object
 * @returns {number} Risk score
 */
function getRiskScore(risk) {
  const severityScores = { critical: 4, high: 3, medium: 2, low: 1 };
  return severityScores[risk.severity] || 0;
}

export default {
  generateSpendingInsights,
  detectSeasonalAnomalies,
  predictFinancialRisks
};
