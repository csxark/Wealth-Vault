import { GoogleGenAI } from '@google/genai';
import AI_CONFIG from '../config/aiConfig.js';

/**
 * Abstract Base Class for AI Providers
 * Defines the interface that all AI providers must implement
 */
class BaseAIProvider {
    constructor(config) {
        if (new.target === BaseAIProvider) {
            throw new Error('Cannot instantiate abstract class BaseAIProvider');
        }
        this.config = config;
    }

    /**
     * Generate text content from a prompt
     * @param {string|Array} prompt - The input prompt or chat history
     * @param {Object} options - Generation options (model, temperature, etc.)
     * @returns {Promise<string>} Generated text
     */
    async generateText(prompt, options = {}) {
        throw new Error('Method generateText must be implemented');
    }

    /**
     * Generate JSON content from a prompt
     * @param {string} prompt - The input prompt
     * @param {Object} options - Generation options
     * @returns {Promise<Object>} Parsed JSON object
     */
    async generateJSON(prompt, options = {}) {
        throw new Error('Method generateJSON must be implemented');
    }
}

/**
 * Gemini Provider Implementation
 */
class GeminiProvider extends BaseAIProvider {
    constructor(config = AI_CONFIG.providers.gemini) {
        super(config);
        console.log('GeminiProvider config:', JSON.stringify(config));
        if (!config.apiKey) {
            console.warn('Gemini API key is missing. AI features will be disabled.');
        } else {
            this.client = new GoogleGenAI(config.apiKey);
        }
    }

    resolveModel(modelKey) {
        // Check if it's a known alias (fast, pro, etc.)
        if (this.config.models[modelKey]) {
            return this.config.models[modelKey];
        }
        // Otherwise return as is or default
        return modelKey || this.config.defaultModel;
    }

    async generateText(prompt, options = {}) {
        if (!this.client) throw new Error('Gemini API not configured');

        const modelName = this.resolveModel(options.model);
        const model = this.client.getGenerativeModel({ model: modelName });

        try {
            // Handle both string prompts and chat history arrays
            let result;
            if (Array.isArray(prompt)) {
                // Chat mode
                // Assuming prompt is [{role: 'user', parts: [{text: '...'}]}]
                // Gemini expects history + current message. simpler to just join for now or map correctly
                // For simplicity in this provider, if it's an array of objects with role/content, we treat it as valid chat history
                // but `generateContent` accepts an array of content parts

                // If the array structure matches Gemini's content structure, pass it directly
                result = await model.generateContent({ contents: prompt });
            } else {
                // String prompt
                result = await model.generateContent(prompt);
            }

            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Gemini generateText error:', error);
            throw error;
        }
    }

    async generateJSON(prompt, options = {}) {
        if (!this.client) throw new Error('Gemini API not configured');

        const modelName = this.resolveModel(options.model || 'experimental'); // Prefer new models for JSON
        // Gemini 1.5/2.0 supports response_mime_type: 'application/json'
        const model = this.client.getGenerativeModel({
            model: modelName,
            generationConfig: { responseMimeType: "application/json" }
        });

        try {
            // Append instruction to ensure JSON if not using a model that enforces it strictly
            const jsonPrompt = typeof prompt === 'string'
                ? `${prompt}\n\nReturn the result as a valid JSON object.`
                : prompt;

            const result = await model.generateContent(jsonPrompt);
            const response = await result.response;
            const text = response.text();

            try {
                // Clean markdown code blocks if present (despite mime type, sometimes it wraps)
                const cleanText = text.replace(/```json\n?|\n?```/g, '');
                return JSON.parse(cleanText);
            } catch (parseError) {
                console.error('Failed to parse JSON response:', text);
                throw new Error('AI response was not valid JSON');
            }
        } catch (error) {
            console.error('Gemini generateJSON error:', error);
            throw error;
        }
    }
}

/**
 * Mock Provider for Testing
 */
class MockProvider extends BaseAIProvider {
    async generateText(prompt) {
        return "This is a mock AI response.";
    }

    async generateJSON(prompt) {
        return { mock: true, message: "This is a mock JSON response" };
    }
}

/**
 * Factory to get the configured provider
 */
let instance = null;

export const getAIProvider = () => {
    if (instance) return instance;

    const type = AI_CONFIG.defaultProvider;

    if (AI_CONFIG.global.mockInDevelopment && !process.env.GEMINI_API_KEY) {
        console.log('Using Mock AI Provider');
        instance = new MockProvider({});
        return instance;
    }

    switch (type) {
        case 'gemini':
            instance = new GeminiProvider();
            break;
        // Future: case 'openai': instance = new OpenAIProvider(); break;
        default:
            console.warn(`Unknown provider ${type}, falling back to Gemini`);
            instance = new GeminiProvider();
    }
    return instance;
};

export const resetAIProvider = () => {
    instance = null;
};

export default getAIProvider;
