import type { AIProvider, ModelTier } from '../provider';

const MODELS: Record<ModelTier, string> = {
  fast: process.env.AI_FAST_MODEL ?? 'gpt-4o-mini',
  smart: process.env.AI_SMART_MODEL ?? 'gpt-4o',
};

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl = 'https://api.openai.com/v1', apiKey = process.env.OPENAI_API_KEY ?? '') {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async complete(prompt: string, tier: ModelTier, maxTokens = 512): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: MODELS[tier],
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as any;
    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }
}
