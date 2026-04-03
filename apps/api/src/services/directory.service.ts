import { prisma } from '../lib/prisma';
import type { DirectoryProvider } from '../lib/directory';

export async function getOrCreateOrgForDomain(domain: string): Promise<string> {
  const existing = await prisma.organization.findFirst({
    where: { name: domain },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.organization.create({
    data: { name: domain },
    select: { id: true },
  });
  return created.id;
}

export async function syncDirectoryToOrg(
  provider: DirectoryProvider,
  accessToken: string,
  orgId: string
): Promise<{ created: number; updated: number; skipped: number }> {
  let users;
  try {
    users = await provider.getUsers(accessToken);
  } catch (err) {
    console.error('[directory.service] getUsers error:', err);
    return { created: 0, updated: 0, skipped: 0 };
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // externalId → member DB id, for manager linking in pass 2
  const externalIdToMemberId = new Map<string, string>();

  // Pass 1: upsert all members without parentId
  for (const u of users) {
    try {
      const existing = await prisma.member.findFirst({
        where: { email: u.email, orgId },
        select: { id: true },
      });

      if (existing) {
        await prisma.member.update({
          where: { id: existing.id },
          data: {
            name: u.name,
            role: u.title || 'Member',
          },
        });
        externalIdToMemberId.set(u.externalId, existing.id);
        updated++;
      } else {
        const member = await prisma.member.create({
          data: {
            name: u.name,
            email: u.email,
            role: u.title || 'Member',
            orgId,
          },
          select: { id: true },
        });
        externalIdToMemberId.set(u.externalId, member.id);
        created++;
      }
    } catch (err) {
      console.error(`[directory.service] upsert error for ${u.email}:`, err);
      skipped++;
    }
  }

  // Pass 2: set parentId for users that have a managerId
  for (const u of users) {
    if (!u.managerId) continue;
    const memberId = externalIdToMemberId.get(u.externalId);
    const managerMemberId = externalIdToMemberId.get(u.managerId);
    if (!memberId || !managerMemberId) continue;

    try {
      await prisma.member.update({
        where: { id: memberId },
        data: { parentId: managerMemberId },
      });
    } catch (err) {
      console.error(
        `[directory.service] parentId update error for ${u.email}:`,
        err
      );
    }
  }

  return { created, updated, skipped };
}
