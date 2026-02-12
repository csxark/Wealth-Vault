import dotenv from 'dotenv';
dotenv.config();

export const AI_CONFIG = {
    defaultProvider: 'gemini',

    // Provider-specific configurations
    providers: {
        gemini: {
            apiKey: process.env.GEMINI_API_KEY,
            baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            defaultModel: 'gemini-2.0-flash',
            // Map internal model names to provider specific model names
            models: {
                fast: 'gemini-2.0-flash',
                pro: 'gemini-pro',
                experimental: 'gemini-2.0-flash-exp',
                vision: 'gemini-pro-vision'
            }
        },
        openai: {
            apiKey: process.env.OPENAI_API_KEY,
            defaultModel: 'gpt-4-turbo',
            models: {
                fast: 'gpt-3.5-turbo',
                pro: 'gpt-4-turbo',
                vision: 'gpt-4-vision-preview'
            }
        },
        anthropic: {
            apiKey: process.env.ANTHROPIC_API_KEY,
            defaultModel: 'claude-3-sonnet',
            models: {
                fast: 'claude-3-haiku',
                pro: 'claude-3-opus'
            }
        }
    },

    // Global settings
    global: {
        maxRetries: 3,
        timeout: 30000, // 30 seconds
        logRequests: true, // Log prompts/responses for debugging
        mockInDevelopment: process.env.NODE_ENV === 'test' // Use mock provider in tests
    }
};

export default AI_CONFIG;
