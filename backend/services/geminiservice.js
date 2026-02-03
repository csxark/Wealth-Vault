// services/geminiService.js
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);

export async function getGeminiResponse(userMessage) {
  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(userMessage);
    const response = await result.response;
    return response.text();
  } catch (err) {
    console.error("Gemini API error:", err);
    return "Sorry, Gemini service is unavailable right now.";
  }
}

export async function generateInsights(prompt) {
  try {
    const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (err) {
    console.error("Gemini Insights error:", err);
    return "AI analysis is currently unavailable. Please review manually.";
  }
}

export default { getGeminiResponse, generateInsights };
