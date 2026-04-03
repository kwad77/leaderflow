import { prisma } from '../lib/prisma';
import type { WorkItem } from '@leaderflow/shared';

interface RuleCondition {
  titleContains?: string;
  type?: string;
  status?: string;
  fromMemberId?: string;
  toMemberId?: string;
  source?: string;
  cron?: string;
}

interface RuleAction {
  delegate?: { toMemberId: string; note?: string };
  create?: { title: string; type: string; toMemberId: string; priority: string; description?: string };
  updateStatus?: { status: string };
}

export async function evaluateAndApplyRules(
  item: WorkItem,
  orgId: string
): Promise<void> {
  const rules = await prisma.automationRule.findMany({
    where: { orgId, enabled: true },
  });

  for (const rule of rules) {
    if (rule.type === 'recurring_task') continue;

    const condition = rule.condition as RuleCondition;
    const action = rule.action as RuleAction;

    if (!matchesCondition(item, condition)) continue;

    await executeAction(item, action, orgId);

    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { runCount: { increment: 1 }, lastRunAt: new Date() },
    });

    console.log(`[automation] Rule "${rule.name}" fired on item ${item.id}`);
  }
}

function matchesCondition(item: WorkItem, condition: RuleCondition): boolean {
  if (condition.titleContains) {
    const needle = condition.titleContains.toLowerCase();
    if (!item.title.toLowerCase().includes(needle)) return false;
  }
  if (condition.type && item.type !== condition.type) return false;
  if (condition.status && item.status !== condition.status) return false;
  if (condition.fromMemberId && item.fromMemberId !== condition.fromMemberId) return false;
  if (condition.toMemberId && item.toMemberId !== condition.toMemberId) return false;
  if (condition.source && item.source !== condition.source) return false;
  return true;
}

async function executeAction(
  item: WorkItem,
  action: RuleAction,
  orgId: string
): Promise<void> {
  if (action.delegate) {
    await prisma.workItem.create({
      data: {
        title: item.title,
        description: item.description,
        type: 'DELEGATION',
        status: 'PENDING',
        priority: item.priority as any,
        orgId,
        fromMemberId: item.toMemberId,
        toMemberId: action.delegate.toMemberId,
        tags: item.tags ?? [],
        metadata: { automatedFromId: item.id, automatedByRule: true } as any,
      },
    });
    await prisma.workItemUpdate.create({
      data: {
        itemId: item.id,
        note: action.delegate.note ?? 'Auto-delegated by automation rule',
        statusChange: 'IN_PROGRESS',
      },
    });
    await prisma.workItem.update({
      where: { id: item.id },
      data: { status: 'IN_PROGRESS' as any },
    });
  }

  if (action.create) {
    await prisma.workItem.create({
      data: {
        title: action.create.title,
        description: action.create.description,
        type: action.create.type as any,
        status: 'PENDING',
        priority: action.create.priority as any,
        orgId,
        toMemberId: action.create.toMemberId,
        tags: [],
        metadata: { automatedByRule: true } as any,
      },
    });
  }

  if (action.updateStatus) {
    await prisma.workItem.update({
      where: { id: item.id },
      data: { status: action.updateStatus.status as any },
    });
  }
}
