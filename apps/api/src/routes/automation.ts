import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { automationQueue } from '../jobs/queue';
import { protect } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import * as orgService from '../services/org.service';

const router = Router();

const createRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string().min(1),
  condition: z.record(z.unknown()),
  action: z.record(z.unknown()),
});

const updateRuleSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  condition: z.record(z.unknown()).optional(),
  action: z.record(z.unknown()).optional(),
});

/**
 * GET /api/automation/opportunities
 * Returns items where aiAutomatable=true and not terminal status
 */
router.get('/opportunities', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();

    const items = await prisma.workItem.findMany({
      where: {
        orgId: org.id,
        aiAutomatable: true,
        status: { notIn: ['COMPLETED', 'ARCHIVED'] },
      },
      include: {
        from: {
          select: { id: true, name: true, email: true, role: true, orgId: true, parentId: true, createdAt: true },
        },
        to: {
          select: { id: true, name: true, email: true, role: true, orgId: true, parentId: true, createdAt: true },
        },
        updates: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const serialized = items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      dueAt: item.dueAt?.toISOString() ?? null,
      acknowledgedAt: item.acknowledgedAt?.toISOString() ?? null,
      completedAt: item.completedAt?.toISOString() ?? null,
      from: item.from ? { ...item.from, createdAt: item.from.createdAt.toISOString() } : null,
      to: { ...item.to, createdAt: item.to.createdAt.toISOString() },
      updates: item.updates.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() })),
    }));

    res.json(serialized);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/automation/analyze
 * Trigger on-demand automation analysis
 */
router.post('/analyze', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await automationQueue.add('automation-detect', {}, { attempts: 1 });
    res.json({ ok: true, message: 'Analysis queued' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/automation/rules
 */
router.get('/rules', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const rules = await prisma.automationRule.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(rules.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      lastRunAt: r.lastRunAt?.toISOString() ?? null,
    })));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/automation/rules
 */
router.post('/rules', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const body = createRuleSchema.parse(req.body);

    const rule = await prisma.automationRule.create({
      data: {
        orgId: org.id,
        name: body.name,
        description: body.description,
        type: body.type,
        condition: body.condition as any,
        action: body.action as any,
      },
    });

    res.status(201).json({
      ...rule,
      createdAt: rule.createdAt.toISOString(),
      lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/automation/rules/:id
 */
router.patch('/rules/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const existing = await prisma.automationRule.findUnique({ where: { id: req.params.id } });

    if (!existing || existing.orgId !== org.id) {
      throw createError('Automation rule not found', 404);
    }

    const body = updateRuleSchema.parse(req.body);

    const updated = await prisma.automationRule.update({
      where: { id: req.params.id },
      data: {
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.condition !== undefined && { condition: body.condition as any }),
        ...(body.action !== undefined && { action: body.action as any }),
      },
    });

    res.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      lastRunAt: updated.lastRunAt?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/automation/rules/:id
 */
router.delete('/rules/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const existing = await prisma.automationRule.findUnique({ where: { id: req.params.id } });

    if (!existing || existing.orgId !== org.id) {
      throw createError('Automation rule not found', 404);
    }

    await prisma.automationRule.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
