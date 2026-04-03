import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { prisma } from '../../lib/prisma';
import { createScimTestApp } from '../helpers/scimTestApp';

// Mock org.service so getFirstOrg and getOrgTree don't hit the DB
vi.mock('../../services/org.service', () => ({
  getFirstOrg: vi.fn(),
  getOrgTree: vi.fn(),
  getSubtreeIds: vi.fn(),
  createMember: vi.fn(),
  getMemberById: vi.fn(),
  listMembers: vi.fn(),
  getOrgById: vi.fn(),
}));

import { getFirstOrg, getOrgTree } from '../../services/org.service';

const app = createScimTestApp();

const ORG = { id: 'org-1', name: 'acme.com', createdAt: new Date(), updatedAt: new Date() };

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mbr-1',
    email: 'alice@example.com',
    name: 'Alice',
    role: 'Manager',
    orgId: 'org-1',
    parentId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    userId: null,
    ...overrides,
  };
}

describe('GET /api/scim/v2/ServiceProviderConfig', () => {
  it('returns 200 with correct schemas array', async () => {
    const res = await request(app).get('/api/scim/v2/ServiceProviderConfig');

    expect(res.status).toBe(200);
    expect(res.body.schemas).toContain(
      'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'
    );
    expect(res.body.patch).toEqual({ supported: true });
    expect(res.body.filter).toEqual({ supported: true, maxResults: 200 });
  });
});

describe('GET /api/scim/v2/Users', () => {
  it('returns 200 with ListResponse schema and all members', async () => {
    vi.mocked(getFirstOrg).mockResolvedValueOnce(ORG as any);
    vi.mocked(prisma.member.findMany).mockResolvedValueOnce([
      makeMember({ id: 'mbr-1', email: 'alice@example.com' }),
      makeMember({ id: 'mbr-2', email: 'bob@example.com' }),
    ] as any);

    const res = await request(app).get('/api/scim/v2/Users');

    expect(res.status).toBe(200);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
    expect(res.body.totalResults).toBe(2);
    expect(res.body.Resources).toHaveLength(2);
  });

  it('returns filtered results when filter=userName eq "..." is provided', async () => {
    vi.mocked(getFirstOrg).mockResolvedValueOnce(ORG as any);
    vi.mocked(prisma.member.findMany).mockResolvedValueOnce([
      makeMember({ id: 'mbr-1', email: 'alice@example.com' }),
      makeMember({ id: 'mbr-2', email: 'bob@example.com' }),
    ] as any);

    const res = await request(app)
      .get('/api/scim/v2/Users')
      .query({ filter: 'userName eq "alice@example.com"' });

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(1);
    expect(res.body.Resources[0].userName).toBe('alice@example.com');
  });
});

describe('POST /api/scim/v2/Users', () => {
  it('returns 201 with SCIM user object when email is new', async () => {
    vi.mocked(getFirstOrg).mockResolvedValueOnce(ORG as any);
    vi.mocked(prisma.member.findFirst).mockResolvedValueOnce(null);
    const newMember = makeMember({ id: 'mbr-new', email: 'charlie@example.com', name: 'Charlie', role: 'IC' });
    vi.mocked(prisma.member.create).mockResolvedValueOnce(newMember as any);
    vi.mocked(getOrgTree).mockResolvedValueOnce({} as any);

    const res = await request(app)
      .post('/api/scim/v2/Users')
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'charlie@example.com',
        name: { formatted: 'Charlie' },
        title: 'IC',
      });

    expect(res.status).toBe(201);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:User');
    expect(res.body.userName).toBe('charlie@example.com');
    expect(res.body.id).toBe('mbr-new');
  });

  it('returns 409 when email already exists in the org', async () => {
    vi.mocked(getFirstOrg).mockResolvedValueOnce(ORG as any);
    vi.mocked(prisma.member.findFirst).mockResolvedValueOnce(
      makeMember({ email: 'alice@example.com' }) as any
    );

    const res = await request(app)
      .post('/api/scim/v2/Users')
      .send({
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
        userName: 'alice@example.com',
        name: { formatted: 'Alice Duplicate' },
      });

    expect(res.status).toBe(409);
    expect(res.body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');
    expect(res.body.status).toBe('409');
  });
});

describe('DELETE /api/scim/v2/Users/:id', () => {
  it('returns 204 when the member exists', async () => {
    vi.mocked(getFirstOrg).mockResolvedValueOnce(ORG as any);
    vi.mocked(prisma.member.findUnique).mockResolvedValueOnce(
      makeMember({ id: 'mbr-1', orgId: 'org-1' }) as any
    );
    vi.mocked(prisma.member.delete).mockResolvedValueOnce({} as any);
    vi.mocked(getOrgTree).mockResolvedValueOnce({} as any);

    const res = await request(app).delete('/api/scim/v2/Users/mbr-1');

    expect(res.status).toBe(204);
    expect(prisma.member.delete).toHaveBeenCalledWith({ where: { id: 'mbr-1' } });
  });

  it('returns 404 when the member id is unknown', async () => {
    vi.mocked(getFirstOrg).mockResolvedValueOnce(ORG as any);
    vi.mocked(prisma.member.findUnique).mockResolvedValueOnce(null);

    const res = await request(app).delete('/api/scim/v2/Users/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('404');
  });
});
