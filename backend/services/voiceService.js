import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Process voice input and extract expense details using NLP
 * @param {string} transcript - The transcribed voice input
 * @param {number} userId - User ID for context
 * @returns {Promise<Object>} Extracted expense data
 */
export async function processVoiceExpense(transcript, userId) {
  try {
    const prompt = `Extract expense information from this voice transcript: "${transcript}"

Please return a JSON object with the following fields:
- amount: number (the expense amount, null if not found)
- description: string (brief description of the expense, null if not found)
- category: string (one of: "safe", "impulsive", "anxious" - based on the expense type, default to "safe")
- paymentMethod: string (one of: "cash", "card", "upi", "netbanking", "other", default to "card")
- date: string (ISO date string, use today's date if not specified)
- location: string (location name if mentioned, null otherwise)
- tags: array of strings (relevant tags, empty array if none)

Only return valid JSON, no additional text. If no expense information is found, return an object with all fields as null.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are an AI assistant that extracts expense information from voice transcripts. Always return valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse the JSON response
    const extractedData = JSON.parse(content);

    // Validate and sanitize the extracted data
    const sanitizedData = {
      amount: typeof extractedData.amount === 'number' && extractedData.amount > 0 ? extractedData.amount : null,
      description: typeof extractedData.description === 'string' && extractedData.description.trim() ? extractedData.description.trim() : null,
      category: ['safe', 'impulsive', 'anxious'].includes(extractedData.category) ? extractedData.category : 'safe',
      paymentMethod: ['cash', 'card', 'upi', 'netbanking', 'other'].includes(extractedData.paymentMethod) ? extractedData.paymentMethod : 'card',
      date: extractedData.date && !isNaN(new Date(extractedData.date).getTime()) ? new Date(extractedData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      location: typeof extractedData.location === 'string' && extractedData.location.trim() ? extractedData.location.trim() : null,
      tags: Array.isArray(extractedData.tags) ? extractedData.tags.filter(tag => typeof tag === 'string' && tag.trim()) : []
    };

    return {
      success: true,
      data: sanitizedData,
      transcript: transcript
    };

  } catch (error) {
    console.error('Error processing voice expense:', error);
    return {
      success: false,
      error: error.message,
      transcript: transcript
    };
  }
}

/**
 * Store voice recording temporarily for processing
 * @param {Buffer} audioBuffer - The audio data buffer
 * @param {string} filename - Original filename
 * @returns {Promise<string>} Path to stored file
 */
export async function storeVoiceRecording(audioBuffer, filename) {
  try {
    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate unique filename
    const uniqueFilename = `voice_${Date.now()}_${filename}`;
    const filePath = path.join(tempDir, uniqueFilename);

    // Write the audio buffer to file
    fs.writeFileSync(filePath, audioBuffer);

    return filePath;
  } catch (error) {
    console.error('Error storing voice recording:', error);
    throw new Error('Failed to store voice recording');
  }
}

/**
 * Delete temporary voice recording after processing
 * @param {string} filePath - Path to the file to delete
 */
export async function deleteVoiceRecording(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error deleting voice recording:', error);
  }
}

/**
 * Transcribe audio file using OpenAI Whisper (if needed for server-side processing)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(filePath) {
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1',
      language: 'en' // Adjust based on user locale if needed
    });

    return transcription.text;
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw new Error('Failed to transcribe audio');
  }
}

export default {
  processVoiceExpense,
  storeVoiceRecording,
  deleteVoiceRecording,
  transcribeAudio
};
