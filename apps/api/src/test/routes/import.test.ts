import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import importRouter from '../../routes/import';
import { errorHandler } from '../../middleware/errorHandler';
import { prisma } from '../../lib/prisma';

// Mock org service — import routes resolve orgId via getFirstOrg, not req.auth
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

function createImportApp() {
  const app = express();
  app.use(express.json());
  app.use(express.text({ type: 'text/csv' }));
  // Mock orgId injection (not strictly needed since routes use getFirstOrg, but
  // mirrors the documented pattern and satisfies any future auth checks)
  app.use((req: any, _res, next) => {
    req.auth = { sessionClaims: { orgId: 'org-test' } };
    next();
  });
  app.use('/api/import', importRouter);
  app.use(errorHandler);
  return app;
}

// ─── GET /api/import/template ─────────────────────────────────────────────────

describe('GET /api/import/template', () => {
  it('returns 200 with Content-Type text/csv', async () => {
    const app = createImportApp();

    const res = await request(app).get('/api/import/template');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  it('response body contains the required CSV header row', async () => {
    const app = createImportApp();

    const res = await request(app).get('/api/import/template');

    expect(res.text).toContain('name,email,role,managerEmail');
  });

  it('includes Content-Disposition attachment header', async () => {
    const app = createImportApp();

    const res = await request(app).get('/api/import/template');

    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/leaderflow-import-template\.csv/);
  });
});

// ─── POST /api/import/json ────────────────────────────────────────────────────

describe('POST /api/import/json', () => {
  it('returns 200 with created/updated/skipped/errors when members are new', async () => {
    const app = createImportApp();

    // findFirst returns null → create path
    mockPrisma.member.findFirst.mockResolvedValue(null);
    mockPrisma.member.create.mockResolvedValue({ id: 'mbr-new-1' });

    const res = await request(app)
      .post('/api/import/json')
      .send({
        members: [
          { name: 'Alice', email: 'alice@example.com', role: 'CEO', managerEmail: null },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 1, updated: 0, skipped: 0, errors: [] });
  });

  it('increments updated count when member already exists', async () => {
    const app = createImportApp();

    mockPrisma.member.findFirst.mockResolvedValue({ id: 'mbr-existing' });
    mockPrisma.member.update.mockResolvedValue({ id: 'mbr-existing' });

    const res = await request(app)
      .post('/api/import/json')
      .send({
        members: [
          { name: 'Alice', email: 'alice@example.com', role: 'CEO' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    expect(mockPrisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mbr-existing' } })
    );
  });

  it('returns 400 when members array is empty (Zod min(1))', async () => {
    const app = createImportApp();

    const res = await request(app)
      .post('/api/import/json')
      .send({ members: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid request body/i);
  });

  it('returns 400 when members field is absent', async () => {
    const app = createImportApp();

    const res = await request(app)
      .post('/api/import/json')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid request body/i);
  });

  it('skips members with missing name and reports the error', async () => {
    const app = createImportApp();

    // Zod schema requires name to be non-empty string, so a member with empty
    // name will fail schema validation.  Test member with spaces-only name
    // that passes Zod (non-empty string) but is skipped by importMembers logic.
    mockPrisma.member.findFirst.mockResolvedValue(null);
    mockPrisma.member.create.mockResolvedValue({ id: 'mbr-new-2' });

    const res = await request(app)
      .post('/api/import/json')
      .send({
        members: [
          // valid member
          { name: 'Bob', email: 'bob@example.com', role: 'VP' },
          // name is whitespace-only — passes Zod min(1) but importMembers trims it and skips
          { name: '   ', email: 'ghost@example.com', role: 'Member' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.skipped).toBeGreaterThan(0);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0]).toMatch(/missing name/i);
  });

  it('links managerEmail to parentId after both members are created', async () => {
    const app = createImportApp();

    // Pass 1 findFirst calls: null for both → create path
    mockPrisma.member.findFirst.mockResolvedValue(null);
    mockPrisma.member.create
      .mockResolvedValueOnce({ id: 'mbr-ceo' })
      .mockResolvedValueOnce({ id: 'mbr-vp' });
    // Pass 2 update for parentId
    mockPrisma.member.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/import/json')
      .send({
        members: [
          { name: 'Sarah', email: 'sarah@co.com', role: 'CEO', managerEmail: null },
          { name: 'Marcus', email: 'marcus@co.com', role: 'VP', managerEmail: 'sarah@co.com' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2);
    // update called for the parentId link
    expect(mockPrisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parentId: 'mbr-ceo' }) })
    );
  });
});

// ─── POST /api/import/csv ─────────────────────────────────────────────────────

describe('POST /api/import/csv', () => {
  const validCSV = 'name,email,role,managerEmail\nAlice,alice@example.com,CEO,\nBob,bob@example.com,VP,alice@example.com';

  beforeEach(() => {
    mockPrisma.member.findFirst.mockResolvedValue(null);
    mockPrisma.member.create
      .mockResolvedValueOnce({ id: 'mbr-alice' })
      .mockResolvedValueOnce({ id: 'mbr-bob' });
    mockPrisma.member.update.mockResolvedValue({});
  });

  it('returns 200 with import result when Content-Type is text/csv', async () => {
    const app = createImportApp();

    const res = await request(app)
      .post('/api/import/csv')
      .set('Content-Type', 'text/csv')
      .send(validCSV);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, updated: 0, skipped: 0 });
  });

  it('returns 200 with import result when body is JSON { csv: "..." }', async () => {
    const app = createImportApp();

    const res = await request(app)
      .post('/api/import/csv')
      .set('Content-Type', 'application/json')
      .send({ csv: validCSV });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, updated: 0, skipped: 0 });
  });

  it('returns 400 when CSV has no data rows', async () => {
    const app = createImportApp();

    const res = await request(app)
      .post('/api/import/csv')
      .set('Content-Type', 'text/csv')
      .send('name,email,role,managerEmail');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No data rows/i);
  });

  it('returns 400 when CSV is missing a required header', async () => {
    const app = createImportApp();

    // "role" column absent
    const badCSV = 'name,email\nAlice,alice@example.com';

    const res = await request(app)
      .post('/api/import/csv')
      .set('Content-Type', 'text/csv')
      .send(badCSV);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required header/i);
  });

  it('returns 400 when JSON body has no csv field', async () => {
    const app = createImportApp();

    const res = await request(app)
      .post('/api/import/csv')
      .set('Content-Type', 'application/json')
      .send({ notCsv: 'foo' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/csv.*string/i);
  });

  it('calls getFirstOrg to resolve the org, not req.auth', async () => {
    const app = createImportApp();

    await request(app)
      .post('/api/import/csv')
      .set('Content-Type', 'text/csv')
      .send(validCSV);

    expect(vi.mocked(orgService.getFirstOrg)).toHaveBeenCalled();
  });
});
