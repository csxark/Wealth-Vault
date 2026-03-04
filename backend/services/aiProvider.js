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
 * Ollama Provider Implementation
 * Supports local Ollama instances for running open-source LLMs
 */
class OllamaProvider extends BaseAIProvider {
    constructor(config = AI_CONFIG.providers.ollama) {
        super(config);
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
        this.defaultModel = config.defaultModel || 'llama2';
        console.log(`OllamaProvider initialized with baseUrl: ${this.baseUrl}, model: ${this.defaultModel}`);
    }

    resolveModel(modelKey) {
        if (this.config.models && this.config.models[modelKey]) {
            return this.config.models[modelKey];
        }
        return modelKey || this.defaultModel;
    }

    async generateText(prompt, options = {}) {
        const modelName = this.resolveModel(options.model);

        try {
            let messages;
            if (Array.isArray(prompt)) {
                // Convert chat history to Ollama format
                messages = prompt.map(msg => ({
                    role: msg.role || 'user',
                    content: msg.content || msg.parts?.[0]?.text || ''
                }));
            } else {
                messages = [{ role: 'user', content: prompt }];
            }

            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelName,
                    messages,
                    stream: false,
                    options: {
                        temperature: options.temperature || 0.7,
                        top_p: options.top_p || 0.9,
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            return data.message?.content || data.response || '';
        } catch (error) {
            console.error('Ollama generateText error:', error);
            throw new Error(`Failed to connect to Ollama: ${error.message}. Ensure Ollama is running on ${this.baseUrl}`);
        }
    }

    async generateJSON(prompt, options = {}) {
        const modelName = this.resolveModel(options.model);

        try {
            const jsonPrompt = typeof prompt === 'string'
                ? `${prompt}\n\nReturn the result as a valid JSON object only, with no additional text or markdown.`
                : prompt;

            const textResponse = await this.generateText(jsonPrompt, options);

            try {
                // Clean markdown code blocks if present
                const cleanText = textResponse.replace(/```json\n?|\n?```/g, '').trim();
                return JSON.parse(cleanText);
            } catch (parseError) {
                console.error('Failed to parse JSON response:', textResponse);
                throw new Error('AI response was not valid JSON');
            }
        } catch (error) {
            console.error('Ollama generateJSON error:', error);
            throw error;
        }
    }
}

/**
 * LM Studio Provider Implementation
 * Supports local LM Studio instances compatible with OpenAI API
 */
class LMStudioProvider extends BaseAIProvider {
    constructor(config = AI_CONFIG.providers.lmstudio) {
        super(config);
        this.baseUrl = config.baseUrl || 'http://localhost:1234/v1';
        this.defaultModel = config.defaultModel || 'local-model';
        console.log(`LMStudioProvider initialized with baseUrl: ${this.baseUrl}, model: ${this.defaultModel}`);
    }

    resolveModel(modelKey) {
        if (this.config.models && this.config.models[modelKey]) {
            return this.config.models[modelKey];
        }
        return modelKey || this.defaultModel;
    }

    async generateText(prompt, options = {}) {
        const modelName = this.resolveModel(options.model);

        try {
            let messages;
            if (Array.isArray(prompt)) {
                // Convert chat history to OpenAI format
                messages = prompt.map(msg => ({
                    role: msg.role || 'user',
                    content: msg.content || msg.parts?.[0]?.text || ''
                }));
            } else {
                messages = [{ role: 'user', content: prompt }];
            }

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelName,
                    messages,
                    temperature: options.temperature || 0.7,
                    max_tokens: options.max_tokens || 2000,
                    stream: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`LM Studio API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content || '';
        } catch (error) {
            console.error('LM Studio generateText error:', error);
            throw new Error(`Failed to connect to LM Studio: ${error.message}. Ensure LM Studio is running on ${this.baseUrl}`);
        }
    }

    async generateJSON(prompt, options = {}) {
        const modelName = this.resolveModel(options.model);

        try {
            let messages;
            const jsonPrompt = typeof prompt === 'string'
                ? `${prompt}\n\nReturn the result as a valid JSON object only, with no additional text or markdown.`
                : prompt;

            if (Array.isArray(jsonPrompt)) {
                messages = jsonPrompt;
            } else {
                messages = [{ role: 'user', content: jsonPrompt }];
            }

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelName,
                    messages,
                    temperature: options.temperature || 0.3,
                    max_tokens: options.max_tokens || 2000,
                    response_format: { type: 'json_object' }, // Request JSON mode if supported
                    stream: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`LM Studio API error (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            const textResponse = data.choices?.[0]?.message?.content || '';

            try {
                // Clean markdown code blocks if present
                const cleanText = textResponse.replace(/```json\n?|\n?```/g, '').trim();
                return JSON.parse(cleanText);
            } catch (parseError) {
                console.error('Failed to parse JSON response:', textResponse);
                throw new Error('AI response was not valid JSON');
            }
        } catch (error) {
            console.error('LM Studio generateJSON error:', error);
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

    // Use mock provider in test/development if no API key
    if (AI_CONFIG.global.mockInDevelopment && type === 'gemini' && !process.env.GEMINI_API_KEY) {
        console.log('Using Mock AI Provider (no Gemini API key found)');
        instance = new MockProvider({});
        return instance;
    }

    switch (type) {
        case 'gemini':
            instance = new GeminiProvider();
            console.log('✓ Using Gemini AI Provider');
            break;
        case 'ollama':
            instance = new OllamaProvider();
            console.log('✓ Using Ollama Local LLM Provider');
            break;
        case 'lmstudio':
            instance = new LMStudioProvider();
            console.log('✓ Using LM Studio Local LLM Provider');
            break;
        case 'openai':
            // Future: instance = new OpenAIProvider();
            console.warn('OpenAI provider not yet implemented, falling back to Gemini');
            instance = new GeminiProvider();
            break;
        default:
            console.warn(`Unknown provider "${type}", falling back to Gemini`);
            instance = new GeminiProvider();
    }
    return instance;
};

export const resetAIProvider = () => {
    instance = null;
};

export default getAIProvider;
