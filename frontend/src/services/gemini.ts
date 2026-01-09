import axios from "axios";

export const fetchGeminiResponse = async (message: string): Promise<string> => {
  const res = await axios.post("http://localhost:5001/api/gemini", {
    message
  });

  return res.data.text; // ✅ FIXED
};
