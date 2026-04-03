import { describe, it, expect, vi } from 'vitest';
import { prisma } from '../../lib/prisma';
import {
  getOrCreateOrgForDomain,
  syncDirectoryToOrg,
} from '../../services/directory.service';
import type { DirectoryProvider } from '../../lib/directory/provider';

const mockProvider: DirectoryProvider = {
  name: 'test',
  getUsers: vi.fn(),
  getCurrentUser: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  getOIDCConfig: vi.fn(),
};

describe('getOrCreateOrgForDomain', () => {
  it('creates a new org when none exists for the domain', async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.organization.create).mockResolvedValueOnce({
      id: 'new-org-id',
      name: 'example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const id = await getOrCreateOrgForDomain('example.com');

    expect(prisma.organization.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: 'example.com' } })
    );
    expect(prisma.organization.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'example.com' } })
    );
    expect(id).toBe('new-org-id');
  });

  it('returns existing org id and does not call create when org already exists', async () => {
    vi.mocked(prisma.organization.findFirst).mockResolvedValueOnce({
      id: 'existing-org-id',
    } as any);

    const id = await getOrCreateOrgForDomain('existing.com');

    expect(id).toBe('existing-org-id');
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });
});

describe('syncDirectoryToOrg', () => {
  it('creates new members and sets parentId in pass 2 for a 1 root + 2 reports hierarchy', async () => {
    const users = [
      { externalId: 'ext-1', email: 'root@acme.com', name: 'Root User', title: 'CEO', managerId: null },
      { externalId: 'ext-2', email: 'report1@acme.com', name: 'Report One', title: 'VP', managerId: 'ext-1' },
      { externalId: 'ext-3', email: 'report2@acme.com', name: 'Report Two', title: 'VP', managerId: 'ext-1' },
    ];

    vi.mocked(mockProvider.getUsers).mockResolvedValueOnce(users);

    // All three are new — findFirst returns null for each
    vi.mocked(prisma.member.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    // create returns distinct member ids
    vi.mocked(prisma.member.create)
      .mockResolvedValueOnce({ id: 'db-1' } as any)
      .mockResolvedValueOnce({ id: 'db-2' } as any)
      .mockResolvedValueOnce({ id: 'db-3' } as any);

    vi.mocked(prisma.member.update).mockResolvedValue({} as any);

    const result = await syncDirectoryToOrg(mockProvider, 'token-abc', 'org-1');

    // Pass 1: findFirst called once per user
    expect(prisma.member.findFirst).toHaveBeenCalledTimes(3);
    // Pass 1: create called for all 3 new members
    expect(prisma.member.create).toHaveBeenCalledTimes(3);
    // Pass 2: update called twice (for the two reports that have a managerId)
    expect(prisma.member.update).toHaveBeenCalledTimes(2);
    expect(prisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { parentId: 'db-1' } })
    );

    expect(result).toEqual({ created: 3, updated: 0, skipped: 0 });
  });

  it('increments updated counter and skips parentId linking for existing members', async () => {
    const users = [
      { externalId: 'ext-1', email: 'ceo@corp.com', name: 'The CEO', title: 'CEO', managerId: null },
    ];

    vi.mocked(mockProvider.getUsers).mockResolvedValueOnce(users);
    vi.mocked(prisma.member.findFirst).mockResolvedValueOnce({ id: 'existing-db-1' } as any);
    vi.mocked(prisma.member.update).mockResolvedValue({} as any);

    const result = await syncDirectoryToOrg(mockProvider, 'token-abc', 'org-1');

    expect(prisma.member.create).not.toHaveBeenCalled();
    // Only the pass-1 update for name/role — no pass-2 update since no managerId
    expect(prisma.member.update).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
  });

  it('skips gracefully when a user has an invalid managerId not present in the batch', async () => {
    const users = [
      { externalId: 'ext-orphan', email: 'orphan@corp.com', name: 'Orphan', title: 'IC', managerId: 'ext-ghost' },
    ];

    vi.mocked(mockProvider.getUsers).mockResolvedValueOnce(users);
    vi.mocked(prisma.member.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.member.create).mockResolvedValueOnce({ id: 'db-orphan' } as any);

    // Should not throw
    const result = await syncDirectoryToOrg(mockProvider, 'token-abc', 'org-1');

    // Pass 2 skips the orphan because ext-ghost is not in the map — no update called
    expect(prisma.member.update).not.toHaveBeenCalled();
    expect(result).toEqual({ created: 1, updated: 0, skipped: 0 });
  });

  it('returns early with zeros when getUsers throws', async () => {
    vi.mocked(mockProvider.getUsers).mockRejectedValueOnce(new Error('network error'));

    const result = await syncDirectoryToOrg(mockProvider, 'bad-token', 'org-1');

    expect(result).toEqual({ created: 0, updated: 0, skipped: 0 });
    expect(prisma.member.findFirst).not.toHaveBeenCalled();
  });
});
