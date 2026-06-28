import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL;

export const fetchGeminiResponse = async (message: string): Promise<string> => {
  const res = await axios.post(`${API_BASE_URL}/gemini/chat`, {
    message
  });

  return res.data.text;
};
