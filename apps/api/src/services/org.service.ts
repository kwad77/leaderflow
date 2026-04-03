import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import type { OrgTree } from '@leaderflow/shared';
import { Member } from '@prisma/client';

export function getSubtreeIds(tree: OrgTree, rootMemberId: string): string[] {
  function collect(node: OrgTree): string[] {
    if (node.id === rootMemberId) {
      return getAllIds(node);
    }
    for (const child of node.directReports) {
      const found = collect(child);
      if (found.length > 0) return found;
    }
    return [];
  }
  function getAllIds(node: OrgTree): string[] {
    return [node.id, ...node.directReports.flatMap(getAllIds)];
  }
  return collect(tree);
}

type MemberWithReports = Member & {
  directReports: MemberWithReports[];
};

/**
 * Recursively build the org tree from flat member records.
 */
function buildTree(member: MemberWithReports): OrgTree {
  return {
    id: member.id,
    userId: member.userId ?? null,
    name: member.name,
    email: member.email,
    role: member.role,
    orgId: member.orgId,
    parentId: member.parentId ?? null,
    createdAt: member.createdAt.toISOString(),
    directReports: member.directReports.map(buildTree),
  };
}

export async function getOrgTree(orgId: string): Promise<OrgTree> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });

  if (!org) {
    throw createError('Organization not found', 404);
  }

  // Fetch all members with recursive directReports
  const rootMember = await prisma.member.findFirst({
    where: {
      orgId,
      parentId: null,
    },
    include: buildInclude(6), // support up to 6 levels deep
  });

  if (!rootMember) {
    throw createError('No root member found for organization', 404);
  }

  return buildTree(rootMember as MemberWithReports);
}

// Build nested include for up to N levels
function buildInclude(depth: number): object {
  if (depth === 0) return {};
  return {
    directReports: {
      include: buildInclude(depth - 1),
    },
  };
}

export async function getOrgById(orgId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      _count: {
        select: {
          members: true,
          workItems: true,
        },
      },
    },
  });

  if (!org) {
    throw createError('Organization not found', 404);
  }

  return org;
}

export async function getFirstOrg() {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (!org) {
    throw createError('No organization found. Run db:seed first.', 404);
  }

  return org;
}

export async function createMember(data: {
  name: string;
  email: string;
  role: string;
  orgId: string;
  parentId?: string;
  userId?: string;
}) {
  if (data.parentId) {
    const parent = await prisma.member.findUnique({ where: { id: data.parentId } });
    if (!parent || parent.orgId !== data.orgId) {
      throw createError('Parent member not found in this organization', 404);
    }
  }

  return prisma.member.create({ data });
}

export async function getMemberById(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
  });

  if (!member) {
    throw createError('Member not found', 404);
  }

  return member;
}

export async function listMembers(orgId: string) {
  return prisma.member.findMany({
    where: { orgId },
    orderBy: { createdAt: 'asc' },
  });
}
