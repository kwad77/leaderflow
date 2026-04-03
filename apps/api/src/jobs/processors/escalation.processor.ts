import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma';
import { emitToOrg } from '../../lib/socket';
import * as orgService from '../../services/org.service';
import type { OrgTree } from '@leaderflow/shared';

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

function findParent(tree: OrgTree, targetId: string): OrgTree | null {
  for (const child of tree.directReports) {
    if (child.id === targetId) return tree;
    const found = findParent(child, targetId);
    if (found) return found;
  }
  return null;
}

export async function processEscalationJob(job: Job): Promise<void> {
  const { itemId, orgId } = job.data;

  // Per-item routing check
  if (itemId && orgId) {
    const item = await prisma.workItem.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      console.error(`[escalation] Item ${itemId} not found`);
      return;
    }

    const tree = await orgService.getOrgTree(orgId);

    if (item.fromMemberId) {
      const directManager = findParent(tree, item.fromMemberId);

      if (directManager && directManager.id !== item.toMemberId) {
        await prisma.workItemUpdate.create({
          data: {
            itemId: item.id,
            note: `Routing note: This escalation skipped ${directManager.name} (${directManager.role}). Consider routing through the direct manager first.`,
          },
        });
      }
    }

    return;
  }

  // SLA check (no itemId — repeatable job)
  const org = await orgService.getFirstOrg();
  const settings = (org.settings as any) ?? {};
  const escalationSlaHours: number = settings.escalationSlaHours ?? 4;

  const slaThreshold = new Date(Date.now() - escalationSlaHours * 3600 * 1000);

  const overdueEscalations = await prisma.workItem.findMany({
    where: {
      orgId: org.id,
      type: 'ESCALATION',
      status: 'PENDING',
      acknowledgedAt: null,
      createdAt: { lt: slaThreshold },
    },
    include: workItemInclude,
  });

  for (const item of overdueEscalations) {
    await prisma.workItem.update({
      where: { id: item.id },
      data: { status: 'AT_RISK' },
    });

    await prisma.workItemUpdate.create({
      data: {
        itemId: item.id,
        note: `Escalation SLA breached — not acknowledged within ${escalationSlaHours} hours. Auto-flagged as AT_RISK.`,
        statusChange: 'AT_RISK',
      },
    });

    const updated = await prisma.workItem.findUnique({
      where: { id: item.id },
      include: workItemInclude,
    });

    if (updated) {
      const serialized = serializeItem(updated);
      emitToOrg(org.id, {
        type: 'ITEM_UPDATED',
        payload: serialized,
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (overdueEscalations.length > 0) {
    console.log(`[escalation] SLA check: flagged ${overdueEscalations.length} escalations as AT_RISK`);
  }
}
