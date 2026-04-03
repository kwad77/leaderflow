import { prisma } from '../lib/prisma';
import { WorkItemStatus, WorkItemType } from '@prisma/client';
import type { BriefingSummary } from '@leaderflow/shared';

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

export async function getDailyBriefing(orgId: string): Promise<BriefingSummary> {
  const [ingressItems, escalationItems, atRiskItems] = await Promise.all([
    // Pending INGRESS items
    prisma.workItem.findMany({
      where: {
        orgId,
        type: WorkItemType.INGRESS,
        status: { in: [WorkItemStatus.PENDING, WorkItemStatus.ACKNOWLEDGED] },
      },
      include: workItemInclude,
      orderBy: { createdAt: 'asc' },
    }),

    // Active ESCALATION items
    prisma.workItem.findMany({
      where: {
        orgId,
        type: WorkItemType.ESCALATION,
        status: {
          notIn: [WorkItemStatus.COMPLETED, WorkItemStatus.ARCHIVED],
        },
      },
      include: workItemInclude,
      orderBy: { createdAt: 'asc' },
    }),

    // AT_RISK + OVERDUE + STALE items
    prisma.workItem.findMany({
      where: {
        orgId,
        status: {
          in: [WorkItemStatus.AT_RISK, WorkItemStatus.OVERDUE, WorkItemStatus.STALE],
        },
      },
      include: workItemInclude,
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const ingress = ingressItems.map(serializeItem);
  const escalations = escalationItems.map(serializeItem);
  const atRisk = atRiskItems.map(serializeItem);

  return {
    ingress,
    escalations,
    atRisk,
    totals: {
      ingress: ingress.length,
      escalations: escalations.length,
      atRisk: atRisk.length,
      total: ingress.length + escalations.length + atRisk.length,
    },
  };
}

async function getAvgTriageSpeedMs(orgId: string, since: Date): Promise<number | null> {
  const items = await prisma.workItem.findMany({
    where: {
      orgId,
      type: 'INGRESS',
      createdAt: { gte: since },
      acknowledgedAt: { not: null },
    },
    select: { createdAt: true, acknowledgedAt: true },
  });
  if (items.length === 0) return null;
  const totalMs = items.reduce(
    (sum, i) => sum + (i.acknowledgedAt!.getTime() - i.createdAt.getTime()),
    0
  );
  return Math.round(totalMs / items.length);
}

async function getAvgEscalationResponseMs(orgId: string, since: Date): Promise<number | null> {
  const items = await prisma.workItem.findMany({
    where: {
      orgId,
      type: 'ESCALATION',
      createdAt: { gte: since },
      acknowledgedAt: { not: null },
    },
    select: { createdAt: true, acknowledgedAt: true },
  });
  if (items.length === 0) return null;
  const totalMs = items.reduce(
    (sum, i) => sum + (i.acknowledgedAt!.getTime() - i.createdAt.getTime()),
    0
  );
  return Math.round(totalMs / items.length);
}

async function getCompletionByMember(orgId: string, since: Date) {
  const members = await prisma.member.findMany({
    where: { orgId },
    select: { id: true, name: true, role: true },
  });
  const result = await Promise.all(
    members.map(async (m) => {
      const [assigned, completed] = await Promise.all([
        prisma.workItem.count({
          where: { orgId, toMemberId: m.id, createdAt: { gte: since } },
        }),
        prisma.workItem.count({
          where: {
            orgId,
            toMemberId: m.id,
            status: 'COMPLETED',
            completedAt: { gte: since },
          },
        }),
      ]);
      return { memberId: m.id, name: m.name, role: m.role, assigned, completed };
    })
  );
  return result;
}

async function getDelegationRatioByDay(orgId: string, since: Date) {
  const days: Array<{ date: string; delegations: number; ingress: number }> = [];
  const now = new Date();
  for (let d = new Date(since); d <= now; d.setDate(d.getDate() + 1)) {
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);
    const [delegations, ingress] = await Promise.all([
      prisma.workItem.count({
        where: { orgId, type: 'DELEGATION', createdAt: { gte: dayStart, lte: dayEnd } },
      }),
      prisma.workItem.count({
        where: { orgId, type: 'INGRESS', createdAt: { gte: dayStart, lte: dayEnd } },
      }),
    ]);
    days.push({ date: dayStart.toISOString().slice(0, 10), delegations, ingress });
  }
  return days;
}

export async function getWeeklyBriefing(orgId: string) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [completed, created, overdue] = await Promise.all([
    prisma.workItem.count({
      where: {
        orgId,
        status: WorkItemStatus.COMPLETED,
        completedAt: { gte: weekAgo },
      },
    }),
    prisma.workItem.count({
      where: {
        orgId,
        createdAt: { gte: weekAgo },
      },
    }),
    prisma.workItem.count({
      where: {
        orgId,
        status: { in: [WorkItemStatus.AT_RISK, WorkItemStatus.OVERDUE] },
      },
    }),
  ]);

  const byType = await prisma.workItem.groupBy({
    by: ['type'],
    where: { orgId, createdAt: { gte: weekAgo } },
    _count: { id: true },
  });

  const byStatus = await prisma.workItem.groupBy({
    by: ['status'],
    where: { orgId },
    _count: { id: true },
  });

  const [triageSpeedMs, escalationResponseMs, completionByMember, delegationRatioByDay] =
    await Promise.all([
      getAvgTriageSpeedMs(orgId, weekAgo),
      getAvgEscalationResponseMs(orgId, weekAgo),
      getCompletionByMember(orgId, weekAgo),
      getDelegationRatioByDay(orgId, weekAgo),
    ]);

  return {
    period: {
      from: weekAgo.toISOString(),
      to: now.toISOString(),
    },
    stats: {
      completedThisWeek: completed,
      createdThisWeek: created,
      overdueNow: overdue,
    },
    byType: Object.fromEntries(byType.map((r) => [r.type, r._count.id])),
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count.id])),
    triageSpeedMs,
    escalationResponseMs,
    completionByMember,
    delegationRatioByDay,
  };
}
