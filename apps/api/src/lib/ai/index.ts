import type { AIProvider } from './provider';
export type { AIProvider, ModelTier } from './provider';

function createProvider(): AIProvider {
  const name = (process.env.AI_PROVIDER ?? 'anthropic').toLowerCase();

  switch (name) {
    case 'openai': {
      const { OpenAIProvider } = require('./providers/openai');
      return new OpenAIProvider();
    }
    case 'gemini': {
      const { GeminiProvider } = require('./providers/gemini');
      return new GeminiProvider();
    }
    case 'ollama': {
      const { OllamaProvider } = require('./providers/ollama');
      return new OllamaProvider();
    }
    case 'openrouter': {
      const { OpenRouterProvider } = require('./providers/openrouter');
      return new OpenRouterProvider();
    }
    case 'anthropic':
    default: {
      const { AnthropicProvider } = require('./providers/anthropic');
      return new AnthropicProvider();
    }
  }
}

// Singleton — created once at startup, used everywhere
export const ai: AIProvider = createProvider();

console.log(`[ai] Provider: ${ai.name}`);
