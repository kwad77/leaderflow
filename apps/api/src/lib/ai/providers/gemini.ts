import type { AIProvider, ModelTier } from '../provider';

const MODELS: Record<ModelTier, string> = {
  fast: process.env.AI_FAST_MODEL ?? 'gemini-1.5-flash',
  smart: process.env.AI_SMART_MODEL ?? 'gemini-1.5-pro',
};

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY ?? '';
  }

  async complete(prompt: string, tier: ModelTier, maxTokens = 512): Promise<string> {
    const model = MODELS[tier];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini error ${res.status}: ${err}`);
    }

    const data = (await res.json()) as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  }
}
