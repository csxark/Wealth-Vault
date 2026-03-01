import { ChatbotResponse } from "../components/chatbot/chatbot.types";

const CHATBOT_API_URL = "/api/chatbot";

export const chatbotService = {
  async sendMessage(message: string): Promise<ChatbotResponse> {
    const response = await fetch(CHATBOT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error("Failed to get chatbot response");
    }

    return response.json();
  },
};
