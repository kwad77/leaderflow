import type { WorkItem } from '@leaderflow/shared';
import type { Priority } from '@prisma/client';

export interface InboundEvent {
  title: string;
  description?: string;
  source: string;
  sourceRef?: string;
  fromExternal?: string;
  suggestedPriority?: Priority;
  metadata?: Record<string, unknown>;
}

export interface IntegrationConfig {
  orgId: string;
  integrationId: string;
  settings: Record<string, string | boolean | number | string[]>;
}

export abstract class BaseIntegration {
  abstract readonly type: string;

  abstract connect(config: IntegrationConfig): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract healthCheck(): Promise<boolean>;
  abstract sync(): Promise<InboundEvent[]>;

  // Optional: some integrations push events (Slack), others only pull (Gmail polling)
  startListening?(handler: (event: InboundEvent) => Promise<void>): void;
  stopListening?(): void;

  abstract sendNotification(target: string, message: string): Promise<void>;
  abstract sendHandoff(target: string, item: WorkItem, note?: string): Promise<void>;
}
