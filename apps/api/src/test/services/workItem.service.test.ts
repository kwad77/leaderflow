import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma';
import { emitToOrg } from '../../lib/socket';
import { triageQueue, escalationQueue } from '../../jobs/queue';
import {
  createWorkItem,
  acknowledgeWorkItem,
  completeWorkItem,
} from '../../services/workItem.service';

// Cast mocks for typed access
const mockPrisma = prisma as any;
const mockEmitToOrg = emitToOrg as ReturnType<typeof vi.fn>;
const mockTriageQueue = triageQueue as any;
const mockEscalationQueue = escalationQueue as any;

// ─── Shared fixtures ────────────────────────────────────────────────────────

const mockMember = {
  id: 'mbr-1',
  name: 'Alice',
  email: 'alice@acme.com',
  role: 'Manager',
  orgId: 'org-1',
  parentId: null,
  createdAt: new Date('2024-01-01'),
};

const mockMemberFrom = {
  id: 'mbr-2',
  name: 'Bob',
  email: 'bob@acme.com',
  role: 'Director',
  orgId: 'org-1',
  parentId: null,
  createdAt: new Date('2024-01-01'),
};

function makeWorkItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    title: 'Fix login bug',
    description: 'Users cannot log in',
    type: 'INGRESS',
    status: 'PENDING',
    priority: 'HIGH',
    orgId: 'org-1',
    toMemberId: 'mbr-1',
    fromMemberId: 'mbr-2',
    fromExternal: null,
    dueAt: null,
    acknowledgedAt: null,
    completedAt: null,
    tags: [],
    metadata: {},
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date('2024-06-01'),
    to: { ...mockMember, createdAt: new Date('2024-01-01') },
    from: { ...mockMemberFrom, createdAt: new Date('2024-01-01') },
    updates: [],
    ...overrides,
  };
}

// ─── createWorkItem ──────────────────────────────────────────────────────────

describe('createWorkItem', () => {
  it('creates a work item and emits ITEM_CREATED', async () => {
    const item = makeWorkItem();
    mockPrisma.member.findUnique
      .mockResolvedValueOnce(mockMember)       // toMember lookup
      .mockResolvedValueOnce(mockMemberFrom);  // fromMember lookup
    mockPrisma.workItem.create.mockResolvedValue(item);
    mockPrisma.automationRule.findMany.mockResolvedValue([]);

    const body = {
      title: 'Fix login bug',
      description: 'Users cannot log in',
      type: 'INGRESS' as const,
      priority: 'HIGH' as const,
      toMemberId: 'mbr-1',
      fromMemberId: 'mbr-2',
    };

    const result = await createWorkItem('org-1', body);

    expect(mockPrisma.workItem.create).toHaveBeenCalledOnce();
    expect(result.title).toBe('Fix login bug');

    expect(mockEmitToOrg).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ type: 'ITEM_CREATED' })
    );
  });

  it('queues a triage job for every new item', async () => {
    const item = makeWorkItem();
    mockPrisma.member.findUnique.mockResolvedValue(mockMember);
    mockPrisma.workItem.create.mockResolvedValue(item);
    mockPrisma.automationRule.findMany.mockResolvedValue([]);

    await createWorkItem('org-1', {
      title: 'Fix login bug',
      type: 'INGRESS' as const,
      priority: 'MEDIUM' as const,
      toMemberId: 'mbr-1',
    });

    expect(mockTriageQueue.add).toHaveBeenCalledWith(
      'triage-item',
      expect.objectContaining({ itemId: 'item-1', orgId: 'org-1' }),
      expect.any(Object)
    );
  });

  it('queues an escalation job for ESCALATION type items', async () => {
    const escalationItem = makeWorkItem({ type: 'ESCALATION' });
    mockPrisma.member.findUnique.mockResolvedValue(mockMember);
    mockPrisma.workItem.create.mockResolvedValue(escalationItem);
    mockPrisma.automationRule.findMany.mockResolvedValue([]);

    await createWorkItem('org-1', {
      title: 'Production is down',
      type: 'ESCALATION' as const,
      priority: 'URGENT' as const,
      toMemberId: 'mbr-1',
    });

    expect(mockEscalationQueue.add).toHaveBeenCalledWith(
      'route-escalation',
      expect.objectContaining({ itemId: 'item-1', orgId: 'org-1' }),
      expect.any(Object)
    );
  });

  it('does NOT queue an escalation job for non-ESCALATION items', async () => {
    const item = makeWorkItem({ type: 'INGRESS' });
    mockPrisma.member.findUnique.mockResolvedValue(mockMember);
    mockPrisma.workItem.create.mockResolvedValue(item);
    mockPrisma.automationRule.findMany.mockResolvedValue([]);

    await createWorkItem('org-1', {
      title: 'Routine task',
      type: 'INGRESS' as const,
      priority: 'LOW' as const,
      toMemberId: 'mbr-1',
    });

    expect(mockEscalationQueue.add).not.toHaveBeenCalled();
  });

  it('throws 404 when toMember is not in the org', async () => {
    mockPrisma.member.findUnique.mockResolvedValue({
      ...mockMember,
      orgId: 'other-org',
    });

    await expect(
      createWorkItem('org-1', {
        title: 'Task',
        type: 'INGRESS' as const,
        priority: 'LOW' as const,
        toMemberId: 'mbr-1',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 404 when toMember does not exist', async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);

    await expect(
      createWorkItem('org-1', {
        title: 'Task',
        type: 'INGRESS' as const,
        priority: 'LOW' as const,
        toMemberId: 'nonexistent',
      })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── acknowledgeWorkItem ─────────────────────────────────────────────────────

describe('acknowledgeWorkItem', () => {
  it('sets status to ACKNOWLEDGED and emits ITEM_ACKNOWLEDGED', async () => {
    const existing = makeWorkItem({ status: 'PENDING' });
    const updated = makeWorkItem({
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date('2024-06-02'),
    });

    mockPrisma.workItem.findUnique.mockResolvedValue(existing);
    mockPrisma.workItem.update.mockResolvedValue(updated);
    mockPrisma.workItemUpdate.create.mockResolvedValue({});

    const result = await acknowledgeWorkItem('item-1', 'org-1');

    expect(mockPrisma.workItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACKNOWLEDGED' }),
      })
    );

    expect(mockEmitToOrg).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ type: 'ITEM_ACKNOWLEDGED' })
    );

    expect(result.status).toBe('ACKNOWLEDGED');
  });

  it('throws 404 when item does not exist', async () => {
    mockPrisma.workItem.findUnique.mockResolvedValue(null);

    await expect(acknowledgeWorkItem('no-such-item', 'org-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 404 when item belongs to a different org', async () => {
    mockPrisma.workItem.findUnique.mockResolvedValue(
      makeWorkItem({ orgId: 'wrong-org' })
    );

    await expect(acknowledgeWorkItem('item-1', 'org-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ─── completeWorkItem ────────────────────────────────────────────────────────

describe('completeWorkItem', () => {
  it('sets status to COMPLETED, sets completedAt, and emits ITEM_COMPLETED', async () => {
    const completedAt = new Date('2024-06-03');
    const existing = makeWorkItem({ status: 'ACKNOWLEDGED' });
    const updated = makeWorkItem({
      status: 'COMPLETED',
      completedAt,
    });

    mockPrisma.workItem.findUnique.mockResolvedValue(existing);
    mockPrisma.workItem.update.mockResolvedValue(updated);
    mockPrisma.workItemUpdate.create.mockResolvedValue({});

    const result = await completeWorkItem('item-1', 'org-1');

    expect(mockPrisma.workItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
        }),
      })
    );

    expect(mockEmitToOrg).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ type: 'ITEM_COMPLETED' })
    );

    expect(result.status).toBe('COMPLETED');
    expect(result.completedAt).toBeTruthy();
  });

  it('uses the provided note when completing', async () => {
    const existing = makeWorkItem();
    const updated = makeWorkItem({ status: 'COMPLETED', completedAt: new Date() });

    mockPrisma.workItem.findUnique.mockResolvedValue(existing);
    mockPrisma.workItem.update.mockResolvedValue(updated);
    mockPrisma.workItemUpdate.create.mockResolvedValue({});

    await completeWorkItem('item-1', 'org-1', 'All done, shipped to prod');

    expect(mockPrisma.workItemUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: 'All done, shipped to prod' }),
      })
    );
  });

  it('falls back to default note when none provided', async () => {
    const existing = makeWorkItem();
    const updated = makeWorkItem({ status: 'COMPLETED', completedAt: new Date() });

    mockPrisma.workItem.findUnique.mockResolvedValue(existing);
    mockPrisma.workItem.update.mockResolvedValue(updated);
    mockPrisma.workItemUpdate.create.mockResolvedValue({});

    await completeWorkItem('item-1', 'org-1');

    expect(mockPrisma.workItemUpdate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: 'Item marked complete' }),
      })
    );
  });

  it('throws 404 when item does not exist', async () => {
    mockPrisma.workItem.findUnique.mockResolvedValue(null);

    await expect(completeWorkItem('missing', 'org-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
