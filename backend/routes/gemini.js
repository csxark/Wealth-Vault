// routes/gemini.js
import express from "express";
import { getAIProvider } from "../services/aiProvider.js";
import { protect } from "../middleware/auth.js";
import { calculateUserFinancialHealth } from "../services/predictionService.js";
import db from "../config/db.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = express.Router();

/**
 * @swagger
 * /gemini/chat:
 *   post:
 *     summary: Get AI response from Gemini (basic chat)
 *     tags: [AI]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: AI response
 */
router.post("/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ text: "Message is required" });

  const provider = getAIProvider();
  const text = await provider.generateText(message);
  res.json({ text });
});

/**
 * @swagger
 * /gemini/financial-advice:
 *   post:
 *     summary: Get personalized financial advice from AI based on user's financial data
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               question:
 *                 type: string
 *                 description: Specific financial question (optional)
 *               context:
 *                 type: string
 *                 enum: [general, savings, debt, budget, goals]
 *                 description: Context for the advice
 *     responses:
 *       200:
 *         description: Personalized financial advice
 */
router.post("/financial-advice", protect, async (req, res) => {
  try {
    const { question, context = "general" } = req.body;

    // Get user's financial health data
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = now;

    const healthData = await calculateUserFinancialHealth(req.user.id, start, end);

    // Get user info
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));

    // Create structured financial summary for Gemini
    const financialSummary = `
Financial Profile Analysis:
- Overall Health Score: ${healthData.overallScore.toFixed(1)}/100 (${healthData.rating})
- Monthly Income: $${healthData.metrics.monthlyIncome.toFixed(2)}
- Monthly Expenses: $${healthData.metrics.monthlyExpenses.toFixed(2)}
- Savings Rate: ${healthData.metrics.savingsRate.toFixed(1)}%
- Debt-to-Income Ratio: ${healthData.metrics.dti.toFixed(1)}%
- Emergency Fund: ${healthData.metrics.emergencyFundMonths.toFixed(1)} months
- Budget Adherence: ${healthData.metrics.budgetAdherence.toFixed(1)}%
- Spending Volatility: ${healthData.metrics.volatility.toFixed(1)}%

Cash Flow Prediction (Next Month):
- Predicted Expenses: $${healthData.cashFlowPrediction.predictedExpenses.toFixed(2)}
- Predicted Balance: $${healthData.cashFlowPrediction.predictedBalance.toFixed(2)}
- Trend: ${healthData.cashFlowPrediction.trend}
- Confidence: ${healthData.cashFlowPrediction.confidence}
${healthData.cashFlowPrediction.warning ? `- Warning: ${healthData.cashFlowPrediction.warning}` : ''}

Top Insights:
${healthData.insights.slice(0, 5).map(i => `- ${i.title}: ${i.message}`).join('\n')}

Current Recommendation:
${healthData.recommendation}
`;

    // Create context-specific prompt
    let prompt = `You are a professional financial advisor. Based on the following financial data, provide personalized, actionable advice.\n\n${financialSummary}\n\n`;

    if (question) {
      prompt += `User Question: ${question}\n\n`;
    }

    switch (context) {
      case "savings":
        prompt += "Focus your advice on improving savings rate and building wealth.";
        break;
      case "debt":
        prompt += "Focus your advice on debt management and reduction strategies.";
        break;
      case "budget":
        prompt += "Focus your advice on budgeting strategies and expense management.";
        break;
      case "goals":
        prompt += "Focus your advice on achieving financial goals and long-term planning.";
        break;
      default:
        prompt += "Provide comprehensive financial advice covering all aspects.";
    }

    prompt += "\n\nProvide specific, actionable advice in a clear, encouraging tone. Include 3-5 concrete steps they can take.";

    // Get AI response
    const provider = getAIProvider();
    const advice = await provider.generateText(prompt);

    res.json({
      success: true,
      data: {
        advice,
        healthScore: healthData.overallScore,
        rating: healthData.rating,
        context,
        insights: healthData.insights.filter(i => i.priority === 'critical' || i.priority === 'high'),
      },
    });
  } catch (error) {
    console.error("Financial advice error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while generating financial advice",
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /gemini/analyze-spending:
 *   post:
 *     summary: Get AI analysis of spending patterns with recommendations
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category:
 *                 type: string
 *                 description: Specific category to analyze (optional)
 *     responses:
 *       200:
 *         description: Spending analysis with AI insights
 */
router.post("/analyze-spending", protect, async (req, res) => {
  try {
    const { category } = req.body;

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = now;

    const healthData = await calculateUserFinancialHealth(req.user.id, start, end);

    const prompt = `Analyze this spending data and provide insights:

Spending Volatility: ${healthData.metrics.volatility.toFixed(1)}%
Day of Week Analysis:
${JSON.stringify(healthData.dayOfWeekAnalysis, null, 2)}

Category Concentration:
- Dominant Category: ${healthData.concentrationMetrics.dominantCategory} (${healthData.concentrationMetrics.dominantCategoryPercentage.toFixed(1)}%)
- Diversification Score: ${healthData.concentrationMetrics.diversificationScore.toFixed(1)}/100

${category ? `Focus on: ${category}` : 'Analyze all categories'}

Provide 3-4 specific observations and actionable recommendations to optimize spending patterns.`;

    const provider = getAIProvider();
    const analysis = await provider.generateText(prompt);

    res.json({
      success: true,
      data: {
        analysis,
        patterns: {
          dayOfWeek: healthData.dayOfWeekAnalysis,
          concentration: healthData.concentrationMetrics,
          volatility: healthData.metrics.volatility,
        },
      },
    });
  } catch (error) {
    console.error("Spending analysis error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while analyzing spending",
    });
  }
});

/**
 * @swagger
 * /gemini/budget-optimization:
 *   post:
 *     summary: Get AI-powered budget optimization suggestions
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Budget optimization plan
 */
router.post("/budget-optimization", protect, async (req, res) => {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = now;

    const healthData = await calculateUserFinancialHealth(req.user.id, start, end);

    const prompt = `Create a personalized budget optimization plan:

Current Financial Situation:
- Income: $${healthData.metrics.monthlyIncome.toFixed(2)}/month
- Expenses: $${healthData.metrics.monthlyExpenses.toFixed(2)}/month
- Savings Rate: ${healthData.metrics.savingsRate.toFixed(1)}%
- Budget Adherence: ${healthData.metrics.budgetAdherence.toFixed(1)}%

Next Month Prediction:
- Predicted Expenses: $${healthData.cashFlowPrediction.predictedExpenses.toFixed(2)}
- Predicted Balance: $${healthData.cashFlowPrediction.predictedBalance.toFixed(2)}

Critical Insights:
${healthData.insights.filter(i => i.priority === 'critical' || i.priority === 'high').map(i => `- ${i.message}`).join('\n')}

Create a detailed budget optimization plan with:
1. Recommended budget allocations by category
2. Specific areas to cut spending
3. Strategies to increase savings
4. Timeline for implementation
5. Expected outcomes`;

    const provider = getAIProvider();
    const optimization = await provider.generateText(prompt);

    res.json({
      success: true,
      data: {
        optimization,
        currentMetrics: {
          income: healthData.metrics.monthlyIncome,
          expenses: healthData.metrics.monthlyExpenses,
          savingsRate: healthData.metrics.savingsRate,
          budgetAdherence: healthData.metrics.budgetAdherence,
        },
        prediction: healthData.cashFlowPrediction,
      },
    });
  } catch (error) {
    console.error("Budget optimization error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while optimizing budget",
    });
  }
});

export default router;
