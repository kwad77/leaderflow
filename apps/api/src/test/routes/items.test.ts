import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import { prisma } from '../../lib/prisma';

// The items router calls orgService.getFirstOrg() internally.
// Mock the org service so we don't need a real DB.
vi.mock('../../services/org.service', () => ({
  getFirstOrg: vi.fn().mockResolvedValue({
    id: 'org-test',
    name: 'Test Org',
    createdAt: new Date('2024-01-01'),
  }),
  getOrgTree: vi.fn(),
  listMembers: vi.fn(),
  getMemberById: vi.fn(),
  createMember: vi.fn(),
}));

// The items router calls workItem service functions.
// We partially mock the service while preserving Zod validation in the route.
vi.mock('../../services/workItem.service', () => ({
  listWorkItems: vi.fn(),
  getWorkItemById: vi.fn(),
  createWorkItem: vi.fn(),
  acknowledgeWorkItem: vi.fn(),
  completeWorkItem: vi.fn(),
  delegateWorkItem: vi.fn(),
}));

import * as workItemService from '../../services/workItem.service';

const mockWorkItemService = workItemService as Record<string, ReturnType<typeof vi.fn>>;
const mockPrisma = prisma as any;

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSerializedItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    title: 'Fix login bug',
    description: 'Users cannot log in',
    type: 'INGRESS',
    status: 'PENDING',
    priority: 'HIGH',
    orgId: 'org-test',
    toMemberId: 'mbr-1',
    fromMemberId: 'mbr-2',
    fromExternal: null,
    dueAt: null,
    acknowledgedAt: null,
    completedAt: null,
    tags: [],
    metadata: {},
    createdAt: '2024-06-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    to: {
      id: 'mbr-1',
      name: 'Alice',
      email: 'alice@acme.com',
      role: 'Manager',
      orgId: 'org-test',
      parentId: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    from: {
      id: 'mbr-2',
      name: 'Bob',
      email: 'bob@acme.com',
      role: 'Director',
      orgId: 'org-test',
      parentId: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    },
    updates: [],
    ...overrides,
  };
}

// ─── GET /api/items ──────────────────────────────────────────────────────────

describe('GET /api/items', () => {
  it('returns 200 with an array of items', async () => {
    const app = createTestApp();
    const items = [makeSerializedItem(), makeSerializedItem({ id: 'item-2', title: 'Deploy hotfix' })];
    mockWorkItemService.listWorkItems.mockResolvedValue(items);

    const res = await request(app).get('/api/items');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Fix login bug');
  });

  it('returns 200 with an empty array when no items exist', async () => {
    const app = createTestApp();
    mockWorkItemService.listWorkItems.mockResolvedValue([]);

    const res = await request(app).get('/api/items');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ─── POST /api/items ─────────────────────────────────────────────────────────

describe('POST /api/items', () => {
  it('returns 201 with the created item when body is valid', async () => {
    const app = createTestApp();
    const created = makeSerializedItem();
    mockWorkItemService.createWorkItem.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/items')
      .send({
        title: 'Fix login bug',
        description: 'Users cannot log in',
        type: 'INGRESS',
        priority: 'HIGH',
        toMemberId: 'mbr-1',
        fromMemberId: 'mbr-2',
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Fix login bug');
    expect(mockWorkItemService.createWorkItem).toHaveBeenCalledWith(
      'org-test',
      expect.objectContaining({ title: 'Fix login bug', type: 'INGRESS' })
    );
  });

  it('returns 400 when title is missing (Zod validation)', async () => {
    const app = createTestApp();

    const res = await request(app)
      .post('/api/items')
      .send({
        type: 'INGRESS',
        priority: 'HIGH',
        toMemberId: 'mbr-1',
        // title intentionally omitted
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('returns 400 when type is invalid (Zod validation)', async () => {
    const app = createTestApp();

    const res = await request(app)
      .post('/api/items')
      .send({
        title: 'Task',
        type: 'NOT_A_TYPE',
        priority: 'HIGH',
        toMemberId: 'mbr-1',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('returns 400 when priority is invalid (Zod validation)', async () => {
    const app = createTestApp();

    const res = await request(app)
      .post('/api/items')
      .send({
        title: 'Task',
        type: 'INGRESS',
        priority: 'EXTREME',
        toMemberId: 'mbr-1',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });
});

// ─── POST /api/items/:id/acknowledge ─────────────────────────────────────────

describe('POST /api/items/:id/acknowledge', () => {
  it('returns 200 with the acknowledged item', async () => {
    const app = createTestApp();
    const acknowledged = makeSerializedItem({
      status: 'ACKNOWLEDGED',
      acknowledgedAt: '2024-06-02T10:00:00.000Z',
    });
    mockWorkItemService.acknowledgeWorkItem.mockResolvedValue(acknowledged);

    const res = await request(app).post('/api/items/item-1/acknowledge');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACKNOWLEDGED');
    expect(mockWorkItemService.acknowledgeWorkItem).toHaveBeenCalledWith('item-1', 'org-test');
  });

  it('returns 404 when the item does not exist', async () => {
    const app = createTestApp();
    const error = new Error('Work item not found') as any;
    error.statusCode = 404;
    mockWorkItemService.acknowledgeWorkItem.mockRejectedValue(error);

    const res = await request(app).post('/api/items/no-such-item/acknowledge');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Work item not found');
  });
});

// ─── POST /api/items/:id/complete ─────────────────────────────────────────────

describe('POST /api/items/:id/complete', () => {
  it('returns 200 with the completed item', async () => {
    const app = createTestApp();
    const completed = makeSerializedItem({
      status: 'COMPLETED',
      completedAt: '2024-06-03T12:00:00.000Z',
    });
    mockWorkItemService.completeWorkItem.mockResolvedValue(completed);

    const res = await request(app)
      .post('/api/items/item-1/complete')
      .send({ note: 'All done' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    expect(mockWorkItemService.completeWorkItem).toHaveBeenCalledWith(
      'item-1',
      'org-test',
      'All done'
    );
  });
});
