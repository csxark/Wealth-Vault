import axios from 'axios';

// Get API key directly from environment
const GEMINI_API_KEY = 'AIzaSyAXIPWb466pn3aJWUa2cQ_VCZhwUnd1hQo';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

export async function fetchGeminiResponse(userMessage: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    console.error('Gemini API key not found:', import.meta.env);
    return 'Sorry, the AI service is temporarily unavailable.';
  }
  try {
    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: userMessage
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024
        }
      },
      {
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );
    // Extract response from Gemini API
    const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (typeof generatedText === 'string' && generatedText.trim().length > 0) {
      return generatedText.trim();
    }
    
    return 'Thank you for your message! I am here to help with your financial questions and goals.';
  } catch (error: any) {
    console.error('Gemini API Error:', error.response?.data || error.message);
    return 'I apologize, but I am having trouble connecting to my AI services right now. Please try again in a moment.';
  }
}
