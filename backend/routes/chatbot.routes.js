import express from "express";
import { getGeminiResponse } from "../services/geminiservice.js";
import aiInsightsService from "../services/aiInsightsService.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

/**
 * POST /api/chatbot
 * AI-powered financial coach chatbot with context-aware responses
 */
router.post("/chatbot", authenticateToken, async (req, res) => {
  const { message } = req.body;
  const userId = req.user.id;

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      reply: "Invalid message received.",
    });
  }

  try {
    // Get user's financial data for context
    const insights = await aiInsightsService.generateInsights(userId);

    // Prepare context from insights
    const contextData = insights.dataSummary
      ? `\nUser's Financial Summary:\n- Total Expenses: ${insights.dataSummary.expenseCount} transactions\n- Investments: ${insights.dataSummary.investmentCount} holdings\n- Savings Goals: ${insights.dataSummary.savingsGoalCount} goals\n\nAI Insights:\n${insights.insights}`
      : '';

    // Build prompt for Gemini
    const prompt = `
You are an AI Financial Coach helping users with their personal finance questions.
${contextData}

User's Question: ${message}

Provide a helpful, personalized response. Keep it concise and actionable.
If the user asks about specific financial actions, provide clear recommendations.
`;

    const aiResponse = await getGeminiResponse([{
      role: 'user',
      contents: [{ text: prompt }]
    }]);

    return res.json({
      reply: aiResponse,
      insights: insights.insights,
      dataSummary: insights.dataSummary,
      suggestedAction: generateSuggestedAction(message, insights),
    });
  } catch (error) {
    console.error('Error in chatbot:', error);
    // Fallback to simple response if AI fails
    return res.json({
      reply: "I'm having trouble analyzing your data right now. How can I help you with your finances today?",
      suggestedAction: "Try asking about your spending patterns or savings goals.",
    });
  }
});

/**
 * Generate suggested action based on user message and insights
 */
function generateSuggestedAction(message, insights) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('save') || lowerMessage.includes('saving')) {
    return "Would you like to create a new savings goal?";
  }
  if (lowerMessage.includes('spend') || lowerMessage.includes('spending')) {
    return "Would you like me to analyze your spending patterns?";
  }
  if (lowerMessage.includes('invest') || lowerMessage.includes('investment')) {
    return "Would you like investment recommendations based on your risk profile?";
  }
  if (lowerMessage.includes('budget')) {
    return "Would you like help setting up a budget?";
  }

  // Default suggestions based on financial health
  if (insights.dataSummary?.expenseCount > 50) {
    return "I notice you have many transactions. Would you like spending categorization help?";
  }
  if (insights.dataSummary?.savingsGoalCount === 0) {
    return "You haven't set any savings goals. Would you like to create one?";
  }

  return "Feel free to ask about spending, savings, investments, or budgeting!";
}

export default router;
