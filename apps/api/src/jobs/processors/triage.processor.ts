import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma';
import { emitToOrg } from '../../lib/socket';
import { anthropic } from '../../lib/anthropic';

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

export async function processTriageJob(job: Job): Promise<void> {
  const { itemId, orgId } = job.data;

  // Parallel fetch: item, org with members, last 20 delegation completed items
  const [item, org, history] = await Promise.all([
    prisma.workItem.findUnique({
      where: { id: itemId },
      include: workItemInclude,
    }),
    prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        members: true,
      },
    }),
    prisma.workItem.findMany({
      where: {
        orgId,
        type: 'DELEGATION',
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
      take: 20,
      include: {
        from: { select: { id: true, name: true, role: true } },
        to: { select: { id: true, name: true, role: true } },
      },
    }),
  ]);

  if (!item || !org) {
    console.error(`[triage] Item ${itemId} or org ${orgId} not found`);
    return;
  }

  const memberList = org.members
    .map((m) => `- ${m.name} (${m.role}) [id: ${m.id}]`)
    .join('\n');

  const historyList = history
    .map((h) => `- "${h.title}" → ${h.to?.name ?? 'Unknown'} (${h.to?.role ?? 'Unknown'})`)
    .join('\n');

  const prompt = `You are an AI assistant helping a leader triage work items. Analyze this work item and suggest the best owner and priority.

Work Item:
- Title: ${item.title}
- Description: ${item.description ?? 'None'}
- Type: ${item.type}
- Current Priority: ${item.priority}
- From: ${item.from ? `${item.from.name} (${item.from.role})` : item.fromExternal ?? 'External'}
- Assigned To: ${item.to.name} (${item.to.role})

Organization Members:
${memberList}

Recent Delegation History (last 20 completed):
${historyList || 'No history yet'}

Based on the work item type, description, and delegation patterns, suggest:
1. The best priority (LOW, MEDIUM, HIGH, or URGENT)
2. The best owner from the member list (use their id)
3. A brief rationale (1-2 sentences)

Return ONLY this JSON structure, no other text, no markdown code blocks: {"priority":"...","suggestedOwnerId":"...","rationale":"..."}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    const parsed = JSON.parse(text);

    await prisma.workItem.update({
      where: { id: itemId },
      data: {
        aiSuggestedPriority: parsed.priority ?? null,
        aiSuggestedOwner: parsed.suggestedOwnerId ?? null,
        aiRationale: parsed.rationale ?? null,
      },
    });
  } catch (err) {
    console.error('[triage] AI suggestion failed:', err instanceof Error ? err.message : err);
    return;
  }

  // Refetch and emit
  const updated = await prisma.workItem.findUnique({
    where: { id: itemId },
    include: workItemInclude,
  });

  if (!updated) return;

  const serialized = serializeItem(updated);

  emitToOrg(orgId, {
    type: 'ITEM_UPDATED',
    payload: serialized,
    timestamp: new Date().toISOString(),
  });
}
