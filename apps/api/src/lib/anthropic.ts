import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('[anthropic] ANTHROPIC_API_KEY not set — AI agents will be disabled');
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? 'not-set',
});
