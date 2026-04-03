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
