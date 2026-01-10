// routes/gemini.js
import express from "express";
import { getGeminiResponse } from "../services/geminiService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ text: "Message is required" });

  const text = await getGeminiResponse(message);
  res.json({ text });
});

export default router;
