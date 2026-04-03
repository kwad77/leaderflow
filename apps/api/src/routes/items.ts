import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as workItemService from '../services/workItem.service';
import * as orgService from '../services/org.service';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../lib/prisma';
import { emitToOrg } from '../lib/socket';
import { createError } from '../middleware/errorHandler';

const router = Router();

const workItemTypeValues = ['INGRESS', 'DELEGATION', 'ESCALATION'] as const;
const workItemStatusValues = [
  'PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ON_TRACK',
  'AT_RISK', 'STALE', 'OVERDUE', 'COMPLETED', 'ARCHIVED'
] as const;
const priorityValues = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

/**
 * GET /api/items
 * Query params: type, status, toMemberId, fromMemberId, cursor, limit
 */
router.get('/', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const rawLimit = req.query.limit !== undefined ? parseInt(req.query.limit as string, 10) : undefined;
    const limit = rawLimit !== undefined && !isNaN(rawLimit) ? rawLimit : undefined;
    const result = await workItemService.listWorkItems({
      orgId: org.id,
      type: req.query.type as any,
      status: req.query.status as any,
      toMemberId: req.query.toMemberId as string | undefined,
      fromMemberId: req.query.fromMemberId as string | undefined,
      cursor: req.query.cursor as string | undefined,
      limit,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/items/:id
 */
router.get('/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await workItemService.getWorkItemById(req.params.id);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/items
 */
const createItemSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  type: z.enum(workItemTypeValues),
  priority: z.enum(priorityValues),
  toMemberId: z.string().min(1),
  fromMemberId: z.string().optional(),
  fromExternal: z.string().max(500).optional(),
  dueAt: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
});

router.post('/', protect, validate(createItemSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createItemSchema.parse(req.body);
    const org = await orgService.getFirstOrg();
    const item = await workItemService.createWorkItem(org.id, body);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/items/:id/delegate
 */
const delegateSchema = z.object({
  toMemberId: z.string(),
  note: z.string().optional(),
});

router.post('/:id/delegate', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = delegateSchema.parse(req.body);
    const org = await orgService.getFirstOrg();
    const item = await workItemService.delegateWorkItem(req.params.id, org.id, body);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/items/:id/acknowledge
 */
router.post('/:id/acknowledge', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const item = await workItemService.acknowledgeWorkItem(req.params.id, org.id);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/items/:id/complete
 */
const completeSchema = z.object({
  note: z.string().optional(),
});

router.post('/:id/complete', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = completeSchema.parse(req.body);
    const org = await orgService.getFirstOrg();
    const item = await workItemService.completeWorkItem(req.params.id, org.id, body.note);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/items/bulk
 */
const bulkActionSchema = z.object({
  itemIds: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['acknowledge', 'complete', 'archive', 'delegate']),
  toMemberId: z.string().optional(),
  note: z.string().optional(),
});

router.post('/bulk', protect, validate(bulkActionSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = bulkActionSchema.parse(req.body);
    const { itemIds, action, note } = body;

    if (itemIds.length > 100) {
      return next(createError('itemIds must contain at most 100 items', 400));
    }

    if (action === 'delegate' && !body.toMemberId) {
      return next(createError('toMemberId is required for delegate action', 400));
    }

    const org = await orgService.getFirstOrg();

    // Verify all items belong to the current org
    const existingItems = await prisma.workItem.findMany({
      where: { id: { in: itemIds }, orgId: org.id },
      select: { id: true },
    });

    const validIds = existingItems.map((item) => item.id);

    if (validIds.length === 0) {
      return next(createError('No valid items found in this organization', 404));
    }

    const defaultNote = note ?? `Bulk ${action} by leader`;

    switch (action) {
      case 'acknowledge':
        await prisma.workItem.updateMany({
          where: { id: { in: validIds } },
          data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
        });
        break;

      case 'complete':
        await prisma.workItem.updateMany({
          where: { id: { in: validIds } },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
        break;

      case 'archive':
        await prisma.workItem.updateMany({
          where: { id: { in: validIds } },
          data: { status: 'ARCHIVED' },
        });
        break;

      case 'delegate':
        await Promise.all(
          validIds.map((id) =>
            prisma.workItem.update({
              where: { id },
              data: { toMemberId: body.toMemberId!, status: 'PENDING' },
            })
          )
        );
        break;
    }

    // Create a WorkItemUpdate record for each updated item
    await prisma.workItemUpdate.createMany({
      data: validIds.map((id) => ({
        itemId: id,
        note: defaultNote,
        statusChange: action.toUpperCase(),
      })),
    });

    // Emit a single ORG_UPDATED event after all updates
    emitToOrg(org.id, {
      type: 'ORG_UPDATED',
      payload: { action, itemIds: validIds },
      timestamp: new Date().toISOString(),
    });

    return res.json({ updated: validIds.length, itemIds: validIds });
  } catch (err) {
    next(err);
  }
});

export default router;
