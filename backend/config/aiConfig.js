import dotenv from 'dotenv';
dotenv.config();

export const AI_CONFIG = {
    // Set the default provider: 'gemini', 'ollama', 'lmstudio', 'openai', or 'anthropic'
    // Can be overridden via AI_PROVIDER environment variable
    defaultProvider: process.env.AI_PROVIDER || 'gemini',

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
        // Ollama - Local LLM support (https://ollama.ai)
        ollama: {
            baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            defaultModel: process.env.OLLAMA_MODEL || 'llama2',
            models: {
                fast: process.env.OLLAMA_MODEL || 'llama2',
                pro: 'llama2:70b',
                // Popular open-source models that work with Ollama
                // Users can download these via: ollama pull <model-name>
                llama2: 'llama2',
                llama3: 'llama3',
                mistral: 'mistral',
                mixtral: 'mixtral',
                codellama: 'codellama',
                phi: 'phi',
                gemma: 'gemma',
            }
        },
        // LM Studio - Local LLM with OpenAI-compatible API (https://lmstudio.ai)
        lmstudio: {
            baseUrl: process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234/v1',
            defaultModel: process.env.LMSTUDIO_MODEL || 'local-model',
            models: {
                fast: process.env.LMSTUDIO_MODEL || 'local-model',
                pro: process.env.LMSTUDIO_MODEL || 'local-model',
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
