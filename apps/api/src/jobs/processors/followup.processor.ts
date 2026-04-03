import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma';
import { emitToOrg } from '../../lib/socket';
import * as orgService from '../../services/org.service';
import { evaluateAndApplyRules } from '../../services/automation.service';
import type { WorkItem } from '@leaderflow/shared';

const workItemInclude = {
  from: {
    select: { id: true, name: true, email: true, role: true, orgId: true, parentId: true, createdAt: true },
  },
  to: {
    select: { id: true, name: true, email: true, role: true, orgId: true, parentId: true, createdAt: true },
  },
  updates: { orderBy: { createdAt: 'asc' as const } },
};

function serializeItem(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString(),
    updatedAt: item.updatedAt?.toISOString(),
    dueAt: item.dueAt?.toISOString() ?? null,
    acknowledgedAt: item.acknowledgedAt?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    from: item.from ? { ...item.from, createdAt: item.from.createdAt?.toISOString() } : null,
    to: { ...item.to, createdAt: item.to.createdAt?.toISOString() },
    updates: (item.updates ?? []).map((u: any) => ({
      ...u,
      createdAt: u.createdAt?.toISOString(),
    })),
  };
}

export async function processFollowupJob(_job: Job): Promise<void> {
  const org = await orgService.getFirstOrg();
  const orgId = org.id;
  const settings = (org.settings as any) ?? {};

  const staleThresholdHours: number = settings.staleThresholdHours ?? 48;
  const atRiskHoursBeforeDue: number = settings.atRiskHoursBeforeDue ?? 24;

  const staleMs = staleThresholdHours * 3600 * 1000;
  const atRiskMs = atRiskHoursBeforeDue * 3600 * 1000;

  // Find all active items
  const activeItems = await prisma.workItem.findMany({
    where: {
      orgId,
      status: { notIn: ['COMPLETED', 'ARCHIVED'] },
    },
    include: {
      updates: { orderBy: { createdAt: 'desc' }, take: 1 },
      to: { select: { id: true, name: true, email: true, role: true, orgId: true, parentId: true, createdAt: true } },
    },
  });

  const now = new Date();
  let flaggedCount = 0;

  for (const item of activeItems) {
    const dueAt = item.dueAt;
    const lastUpdateAt =
      item.updates.length > 0
        ? item.updates[0].createdAt
        : item.createdAt;

    let newStatus: string | null = null;

    // Status machine: first match wins
    if (dueAt && dueAt < now) {
      newStatus = 'OVERDUE';
    } else if (dueAt && dueAt.getTime() - now.getTime() < atRiskMs) {
      newStatus = 'AT_RISK';
    } else if (now.getTime() - lastUpdateAt.getTime() > staleMs) {
      newStatus = 'STALE';
    }

    if (!newStatus || item.status === newStatus) continue;

    // Apply status change
    await prisma.workItem.update({
      where: { id: item.id },
      data: { status: newStatus as any },
    });

    await prisma.workItemUpdate.create({
      data: {
        itemId: item.id,
        note: `Auto-flagged as ${newStatus} by follow-up agent`,
        statusChange: newStatus,
      },
    });

    // Refetch with full includes
    const updated = await prisma.workItem.findUnique({
      where: { id: item.id },
      include: workItemInclude,
    });

    if (updated) {
      const serialized = serializeItem(updated);
      emitToOrg(orgId, {
        type: 'ITEM_UPDATED',
        payload: serialized,
        timestamp: new Date().toISOString(),
      });
    }

    flaggedCount++;
  }

  console.log(`[followup] Processed 1 org, flagged ${flaggedCount} items`);

  // Evaluate automation rules against PENDING items
  const pendingItems = await prisma.workItem.findMany({
    where: { orgId, status: 'PENDING' },
    include: {
      from: { select: { id: true, name: true, email: true, role: true, orgId: true, parentId: true, createdAt: true } },
      to:   { select: { id: true, name: true, email: true, role: true, orgId: true, parentId: true, createdAt: true } },
      updates: { orderBy: { createdAt: 'asc' as const } },
    },
  });

  for (const item of pendingItems) {
    await evaluateAndApplyRules(serializeItem(item) as WorkItem, orgId);
  }
}
