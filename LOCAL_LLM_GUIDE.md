# Local LLM Support Guide

Wealth-Vault now supports local Large Language Models (LLMs) through **Ollama** and **LM Studio**, giving you complete control and privacy over your AI-powered financial coaching features.

## 🎯 Why Use Local LLMs?

- **Privacy**: Your financial data never leaves your machine
- **Cost**: No API costs - completely free after initial setup
- **Offline**: Works without internet connection
- **Control**: Choose and customize your preferred open-source models
- **No Rate Limits**: Unlimited usage without API restrictions

## 📋 Supported Providers

| Provider | Description | Best For |
|----------|-------------|----------|
| **Gemini** | Google's cloud API (default) | Quick setup, powerful responses |
| **Ollama** | Local LLM runtime | Easy setup, great model variety |
| **LM Studio** | Local LLM with UI | User-friendly, visual interface |

---

## 🚀 Quick Start

### Option 1: Ollama (Recommended)

#### 1. Install Ollama

**macOS/Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:**
Download from [https://ollama.ai/download](https://ollama.ai/download)

#### 2. Pull a Model

```bash
# Recommended: Llama 2 (7B) - Good balance of speed and quality
ollama pull llama2

# Other popular options:
ollama pull llama3        # Meta's latest Llama model
ollama pull mistral       # Fast and efficient
ollama pull mixtral       # Larger, more capable model
ollama pull codellama     # Optimized for code/technical content
ollama pull phi           # Microsoft's compact model
```

#### 3. Verify Ollama is Running

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# You should see a JSON response with your installed models
```

#### 4. Configure Wealth-Vault

Edit your `backend/.env` file:

```bash
# Set AI provider to Ollama
AI_PROVIDER=ollama

# Optional: Customize Ollama settings
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
```

#### 5. Start the Application

```bash
# If running with Docker
docker-compose up

# Or if running locally
cd backend && npm start
cd frontend && npm run dev
```

✅ **You're done!** The AI coach now uses your local Ollama model.

---

### Option 2: LM Studio

#### 1. Install LM Studio

Download from [https://lmstudio.ai](https://lmstudio.ai)

#### 2. Download a Model

1. Open LM Studio
2. Go to the "Search" tab
3. Search for and download a model:
   - **Recommended**: `TheBloke/Llama-2-7B-Chat-GGUF`
   - **Fast**: `microsoft/phi-2-GGUF`
   - **Powerful**: `TheBloke/Mistral-7B-Instruct-GGUF`

#### 3. Start Local Server

1. Go to the "Local Server" tab in LM Studio
2. Select your downloaded model
3. Click "Start Server"
4. Note the server URL (usually `http://localhost:1234`)

#### 4. Configure Wealth-Vault

Edit your `backend/.env` file:

```bash
# Set AI provider to LM Studio
AI_PROVIDER=lmstudio

# Optional: Customize LM Studio settings
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=local-model
```

#### 5. Start the Application

```bash
# If running with Docker
docker-compose up

# Or if running locally
cd backend && npm start
cd frontend && npm run dev
```

✅ **You're done!** The AI coach now uses your LM Studio model.

---

## 🐳 Docker Configuration

When running Wealth-Vault in Docker, you need to adjust the URLs since the container needs to reach your host machine.

### Docker Compose Setup

```yaml
# docker-compose.yml
services:
  backend:
    # ... other config ...
    environment:
      - AI_PROVIDER=ollama
      # Use host.docker.internal to access host machine from container
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
      - OLLAMA_MODEL=llama2
```

Or create a `.env` file in the root directory:

```bash
# .env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama2
```

### For Linux Docker Users

On Linux, you may need to use your host IP instead of `host.docker.internal`:

```bash
# Find your host IP
ip addr show docker0 | grep inet

# Use that IP in your .env
OLLAMA_BASE_URL=http://172.17.0.1:11434
```

---

## 🎨 Model Selection Guide

### For Financial Advice/Coaching

| Model | Size | RAM Needed | Speed | Quality | Recommendation |
|-------|------|------------|-------|---------|----------------|
| `llama2` | 7B | 8GB | Fast | Good | ⭐ Best starter |
| `llama3` | 8B | 8GB | Fast | Very Good | ⭐ Recommended |
| `mistral` | 7B | 8GB | Very Fast | Good | Great for speed |
| `mixtral` | 8x7B | 32GB | Slow | Excellent | Best quality |
| `phi` | 3B | 4GB | Very Fast | Decent | Low-end hardware |

### Ollama Model Commands

```bash
# List installed models
ollama list

# Remove a model
ollama rm llama2

# Update a model
ollama pull llama2

# Run a model interactively (for testing)
ollama run llama2
```

---

## 🔧 Advanced Configuration

### Custom Model Parameters

You can customize model behavior in `backend/config/aiConfig.js`:

```javascript
ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    defaultModel: process.env.OLLAMA_MODEL || 'llama2',
    models: {
        fast: 'llama2',
        pro: 'mixtral',  // Use a larger model for detailed advice
        // Add your custom models
        custom: 'my-finetuned-model',
    }
}
```

### Switching Between Providers

You can switch providers without restarting by changing the `AI_PROVIDER` environment variable:

```bash
# Switch to Ollama
export AI_PROVIDER=ollama

# Switch to Gemini
export AI_PROVIDER=gemini

# Switch to LM Studio
export AI_PROVIDER=lmstudio
```

---

## 🐛 Troubleshooting

### Ollama Issues

**Problem**: "Failed to connect to Ollama"

**Solutions**:
1. Ensure Ollama is running: `ollama ps`
2. Check if the service is accessible: `curl http://localhost:11434/api/tags`
3. Verify the model is installed: `ollama list`
4. Try pulling the model again: `ollama pull llama2`

**Problem**: "Model not found"

**Solution**:
```bash
# Pull the specific model
ollama pull llama2

# Or specify a different model in your .env
OLLAMA_MODEL=mistral
```

### LM Studio Issues

**Problem**: "Failed to connect to LM Studio"

**Solutions**:
1. Ensure LM Studio local server is running (check the UI)
2. Verify the server URL in LM Studio (usually `http://localhost:1234`)
3. Test the endpoint: `curl http://localhost:1234/v1/models`

**Problem**: Slow responses

**Solutions**:
1. Use a smaller model (e.g., phi-2 instead of 70B models)
2. Enable GPU acceleration in LM Studio settings
3. Reduce context window size in LM Studio

### Docker Connection Issues

**Problem**: Container can't reach Ollama/LM Studio on host

**Solutions**:
1. Use `host.docker.internal` instead of `localhost`
2. On Linux, use host IP from `docker0` interface
3. Ensure Ollama/LM Studio is binding to `0.0.0.0`, not just `127.0.0.1`

---

## 📊 Performance Comparison

| Provider | First Response | Subsequent | Privacy | Cost | Setup Time |
|----------|---------------|------------|---------|------|------------|
| Gemini | ~1-2s | ~1-2s | Cloud | $$ | 2 min |
| Ollama (llama2-7B) | ~3-5s | ~3-5s | 100% Local | Free | 10 min |
| LM Studio (7B) | ~3-5s | ~3-5s | 100% Local | Free | 15 min |
| Ollama (mixtral) | ~10-15s | ~10-15s | 100% Local | Free | 15 min |

*Tested on: M1 Mac, 16GB RAM*

---

## 🔐 Security & Privacy

### Data Privacy

- **Local LLMs**: All processing happens on your machine. Your financial data NEVER leaves your computer.
- **Cloud APIs**: Data is sent to third-party services (Google for Gemini) over encrypted connections.

### Recommendations

1. **Use Local LLMs** if you're handling sensitive financial data or operating in regulated environments
2. **Use Cloud APIs** for better performance and accuracy if privacy is less of a concern
3. **Never commit** API keys or sensitive configuration to version control

---

## 💡 Tips & Best Practices

1. **Start Small**: Begin with `llama2` or `mistral` before trying larger models
2. **GPU Acceleration**: If you have a GPU, enable it in Ollama/LM Studio for much faster inference
3. **Monitor Resources**: Local LLMs use significant RAM - close other applications if needed
4. **Context Window**: Larger models support longer conversations but are slower
5. **Fine-tuning**: Consider fine-tuning a model on financial advisory data for better domain-specific responses

---

## 🆘 Support

### Community Resources

- **Ollama Documentation**: [https://github.com/ollama/ollama](https://github.com/ollama/ollama)
- **LM Studio Discord**: Join their community for help and tips
- **Wealth-Vault Issues**: Report bugs or request features on our GitHub

### Useful Commands

```bash
# Check Ollama status
ollama ps

# Test Ollama with a quick prompt
curl http://localhost:11434/api/generate -d '{
  "model": "llama2",
  "prompt": "What is the best way to save money?",
  "stream": false
}'

# Test LM Studio endpoint
curl http://localhost:1234/v1/chat/completions -H "Content-Type: application/json" -d '{
  "model": "local-model",
  "messages": [{"role": "user", "content": "Hello"}]
}'
```

---

## 🚀 Next Steps

Once you have local LLMs working:

1. Try different models to find the best balance of speed and quality for your needs
2. Experiment with the AI Financial Coach feature
3. Compare responses between different providers
4. Consider running larger models if you have the hardware

Happy financial coaching with complete privacy! 🎉
