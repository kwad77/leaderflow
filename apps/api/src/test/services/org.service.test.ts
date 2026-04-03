import { describe, it, expect, vi } from 'vitest';
import { prisma } from '../../lib/prisma';
import {
  createMember,
  getMemberById,
  getSubtreeIds,
} from '../../services/org.service';
import type { OrgTree } from '@leaderflow/shared';

const mockPrisma = prisma as any;

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mbr-1',
    name: 'Alice',
    email: 'alice@acme.com',
    role: 'Manager',
    orgId: 'org-1',
    parentId: null,
    userId: null,
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ─── createMember ────────────────────────────────────────────────────────────

describe('createMember', () => {
  it('creates a member without a parent', async () => {
    const member = makeMember();
    mockPrisma.member.create.mockResolvedValue(member);

    const result = await createMember({
      name: 'Alice',
      email: 'alice@acme.com',
      role: 'Manager',
      orgId: 'org-1',
    });

    expect(mockPrisma.member.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.member.create).toHaveBeenCalledOnce();
    expect(result.name).toBe('Alice');
  });

  it('looks up parent before creating when parentId is provided', async () => {
    const parent = makeMember({ id: 'mbr-parent', role: 'Director' });
    const child = makeMember({ id: 'mbr-child', parentId: 'mbr-parent' });

    mockPrisma.member.findUnique.mockResolvedValue(parent);
    mockPrisma.member.create.mockResolvedValue(child);

    await createMember({
      name: 'Bob',
      email: 'bob@acme.com',
      role: 'Engineer',
      orgId: 'org-1',
      parentId: 'mbr-parent',
    });

    expect(mockPrisma.member.findUnique).toHaveBeenCalledWith({
      where: { id: 'mbr-parent' },
    });
    expect(mockPrisma.member.create).toHaveBeenCalledOnce();
  });

  it('throws 404 when parent does not exist', async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);

    await expect(
      createMember({
        name: 'Bob',
        email: 'bob@acme.com',
        role: 'Engineer',
        orgId: 'org-1',
        parentId: 'nonexistent-parent',
      })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(mockPrisma.member.create).not.toHaveBeenCalled();
  });

  it('throws 404 when parent belongs to a different org', async () => {
    const parentInOtherOrg = makeMember({ id: 'mbr-parent', orgId: 'other-org' });
    mockPrisma.member.findUnique.mockResolvedValue(parentInOtherOrg);

    await expect(
      createMember({
        name: 'Bob',
        email: 'bob@acme.com',
        role: 'Engineer',
        orgId: 'org-1',
        parentId: 'mbr-parent',
      })
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(mockPrisma.member.create).not.toHaveBeenCalled();
  });
});

// ─── getMemberById ───────────────────────────────────────────────────────────

describe('getMemberById', () => {
  it('returns the member when found', async () => {
    const member = makeMember();
    mockPrisma.member.findUnique.mockResolvedValue(member);

    const result = await getMemberById('mbr-1');

    expect(mockPrisma.member.findUnique).toHaveBeenCalledWith({
      where: { id: 'mbr-1' },
    });
    expect(result.id).toBe('mbr-1');
  });

  it('throws a 404 error when member is not found', async () => {
    mockPrisma.member.findUnique.mockResolvedValue(null);

    await expect(getMemberById('no-such-member')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Member not found',
    });
  });
});

// ─── getSubtreeIds ────────────────────────────────────────────────────────────
// Pure function — no DB calls. Best unit test candidate.

describe('getSubtreeIds', () => {
  const tree: OrgTree = {
    id: 'ceo',
    name: 'CEO',
    email: 'ceo@acme.com',
    role: 'CEO',
    orgId: 'org-1',
    parentId: null,
    userId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    directReports: [
      {
        id: 'vp1',
        name: 'VP1',
        email: 'vp1@acme.com',
        role: 'VP',
        orgId: 'org-1',
        parentId: 'ceo',
        userId: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        directReports: [
          {
            id: 'mgr1',
            name: 'Mgr1',
            email: 'mgr1@acme.com',
            role: 'Manager',
            orgId: 'org-1',
            parentId: 'vp1',
            userId: null,
            createdAt: '2024-01-01T00:00:00.000Z',
            directReports: [],
          },
        ],
      },
      {
        id: 'vp2',
        name: 'VP2',
        email: 'vp2@acme.com',
        role: 'VP',
        orgId: 'org-1',
        parentId: 'ceo',
        userId: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        directReports: [],
      },
    ],
  };

  it('returns the subtree rooted at vp1 (vp1 + mgr1)', () => {
    const ids = getSubtreeIds(tree, 'vp1');
    expect(ids).toEqual(['vp1', 'mgr1']);
  });

  it('returns only the leaf node when there are no direct reports', () => {
    const ids = getSubtreeIds(tree, 'vp2');
    expect(ids).toEqual(['vp2']);
  });

  it('returns the full tree when root id is used', () => {
    const ids = getSubtreeIds(tree, 'ceo');
    expect(ids).toEqual(['ceo', 'vp1', 'mgr1', 'vp2']);
  });

  it('returns an empty array when the id does not exist in the tree', () => {
    const ids = getSubtreeIds(tree, 'nonexistent');
    expect(ids).toEqual([]);
  });

  it('returns a leaf node that is deep in the tree', () => {
    const ids = getSubtreeIds(tree, 'mgr1');
    expect(ids).toEqual(['mgr1']);
  });
});
