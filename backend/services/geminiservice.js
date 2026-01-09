// services/geminiService.js
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function getGeminiResponse(userMessage) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: userMessage,
    });

    return response?.text || "No response from Gemini.";
  } catch (err) {
    console.error("Gemini API error:", err);
    return "Sorry, Gemini service is unavailable right now.";
  }
}
