import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as orgService from '../services/org.service';
import { protect } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { emitToOrg } from '../lib/socket';
import { validate } from '../middleware/validate';

const router = Router();

/**
 * GET /api/org
 * Returns the full org tree for the first (demo) org.
 * In a multi-tenant setup, orgId would come from the auth token.
 */
router.get('/', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const tree = await orgService.getOrgTree(org.id);
    res.json({ org: { id: org.id, name: org.name }, tree });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/org/members
 * Returns flat list of all members.
 */
router.get('/members', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const members = await orgService.listMembers(org.id);
    res.json(
      members.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      }))
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/org/members
 * Add a new member to the org.
 */
const createMemberSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().max(320),
  role: z.string().min(1).max(255),
  parentId: z.string().max(36).optional(),
  userId: z.string().max(36).optional(),
});

router.post('/members', protect, validate(createMemberSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createMemberSchema.parse(req.body);
    const org = await orgService.getFirstOrg();
    const member = await orgService.createMember({ ...body, orgId: org.id });
    res.status(201).json({ ...member, createdAt: member.createdAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/org/members/:id
 */
router.get('/members/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await orgService.getMemberById(req.params.id);
    res.json({ ...member, createdAt: member.createdAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

const updateMemberSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().max(320).optional(),
  role: z.string().min(1).max(255).optional(),
  parentId: z.string().max(36).nullable().optional(),
});

/**
 * PUT /api/org/members/:id
 */
router.put('/members/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateMemberSchema.parse(req.body);
    const org = await orgService.getFirstOrg();

    const existing = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.orgId !== org.id) {
      throw createError('Member not found', 404);
    }

    const updated = await prisma.member.update({
      where: { id: req.params.id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.role !== undefined && { role: body.role }),
        ...(body.parentId !== undefined && { parentId: body.parentId }),
      },
    });

    // Emit ORG_UPDATED with the full tree
    const updatedTree = await orgService.getOrgTree(org.id);
    emitToOrg(org.id, {
      type: 'ORG_UPDATED',
      payload: updatedTree,
      timestamp: new Date().toISOString(),
    });

    res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/org/members/:id
 */
router.delete('/members/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();

    const existing = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.orgId !== org.id) {
      throw createError('Member not found', 404);
    }

    // Prevent deletion if member has active work items
    const activeItemCount = await prisma.workItem.count({
      where: {
        toMemberId: req.params.id,
        status: { notIn: ['COMPLETED', 'ARCHIVED'] },
      },
    });
    if (activeItemCount > 0) {
      throw createError(
        `Cannot delete member: ${activeItemCount} active work item(s) assigned`,
        409
      );
    }

    await prisma.member.delete({ where: { id: req.params.id } });

    // Emit ORG_UPDATED with the full tree
    const updatedTree = await orgService.getOrgTree(org.id);
    emitToOrg(org.id, {
      type: 'ORG_UPDATED',
      payload: updatedTree,
      timestamp: new Date().toISOString(),
    });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/org/members/:id/stats
 * Returns workload statistics for a member over the last 30 days.
 */
router.get('/members/:id/stats', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memberId = req.params.id;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Verify member exists
    const member = await prisma.member.findUnique({ where: { id: memberId } });
    if (!member) {
      throw createError('Member not found', 404);
    }

    // activeCount: items assigned to member, not completed/archived
    const activeCount = await prisma.workItem.count({
      where: {
        toMemberId: memberId,
        status: { notIn: ['COMPLETED', 'ARCHIVED'] },
      },
    });

    // overdueCount: items assigned to member with OVERDUE status
    const overdueCount = await prisma.workItem.count({
      where: {
        toMemberId: memberId,
        status: 'OVERDUE',
      },
    });

    // completedLast30d + avgCompletionHours
    const completedItems = await prisma.workItem.findMany({
      where: {
        toMemberId: memberId,
        status: 'COMPLETED',
        completedAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true, completedAt: true },
    });

    const completedLast30d = completedItems.length;
    let avgCompletionHours = 0;
    if (completedLast30d > 0) {
      const totalHours = completedItems.reduce((sum, item) => {
        const completed = item.completedAt ? item.completedAt.getTime() : Date.now();
        const diffHours = (completed - item.createdAt.getTime()) / (1000 * 60 * 60);
        return sum + diffHours;
      }, 0);
      avgCompletionHours = Math.round((totalHours / completedLast30d) * 10) / 10;
    }

    // delegatedOut: items where fromMemberId = id AND type = DELEGATION (last 30d)
    const delegatedOut = await prisma.workItem.count({
      where: {
        fromMemberId: memberId,
        type: 'DELEGATION',
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // escalatedUp: items where fromMemberId = id AND type = ESCALATION (last 30d)
    const escalatedUp = await prisma.workItem.count({
      where: {
        fromMemberId: memberId,
        type: 'ESCALATION',
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // receivedFromCount + topSources: items assigned to member (last 30d), group by fromMemberId
    const receivedItems = await prisma.workItem.findMany({
      where: {
        toMemberId: memberId,
        createdAt: { gte: thirtyDaysAgo },
        fromMemberId: { not: null },
      },
      select: { fromMemberId: true },
    });

    // Build source counts
    const sourceCounts = new Map<string, number>();
    for (const item of receivedItems) {
      if (item.fromMemberId) {
        sourceCounts.set(item.fromMemberId, (sourceCounts.get(item.fromMemberId) ?? 0) + 1);
      }
    }
    const receivedFromCount = sourceCounts.size;

    // Top 3 sources by count
    const topSourceIds = [...sourceCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, count]) => ({ id, count }));

    const topSourceMembers = topSourceIds.length > 0
      ? await prisma.member.findMany({
          where: { id: { in: topSourceIds.map((s) => s.id) } },
          select: { id: true, name: true },
        })
      : [];

    const topSources = topSourceIds.map(({ id, count }) => {
      const m = topSourceMembers.find((mem) => mem.id === id);
      return { memberId: id, name: m?.name ?? 'Unknown', count };
    });

    // loadScore: min(100, (activeCount * 10) + (overdueCount * 20))
    const loadScore = Math.min(100, activeCount * 10 + overdueCount * 20);

    res.json({
      memberId,
      activeCount,
      overdueCount,
      completedLast30d,
      avgCompletionHours,
      delegatedOut,
      escalatedUp,
      receivedFromCount,
      topSources,
      loadScore,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/org/load-balance
 * Returns all members with load scores and rebalancing suggestions.
 */
router.get('/load-balance', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const allMembers = await orgService.listMembers(org.id);

    // Compute activeCount and loadScore for each member
    const memberStats = await Promise.all(
      allMembers.map(async (m) => {
        const activeCount = await prisma.workItem.count({
          where: {
            toMemberId: m.id,
            status: { notIn: ['COMPLETED', 'ARCHIVED'] },
          },
        });
        const overdueCount = await prisma.workItem.count({
          where: {
            toMemberId: m.id,
            status: 'OVERDUE',
          },
        });
        const loadScore = Math.min(100, activeCount * 10 + overdueCount * 20);
        return { memberId: m.id, name: m.name, activeCount, loadScore };
      })
    );

    // Generate suggestions: overloaded (> 70) paired with low-load peers (< 30)
    const overloaded = memberStats.filter((m) => m.loadScore > 70);
    const underloaded = memberStats.filter((m) => m.loadScore < 30);

    const suggestions: Array<{
      message: string;
      overloadedMemberId: string;
      targetMemberId: string;
    }> = [];

    for (const heavy of overloaded) {
      if (suggestions.length >= 3) break;
      const target = underloaded.find(
        (u) => u.memberId !== heavy.memberId
      );
      if (!target) continue;

      const excess = heavy.activeCount - Math.round(heavy.activeCount / 2);
      const delegateSuggest = Math.min(Math.max(2, excess), 3);
      suggestions.push({
        message: `${heavy.name} has ${heavy.activeCount} active items (score: ${heavy.loadScore}). Consider delegating ${delegateSuggest}–${delegateSuggest + 1} to ${target.name} (score: ${target.loadScore}).`,
        overloadedMemberId: heavy.memberId,
        targetMemberId: target.memberId,
      });
    }

    res.json({ members: memberStats, suggestions });
  } catch (err) {
    next(err);
  }
});

// ─── Default org settings ────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  staleThresholdHours: 48,
  atRiskHoursBeforeDue: 24,
  slaByPriority: {
    LOW: 168,
    MEDIUM: 72,
    HIGH: 24,
    URGENT: 4,
  },
};

/**
 * GET /api/org/settings
 * Returns org settings JSON (or defaults if null).
 */
router.get('/settings', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const full = await prisma.organization.findUnique({ where: { id: org.id } });
    const settings = { ...DEFAULT_SETTINGS, ...(full?.settings as object | null ?? {}) };
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/org/settings
 * Validates and merges settings, then saves.
 */
const updateSettingsSchema = z.object({
  staleThresholdHours: z.number().int().min(1).max(720).optional(),
  atRiskHoursBeforeDue: z.number().int().min(1).max(168).optional(),
  slaByPriority: z.object({
    LOW: z.number().int().min(1),
    MEDIUM: z.number().int().min(1),
    HIGH: z.number().int().min(1),
    URGENT: z.number().int().min(1),
  }).optional(),
});

router.put('/settings', protect, validate(updateSettingsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateSettingsSchema.parse(req.body);
    const org = await orgService.getFirstOrg();
    const full = await prisma.organization.findUnique({ where: { id: org.id } });
    const existing = { ...DEFAULT_SETTINGS, ...(full?.settings as object | null ?? {}) };
    const merged = { ...existing, ...body };
    await prisma.organization.update({
      where: { id: org.id },
      data: { settings: merged },
    });
    res.json(merged);
  } catch (err) {
    next(err);
  }
});

export default router;
