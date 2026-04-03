import { prisma } from '../lib/prisma';
import { integrationRegistry } from '../integrations/registry';
import type { BaseIntegration, InboundEvent } from '../integrations/types';
import * as workItemService from './workItem.service';
import * as orgService from './org.service';

// In-memory map of integrationId → BaseIntegration instance
const instances = new Map<string, BaseIntegration>();

export async function connectIntegration(integrationId: string): Promise<BaseIntegration> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  });

  if (!integration) {
    throw new Error(`Integration not found: ${integrationId}`);
  }

  const instance = integrationRegistry.create(integration.type);

  await instance.connect({
    orgId: integration.orgId,
    integrationId: integration.id,
    settings: integration.config as Record<string, string | boolean | number | string[]>,
  });

  instances.set(integrationId, instance);

  // Update lastSyncAt to indicate connection time
  await prisma.integration.update({
    where: { id: integrationId },
    data: { lastSyncAt: new Date() },
  });

  return instance;
}

export async function disconnectIntegration(integrationId: string): Promise<void> {
  const instance = instances.get(integrationId);
  if (instance) {
    await instance.disconnect();
    instances.delete(integrationId);
  }
}

export async function testIntegration(
  integrationId: string
): Promise<{ ok: boolean; message: string }> {
  let instance = instances.get(integrationId);

  if (!instance) {
    try {
      instance = await connectIntegration(integrationId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, message: `Failed to connect: ${message}` };
    }
  }

  try {
    const ok = await instance.healthCheck();
    return {
      ok,
      message: ok ? 'Integration is healthy' : 'Health check failed',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Health check error: ${message}` };
  }
}

export async function syncIntegration(integrationId: string): Promise<void> {
  const integration = await prisma.integration.findUnique({
    where: { id: integrationId },
  });

  if (!integration) {
    throw new Error(`Integration not found: ${integrationId}`);
  }

  let instance = instances.get(integrationId);
  if (!instance) {
    instance = await connectIntegration(integrationId);
  }

  const events = await instance.sync();

  const org = await orgService.getFirstOrg();
  const members = await orgService.listMembers(org.id);
  const leader = members.find((m) => m.parentId === null);

  if (!leader) {
    console.warn('[integration.service] No root member found, cannot assign synced items');
    return;
  }

  for (const event of events) {
    try {
      await workItemService.createWorkItem(org.id, {
        title: event.title,
        description: event.description,
        type: 'INGRESS',
        priority: event.suggestedPriority ?? 'MEDIUM',
        toMemberId: leader.id,
        fromExternal: event.fromExternal,
        source: event.source,
        sourceRef: event.sourceRef,
        tags: [event.source],
      } as Parameters<typeof workItemService.createWorkItem>[1]);
    } catch (err) {
      console.error('[integration.service] Failed to create work item from sync event:', err);
    }
  }

  await prisma.integration.update({
    where: { id: integrationId },
    data: { lastSyncAt: new Date() },
  });
}

export async function startAllIntegrations(orgId?: string): Promise<void> {
  let targetOrgId = orgId;
  if (!targetOrgId) {
    try {
      const org = await orgService.getFirstOrg();
      targetOrgId = org.id;
    } catch (err) {
      console.warn('[integration.service] No org found, skipping integration startup');
      return;
    }
  }

  const integrations = await prisma.integration.findMany({
    where: { orgId: targetOrgId, enabled: true },
  });

  console.log(
    `[integration.service] Starting ${integrations.length} integration(s) for org ${targetOrgId}`
  );

  for (const integration of integrations) {
    if (!integrationRegistry.isRegistered(integration.type)) {
      console.warn(
        `[integration.service] Integration type "${integration.type}" not registered — skipping`
      );
      continue;
    }

    try {
      const instance = await connectIntegration(integration.id);

      if (instance.startListening) {
        instance.startListening(async (event: InboundEvent) => {
          try {
            const org = await orgService.getFirstOrg();
            const members = await orgService.listMembers(org.id);

            // Resolve toMemberId: look up by slackUserId in metadata, fall back to org leader
            const leader = members.find((m) => m.parentId === null);
            if (!leader) return;

            await workItemService.createWorkItem(org.id, {
              title: event.title,
              description: event.description,
              type: 'INGRESS',
              priority: event.suggestedPriority ?? 'MEDIUM',
              toMemberId: leader.id,
              fromExternal: event.fromExternal,
              source: event.source,
              sourceRef: event.sourceRef,
              tags: [event.source],
            } as Parameters<typeof workItemService.createWorkItem>[1]);
          } catch (err) {
            console.error(
              `[integration.service] Handler error for integration ${integration.id}:`,
              err
            );
          }
        });
      }

      console.log(
        `[integration.service] Started integration: ${integration.type} (${integration.id})`
      );
    } catch (err) {
      console.error(
        `[integration.service] Failed to start integration ${integration.type} (${integration.id}):`,
        err
      );
    }
  }

  console.log(`[integration.service] Startup complete`);
}

export function getInstance(integrationId: string): BaseIntegration | null {
  return instances.get(integrationId) ?? null;
}
