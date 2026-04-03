import { describe, it, expect, vi } from 'vitest';
import { prisma } from '../../lib/prisma';
import { evaluateAndApplyRules } from '../../services/automation.service';
import type { WorkItem } from '@leaderflow/shared';

const mockPrisma = prisma as any;

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeWorkItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'item-1',
    title: 'Routine update',
    description: null,
    type: 'INGRESS',
    status: 'PENDING',
    priority: 'MEDIUM',
    orgId: 'org-1',
    toMemberId: 'mbr-1',
    fromMemberId: null,
    fromExternal: null,
    dueAt: null,
    acknowledgedAt: null,
    completedAt: null,
    aiAutomatable: false,
    tags: [],
    updates: [],
    createdAt: '2024-06-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTitleContainsRule(orgId = 'org-1', titleContains = 'security') {
  return {
    id: 'rule-1',
    name: 'Security escalation rule',
    orgId,
    type: 'trigger',
    enabled: true,
    runCount: 0,
    lastRunAt: null,
    condition: { titleContains },
    action: {
      updateStatus: { status: 'IN_PROGRESS' },
    },
  };
}

// ─── evaluateAndApplyRules ───────────────────────────────────────────────────

describe('evaluateAndApplyRules', () => {
  it('fires the rule action when the title matches the condition', async () => {
    const rule = makeTitleContainsRule('org-1', 'security');
    mockPrisma.automationRule.findMany.mockResolvedValue([rule]);
    mockPrisma.workItem.update.mockResolvedValue({});
    mockPrisma.automationRule.update.mockResolvedValue({});

    const item = makeWorkItem({ title: 'Critical security vulnerability found' });

    await evaluateAndApplyRules(item, 'org-1');

    // Action (updateStatus) should have fired
    expect(mockPrisma.workItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1' },
        data: { status: 'IN_PROGRESS' },
      })
    );

    // Rule run count should be incremented
    expect(mockPrisma.automationRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rule-1' },
        data: expect.objectContaining({ runCount: { increment: 1 } }),
      })
    );
  });

  it('does NOT fire the rule when the title does not match the condition', async () => {
    const rule = makeTitleContainsRule('org-1', 'security');
    mockPrisma.automationRule.findMany.mockResolvedValue([rule]);

    const item = makeWorkItem({ title: 'Weekly team standup notes' });

    await evaluateAndApplyRules(item, 'org-1');

    expect(mockPrisma.workItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.automationRule.update).not.toHaveBeenCalled();
  });

  it('skips recurring_task rules regardless of condition match', async () => {
    const rule = { ...makeTitleContainsRule(), type: 'recurring_task' };
    mockPrisma.automationRule.findMany.mockResolvedValue([rule]);

    // Title matches the condition, but the rule type should be skipped
    const item = makeWorkItem({ title: 'security audit' });

    await evaluateAndApplyRules(item, 'org-1');

    expect(mockPrisma.workItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.automationRule.update).not.toHaveBeenCalled();
  });

  it('does nothing when there are no enabled rules', async () => {
    mockPrisma.automationRule.findMany.mockResolvedValue([]);

    const item = makeWorkItem({ title: 'security issue' });

    await evaluateAndApplyRules(item, 'org-1');

    expect(mockPrisma.workItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.automationRule.update).not.toHaveBeenCalled();
  });

  it('fires delegate action: creates delegation item and adds an update', async () => {
    const rule = {
      id: 'rule-2',
      name: 'Auto-delegate to security team',
      orgId: 'org-1',
      type: 'trigger',
      enabled: true,
      runCount: 0,
      lastRunAt: null,
      condition: { titleContains: 'security' },
      action: {
        delegate: { toMemberId: 'mbr-security', note: 'Auto-routed to security' },
      },
    };

    mockPrisma.automationRule.findMany.mockResolvedValue([rule]);
    mockPrisma.workItem.create.mockResolvedValue({ id: 'delegated-item-1' });
    mockPrisma.workItemUpdate.create.mockResolvedValue({});
    mockPrisma.workItem.update.mockResolvedValue({});
    mockPrisma.automationRule.update.mockResolvedValue({});

    const item = makeWorkItem({ title: 'security breach detected', toMemberId: 'mbr-1' });

    await evaluateAndApplyRules(item, 'org-1');

    // Should create a delegation work item
    expect(mockPrisma.workItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'DELEGATION',
          toMemberId: 'mbr-security',
          fromMemberId: 'mbr-1',
        }),
      })
    );

    // Should create an update on the original item
    expect(mockPrisma.workItemUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          itemId: 'item-1',
          note: 'Auto-routed to security',
        }),
      })
    );

    // Should update original item to IN_PROGRESS
    expect(mockPrisma.workItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-1' },
        data: { status: 'IN_PROGRESS' },
      })
    );
  });

  it('is case-insensitive for titleContains matching', async () => {
    const rule = makeTitleContainsRule('org-1', 'SECURITY');
    mockPrisma.automationRule.findMany.mockResolvedValue([rule]);
    mockPrisma.workItem.update.mockResolvedValue({});
    mockPrisma.automationRule.update.mockResolvedValue({});

    // lowercase title should still match uppercase condition
    const item = makeWorkItem({ title: 'security patch required' });

    await evaluateAndApplyRules(item, 'org-1');

    expect(mockPrisma.workItem.update).toHaveBeenCalled();
  });
});
