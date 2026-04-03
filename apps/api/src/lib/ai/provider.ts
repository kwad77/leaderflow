export type ModelTier = 'fast' | 'smart';

export interface AIProvider {
  readonly name: string;
  complete(prompt: string, tier: ModelTier, maxTokens?: number): Promise<string>;
}
