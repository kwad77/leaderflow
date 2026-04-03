import type { AIProvider, ModelTier } from '../provider';

const MODELS: Record<ModelTier, string> = {
  fast: process.env.AI_FAST_MODEL ?? 'llama3.2',
  smart: process.env.AI_SMART_MODEL ?? 'llama3.1:70b',
};

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  private baseUrl: string;

  constructor() {
    this.baseUrl = (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '');
  }

  async complete(prompt: string, tier: ModelTier, maxTokens = 512): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELS[tier],
        prompt,
        stream: false,
        options: { num_predict: maxTokens },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as any;
    return data.response?.trim() ?? '';
  }
}
