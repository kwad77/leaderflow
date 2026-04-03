import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as workItemService from '../services/workItem.service';
import * as orgService from '../services/org.service';
import { protect } from '../middleware/auth';

const router = Router();

const workItemTypeValues = ['INGRESS', 'DELEGATION', 'ESCALATION'] as const;
const workItemStatusValues = [
  'PENDING', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ON_TRACK',
  'AT_RISK', 'STALE', 'OVERDUE', 'COMPLETED', 'ARCHIVED'
] as const;
const priorityValues = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

/**
 * GET /api/items
 * Query params: type, status, toMemberId, fromMemberId
 */
router.get('/', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const items = await workItemService.listWorkItems({
      orgId: org.id,
      type: req.query.type as any,
      status: req.query.status as any,
      toMemberId: req.query.toMemberId as string | undefined,
      fromMemberId: req.query.fromMemberId as string | undefined,
    });
    res.json(items);
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
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(workItemTypeValues),
  priority: z.enum(priorityValues),
  toMemberId: z.string(),
  fromMemberId: z.string().optional(),
  fromExternal: z.string().optional(),
  dueAt: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
});

router.post('/', protect, async (req: Request, res: Response, next: NextFunction) => {
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

export default router;
