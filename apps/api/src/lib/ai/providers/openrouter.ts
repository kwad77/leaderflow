import { OpenAIProvider } from './openai';
import type { ModelTier } from '../provider';

// OpenRouter is OpenAI-compatible but with a broader model catalogue and different defaults
const MODELS: Record<ModelTier, string> = {
  fast: process.env.AI_FAST_MODEL ?? 'meta-llama/llama-3.2-3b-instruct:free',
  smart: process.env.AI_SMART_MODEL ?? 'anthropic/claude-3.5-sonnet',
};

export class OpenRouterProvider extends OpenAIProvider {
  override readonly name = 'openrouter';

  constructor() {
    super('https://openrouter.ai/api/v1', process.env.OPENROUTER_API_KEY ?? '');
  }

  // Override to inject OpenRouter-required headers and use its model catalogue
  override async complete(prompt: string, tier: ModelTier, maxTokens = 512): Promise<string> {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
        'HTTP-Referer': process.env.WEB_URL ?? 'http://localhost:5173',
        'X-Title': 'LeaderFlow',
      },
      body: JSON.stringify({
        model: MODELS[tier],
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }
}
