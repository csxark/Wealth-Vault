// Who sent the message
export type ChatRole = "user" | "assistant";

// Spending behavior classification
export type SpendingPattern = "safe" | "impulsive" | "anxious";

// Mini financial snapshot shown inside chat
export interface MiniReportData {
  expenses: number;
  income: number;
  savings: number;
  pattern: SpendingPattern;
}

// Single chat message
export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;

  // Optional structured UI blocks
  miniReport?: MiniReportData;
  suggestedAction?: string;
  timestamp: number;
}

// API response from backend chatbot
export interface ChatbotResponse {
  reply: string;
  miniReport?: MiniReportData;
  suggestedAction?: string;
}
