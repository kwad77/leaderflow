import { prisma } from '../lib/prisma';
import { emitToOrg } from '../lib/socket';
import { createError } from '../middleware/errorHandler';
import { WorkItemType, WorkItemStatus, Priority } from '@prisma/client';
import type { CreateWorkItemBody, DelegateItemBody } from '@leaderflow/shared';
import { triageQueue, escalationQueue } from '../jobs/queue';
import { evaluateAndApplyRules } from './automation.service';

const memberInclude = {
  select: {
    id: true,
    name: true,
    email: true,
    role: true,
    orgId: true,
    parentId: true,
    createdAt: true,
  },
};

const workItemInclude = {
  from: memberInclude,
  to: memberInclude,
  updates: {
    orderBy: { createdAt: 'asc' as const },
  },
};

function serializeItem(item: any) {
  return {
    ...item,
    createdAt: item.createdAt?.toISOString(),
    updatedAt: item.updatedAt?.toISOString(),
    dueAt: item.dueAt?.toISOString() ?? null,
    acknowledgedAt: item.acknowledgedAt?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    from: item.from
      ? { ...item.from, createdAt: item.from.createdAt?.toISOString() }
      : null,
    to: { ...item.to, createdAt: item.to.createdAt?.toISOString() },
    updates: item.updates.map((u: any) => ({
      ...u,
      createdAt: u.createdAt?.toISOString(),
    })),
  };
}

export interface ListItemsFilter {
  orgId: string;
  type?: WorkItemType;
  status?: WorkItemStatus;
  toMemberId?: string;
  fromMemberId?: string;
}

export async function listWorkItems(filter: ListItemsFilter) {
  const items = await prisma.workItem.findMany({
    where: {
      orgId: filter.orgId,
      ...(filter.type && { type: filter.type }),
      ...(filter.status && { status: filter.status }),
      ...(filter.toMemberId && { toMemberId: filter.toMemberId }),
      ...(filter.fromMemberId && { fromMemberId: filter.fromMemberId }),
    },
    include: workItemInclude,
    orderBy: { createdAt: 'asc' },
  });

  return items.map(serializeItem);
}

export async function getWorkItemById(itemId: string) {
  const item = await prisma.workItem.findUnique({
    where: { id: itemId },
    include: workItemInclude,
  });

  if (!item) {
    throw createError('Work item not found', 404);
  }

  return serializeItem(item);
}

export async function createWorkItem(orgId: string, body: CreateWorkItemBody) {
  // Validate member exists
  const toMember = await prisma.member.findUnique({ where: { id: body.toMemberId } });
  if (!toMember || toMember.orgId !== orgId) {
    throw createError('Target member not found in this organization', 404);
  }

  if (body.fromMemberId) {
    const fromMember = await prisma.member.findUnique({ where: { id: body.fromMemberId } });
    if (!fromMember || fromMember.orgId !== orgId) {
      throw createError('Source member not found in this organization', 404);
    }
  }

  const item = await prisma.workItem.create({
    data: {
      title: body.title,
      description: body.description,
      type: body.type as WorkItemType,
      status: WorkItemStatus.PENDING,
      priority: body.priority as Priority,
      orgId,
      toMemberId: body.toMemberId,
      fromMemberId: body.fromMemberId,
      fromExternal: body.fromExternal,
      dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
      tags: body.tags ?? [],
    },
    include: workItemInclude,
  });

  const serialized = serializeItem(item);

  emitToOrg(orgId, {
    type: 'ITEM_CREATED',
    payload: serialized,
    timestamp: new Date().toISOString(),
  });

  // Trigger triage agent for every new item
  triageQueue.add('triage-item', { itemId: item.id, orgId }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
  }).catch((err: Error) => console.error('[triage] Failed to queue job:', err.message));

  // Trigger escalation router for escalation items
  if (body.type === 'ESCALATION') {
    escalationQueue.add('route-escalation', { itemId: item.id, orgId }, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 1000 },
    }).catch((err: Error) => console.error('[escalation] Failed to queue job:', err.message));
  }

  // Evaluate automation rules immediately on new item creation
  evaluateAndApplyRules(serialized as any, orgId)
    .catch((err: Error) => console.error('[automation] Rule evaluation failed:', err.message));

  return serialized;
}

export async function delegateWorkItem(
  itemId: string,
  orgId: string,
  body: DelegateItemBody
) {
  const original = await prisma.workItem.findUnique({
    where: { id: itemId },
    include: workItemInclude,
  });

  if (!original || original.orgId !== orgId) {
    throw createError('Work item not found', 404);
  }

  const toMember = await prisma.member.findUnique({ where: { id: body.toMemberId } });
  if (!toMember || toMember.orgId !== orgId) {
    throw createError('Target member not found in this organization', 404);
  }

  // Create new delegation item
  const delegated = await prisma.workItem.create({
    data: {
      title: original.title,
      description: original.description,
      type: WorkItemType.DELEGATION,
      status: WorkItemStatus.PENDING,
      priority: original.priority,
      orgId,
      fromMemberId: original.toMemberId,
      toMemberId: body.toMemberId,
      tags: original.tags,
      metadata: { delegatedFromId: original.id } as any,
    },
    include: workItemInclude,
  });

  if (body.note) {
    await prisma.workItemUpdate.create({
      data: {
        itemId: delegated.id,
        note: body.note,
        statusChange: 'DELEGATED',
      },
    });
  }

  // Update original item status
  await prisma.workItem.update({
    where: { id: itemId },
    data: { status: WorkItemStatus.IN_PROGRESS },
  });

  const serialized = serializeItem(delegated);

  emitToOrg(orgId, {
    type: 'ITEM_DELEGATED',
    payload: serialized,
    timestamp: new Date().toISOString(),
  });

  return serialized;
}

export async function acknowledgeWorkItem(itemId: string, orgId: string) {
  const item = await prisma.workItem.findUnique({ where: { id: itemId } });

  if (!item || item.orgId !== orgId) {
    throw createError('Work item not found', 404);
  }

  const updated = await prisma.workItem.update({
    where: { id: itemId },
    data: {
      status: WorkItemStatus.ACKNOWLEDGED,
      acknowledgedAt: new Date(),
    },
    include: workItemInclude,
  });

  await prisma.workItemUpdate.create({
    data: {
      itemId,
      note: 'Item acknowledged',
      statusChange: WorkItemStatus.ACKNOWLEDGED,
    },
  });

  const serialized = serializeItem(updated);

  emitToOrg(orgId, {
    type: 'ITEM_ACKNOWLEDGED',
    payload: serialized,
    timestamp: new Date().toISOString(),
  });

  return serialized;
}

export async function completeWorkItem(itemId: string, orgId: string, note?: string) {
  const item = await prisma.workItem.findUnique({ where: { id: itemId } });

  if (!item || item.orgId !== orgId) {
    throw createError('Work item not found', 404);
  }

  const updated = await prisma.workItem.update({
    where: { id: itemId },
    data: {
      status: WorkItemStatus.COMPLETED,
      completedAt: new Date(),
    },
    include: workItemInclude,
  });

  await prisma.workItemUpdate.create({
    data: {
      itemId,
      note: note ?? 'Item marked complete',
      statusChange: WorkItemStatus.COMPLETED,
    },
  });

  const serialized = serializeItem(updated);

  emitToOrg(orgId, {
    type: 'ITEM_COMPLETED',
    payload: serialized,
    timestamp: new Date().toISOString(),
  });

  return serialized;
}
