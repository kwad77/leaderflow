import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import notificationsRouter from '../../routes/notifications';
import { errorHandler } from '../../middleware/errorHandler';
import { prisma } from '../../lib/prisma';

// Mock org service — notifications routes resolve orgId via getFirstOrg
vi.mock('../../services/org.service', () => ({
  getFirstOrg: vi.fn().mockResolvedValue({ id: 'org-test', name: 'Test Org', createdAt: new Date('2024-01-01') }),
  getOrgTree: vi.fn(),
  listMembers: vi.fn(),
  getMemberById: vi.fn(),
  createMember: vi.fn(),
}));

import * as orgService from '../../services/org.service';

const mockPrisma = prisma as any;

// ─── Test app factory ─────────────────────────────────────────────────────────

function createNotificationsApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.auth = { sessionClaims: {} };
    next();
  });
  app.use('/api/notifications', notificationsRouter);
  app.use(errorHandler);
  return app;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mbr-1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'CEO',
    orgId: 'org-test',
    parentId: null,
    userId: null,
    metadata: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ─── GET /api/notifications/preferences ──────────────────────────────────────

describe('GET /api/notifications/preferences', () => {
  it('returns 200 with { members: [...] } containing all org members', async () => {
    const app = createNotificationsApp();

    mockPrisma.member.findMany.mockResolvedValue([
      makeMember({ id: 'mbr-1', name: 'Alice' }),
      makeMember({ id: 'mbr-2', name: 'Bob', email: 'bob@example.com' }),
    ]);

    const res = await request(app).get('/api/notifications/preferences');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('members');
    expect(Array.isArray(res.body.members)).toBe(true);
    expect(res.body.members).toHaveLength(2);
  });

  it('each member summary has id, name, emailDigest and slackDm fields', async () => {
    const app = createNotificationsApp();

    mockPrisma.member.findMany.mockResolvedValue([
      makeMember({ id: 'mbr-1', name: 'Alice' }),
    ]);

    const res = await request(app).get('/api/notifications/preferences');

    const member = res.body.members[0];
    expect(member).toHaveProperty('id', 'mbr-1');
    expect(member).toHaveProperty('name', 'Alice');
    expect(member).toHaveProperty('emailDigest');
    expect(member).toHaveProperty('slackDm');
  });

  it('uses defaults when member has no metadata', async () => {
    const app = createNotificationsApp();

    mockPrisma.member.findMany.mockResolvedValue([
      makeMember({ metadata: null }),
    ]);

    const res = await request(app).get('/api/notifications/preferences');

    expect(res.body.members[0].emailDigest).toBe('daily');
    expect(res.body.members[0].slackDm).toBe(false);
  });

  it('queries prisma with the orgId from getFirstOrg', async () => {
    const app = createNotificationsApp();
    mockPrisma.member.findMany.mockResolvedValue([]);

    await request(app).get('/api/notifications/preferences');

    expect(mockPrisma.member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: 'org-test' } })
    );
  });
});

// ─── GET /api/notifications/preferences/:memberId ────────────────────────────

describe('GET /api/notifications/preferences/:memberId', () => {
  it('returns 200 with DEFAULT preferences when member has no metadata', async () => {
    const app = createNotificationsApp();

    mockPrisma.member.findUnique.mockResolvedValue(
      makeMember({ id: 'mbr-1', metadata: null })
    );

    const res = await request(app).get('/api/notifications/preferences/mbr-1');

    expect(res.status).toBe(200);
    expect(res.body.emailDigest).toBe('daily');
    expect(res.body.emailDigestTime).toBe('08:00');
    expect(res.body.notifyOn.newAssignment).toBe(true);
    expect(res.body.notifyOn.escalation).toBe(true);
    expect(res.body.notifyOn.overdue).toBe(true);
    expect(res.body.notifyOn.atRisk).toBe(true);
    expect(res.body.notifyOn.aiSuggestion).toBe(false);
    expect(res.body.slackDm).toBe(false);
  });

  it('returns 200 with saved preferences when member has metadata.notifications', async () => {
    const app = createNotificationsApp();

    const savedPrefs = {
      emailDigest: 'weekly',
      emailDigestTime: '09:30',
      notifyOn: {
        newAssignment: false,
        escalation: true,
        overdue: false,
        atRisk: true,
        aiSuggestion: true,
      },
      slackDm: true,
    };

    mockPrisma.member.findUnique.mockResolvedValue(
      makeMember({ id: 'mbr-1', metadata: { notifications: savedPrefs } })
    );

    const res = await request(app).get('/api/notifications/preferences/mbr-1');

    expect(res.status).toBe(200);
    expect(res.body.emailDigest).toBe('weekly');
    expect(res.body.emailDigestTime).toBe('09:30');
    expect(res.body.slackDm).toBe(true);
    expect(res.body.notifyOn.aiSuggestion).toBe(true);
    expect(res.body.notifyOn.newAssignment).toBe(false);
  });

  it('returns 404 when member does not exist', async () => {
    const app = createNotificationsApp();

    mockPrisma.member.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/notifications/preferences/no-such-member');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Member not found/i);
  });

  it('returns 404 when member belongs to a different org', async () => {
    const app = createNotificationsApp();

    // Member exists but belongs to a different org
    mockPrisma.member.findUnique.mockResolvedValue(
      makeMember({ id: 'mbr-foreign', orgId: 'org-other' })
    );

    const res = await request(app).get('/api/notifications/preferences/mbr-foreign');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Member not found/i);
  });
});

// ─── PUT /api/notifications/preferences/:memberId ────────────────────────────

describe('PUT /api/notifications/preferences/:memberId', () => {
  it('returns 200 with merged preferences when update is valid', async () => {
    const app = createNotificationsApp();

    mockPrisma.member.findUnique.mockResolvedValue(
      makeMember({ id: 'mbr-1', metadata: null })
    );
    mockPrisma.member.update.mockResolvedValue({});

    const res = await request(app)
      .put('/api/notifications/preferences/mbr-1')
      .send({ emailDigest: 'weekly' });

    expect(res.status).toBe(200);
    // emailDigest updated to the requested value
    expect(res.body.emailDigest).toBe('weekly');
    // other fields retain defaults
    expect(res.body.emailDigestTime).toBe('08:00');
    expect(res.body.slackDm).toBe(false);
  });

  it('calls prisma.member.update with merged metadata.notifications', async () => {
    const app = createNotificationsApp();

    mockPrisma.member.findUnique.mockResolvedValue(
      makeMember({ id: 'mbr-1', metadata: null })
    );
    mockPrisma.member.update.mockResolvedValue({});

    await request(app)
      .put('/api/notifications/preferences/mbr-1')
      .send({ emailDigest: 'weekly', slackDm: true });

    expect(mockPrisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mbr-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            notifications: expect.objectContaining({
              emailDigest: 'weekly',
              slackDm: true,
            }),
          }),
        }),
      })
    );
  });

  it('merges partial update with existing saved preferences', async () => {
    const app = createNotificationsApp();

    const existingPrefs = {
      emailDigest: 'daily',
      emailDigestTime: '07:00',
      notifyOn: {
        newAssignment: true,
        escalation: true,
        overdue: true,
        atRisk: true,
        aiSuggestion: false,
      },
      slackDm: true,
    };

    mockPrisma.member.findUnique.mockResolvedValue(
      makeMember({ id: 'mbr-1', metadata: { notifications: existingPrefs } })
    );
    mockPrisma.member.update.mockResolvedValue({});

    const res = await request(app)
      .put('/api/notifications/preferences/mbr-1')
      .send({ emailDigest: 'none' });

    expect(res.status).toBe(200);
    // updated field
    expect(res.body.emailDigest).toBe('none');
    // untouched fields preserved from existing prefs
    expect(res.body.emailDigestTime).toBe('07:00');
    expect(res.body.slackDm).toBe(true);
  });

  it('returns 400 when emailDigest value is invalid', async () => {
    const app = createNotificationsApp();

    const res = await request(app)
      .put('/api/notifications/preferences/mbr-1')
      .send({ emailDigest: 'hourly' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Validation failed/i);
  });

  it('returns 400 when emailDigestTime does not match HH:MM format', async () => {
    const app = createNotificationsApp();

    const res = await request(app)
      .put('/api/notifications/preferences/mbr-1')
      .send({ emailDigestTime: '9:00am' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Validation failed/i);
    expect(res.body.errors[0].message).toMatch(/HH:MM/);
  });

  it('returns 404 when member does not exist', async () => {
    const app = createNotificationsApp();

    mockPrisma.member.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/notifications/preferences/no-such-member')
      .send({ emailDigest: 'weekly' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Member not found/i);
  });
});
