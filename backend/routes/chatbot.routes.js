import express from "express";

const router = express.Router();

/**
 * POST /api/chatbot
 * Rule-based chatbot response (safe, deterministic)
 */
router.post("/chatbot", async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({
      reply: "Invalid message received.",
    });
  }

  // 🔒 TEMP deterministic data (DB-free)
  const income = 32000;
  const expenses = 18450;
  const savings = income - expenses;

  let pattern = "safe";
  if (expenses > income * 0.6) pattern = "impulsive";
  if (savings < income * 0.1) pattern = "anxious";

  return res.json({
    reply: "Here’s a quick snapshot of your finances based on recent activity.",
    miniReport: {
      income,
      expenses,
      savings,
      pattern,
    },
    suggestedAction:
      pattern === "impulsive"
        ? "Would you like help setting a spending limit?"
        : "Want to set a savings goal?",
  });
});

export default router;
