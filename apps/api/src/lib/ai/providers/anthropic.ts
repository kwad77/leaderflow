import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, ModelTier } from '../provider';

const MODELS: Record<ModelTier, string> = {
  fast: process.env.AI_FAST_MODEL ?? 'claude-haiku-4-5-20251001',
  smart: process.env.AI_SMART_MODEL ?? 'claude-sonnet-4-6',
};

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? 'not-set' });
  }

  async complete(prompt: string, tier: ModelTier, maxTokens = 512): Promise<string> {
    const response = await this.client.messages.create({
      model: MODELS[tier],
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = response.content[0];
    return block.type === 'text' ? block.text.trim() : '';
  }
}
