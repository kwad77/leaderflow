import { Job } from 'bullmq';
import { prisma } from '../../lib/prisma';
import { ai } from '../../lib/ai';
import * as orgService from '../../services/org.service';

export async function processAutomationJob(_job: Job): Promise<void> {
  const org = await orgService.getFirstOrg();
  const orgId = org.id;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const completedItems = await prisma.workItem.findMany({
    where: {
      orgId,
      status: 'COMPLETED',
      completedAt: { gte: thirtyDaysAgo },
    },
    include: {
      from: { select: { id: true, name: true, role: true } },
      to: { select: { id: true, name: true, role: true } },
    },
    orderBy: { completedAt: 'desc' },
  });

  if (completedItems.length < 5) {
    console.log(`[automation] Not enough completed items (${completedItems.length}) to detect patterns`);
    return;
  }

  // Build lean items array for Claude
  const leanItems = completedItems.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    source: item.source,
    fromName: item.from?.name ?? null,
    toName: item.to?.name ?? null,
    toRole: item.to?.role ?? null,
  }));

  const prompt = `You are an AI assistant analyzing work item patterns for a leadership team. Analyze the following completed work items from the last 30 days and identify automation opportunities.

Completed Work Items (${completedItems.length} total):
${JSON.stringify(leanItems, null, 2)}

Identify up to 5 automation opportunities. For each opportunity, provide:
- pattern: description of the repeating pattern
- frequency: how often this pattern occurs (number)
- affectedItemIds: array of item ids that match this pattern
- automationType: one of "routing_rule", "approval_chain", "recurring_task", "status_update"
- confidence: 0.0 to 1.0 confidence score
- suggestedRule: a brief description of the automation rule to create
- estimatedTimeSavingsMinutes: estimated time saved per occurrence in minutes

Return ONLY a JSON array, no other text, no markdown code blocks: [{"pattern":"...","frequency":0,"affectedItemIds":[],"automationType":"...","confidence":0.0,"suggestedRule":"...","estimatedTimeSavingsMinutes":0}]`;

  let opportunities: any[] = [];

  try {
    const text = await ai.complete(prompt, 'smart', 1024);
    opportunities = JSON.parse(text || '[]');
  } catch (err) {
    console.error('[automation] AI analysis failed:', err instanceof Error ? err.message : err);
    return;
  }

  let appliedCount = 0;

  for (const opp of opportunities) {
    if (opp.confidence >= 0.6 && Array.isArray(opp.affectedItemIds) && opp.affectedItemIds.length > 0) {
      await prisma.workItem.updateMany({
        where: { id: { in: opp.affectedItemIds } },
        data: {
          aiAutomatable: true,
          aiAutomationNotes: opp.suggestedRule,
        },
      });
      appliedCount++;
    }
  }

  console.log(`[automation] Detected ${opportunities.length} opportunities from ${completedItems.length} completed items`);
}
