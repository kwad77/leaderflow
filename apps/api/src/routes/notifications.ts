import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { protect } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import * as orgService from '../services/org.service';

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationPreferences {
  emailDigest: 'none' | 'daily' | 'weekly';
  emailDigestTime: string;
  notifyOn: {
    newAssignment: boolean;
    escalation: boolean;
    overdue: boolean;
    atRisk: boolean;
    aiSuggestion: boolean;
  };
  slackDm: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  emailDigest: 'daily',
  emailDigestTime: '08:00',
  notifyOn: {
    newAssignment: true,
    escalation: true,
    overdue: true,
    atRisk: true,
    aiSuggestion: false,
  },
  slackDm: false,
};

function getPrefs(metadata: unknown): NotificationPreferences {
  const notifications = (metadata as any)?.notifications;
  if (!notifications) return DEFAULT_PREFS;
  return {
    emailDigest: notifications.emailDigest ?? DEFAULT_PREFS.emailDigest,
    emailDigestTime: notifications.emailDigestTime ?? DEFAULT_PREFS.emailDigestTime,
    notifyOn: {
      newAssignment: notifications.notifyOn?.newAssignment ?? DEFAULT_PREFS.notifyOn.newAssignment,
      escalation: notifications.notifyOn?.escalation ?? DEFAULT_PREFS.notifyOn.escalation,
      overdue: notifications.notifyOn?.overdue ?? DEFAULT_PREFS.notifyOn.overdue,
      atRisk: notifications.notifyOn?.atRisk ?? DEFAULT_PREFS.notifyOn.atRisk,
      aiSuggestion: notifications.notifyOn?.aiSuggestion ?? DEFAULT_PREFS.notifyOn.aiSuggestion,
    },
    slackDm: notifications.slackDm ?? DEFAULT_PREFS.slackDm,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────

const updatePrefsSchema = z.object({
  emailDigest: z.enum(['none', 'daily', 'weekly']).optional(),
  emailDigestTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'emailDigestTime must match HH:MM')
    .optional(),
  notifyOn: z
    .object({
      newAssignment: z.boolean().optional(),
      escalation: z.boolean().optional(),
      overdue: z.boolean().optional(),
      atRisk: z.boolean().optional(),
      aiSuggestion: z.boolean().optional(),
    })
    .optional(),
  slackDm: z.boolean().optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/notifications/preferences
 * Returns all members with their digest setting (org-level summary).
 */
router.get('/preferences', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const members = await prisma.member.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'asc' },
    });

    const result = members.map((m) => {
      const prefs = getPrefs(m.metadata);
      return {
        id: m.id,
        name: m.name,
        emailDigest: prefs.emailDigest,
        slackDm: prefs.slackDm,
      };
    });

    res.json({ members: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notifications/preferences/:memberId
 * Returns the member's notification preferences (or defaults if not set).
 */
router.get('/preferences/:memberId', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const member = await prisma.member.findUnique({ where: { id: req.params.memberId } });

    if (!member || member.orgId !== org.id) {
      throw createError('Member not found', 404);
    }

    res.json(getPrefs(member.metadata));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/notifications/preferences/:memberId
 * Updates preferences (partial merge with existing).
 */
router.put(
  '/preferences/:memberId',
  protect,
  validate(updatePrefsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const org = await orgService.getFirstOrg();
      const member = await prisma.member.findUnique({ where: { id: req.params.memberId } });

      if (!member || member.orgId !== org.id) {
        throw createError('Member not found', 404);
      }

      const existing = getPrefs(member.metadata);
      const body = updatePrefsSchema.parse(req.body);

      const merged: NotificationPreferences = {
        emailDigest: body.emailDigest ?? existing.emailDigest,
        emailDigestTime: body.emailDigestTime ?? existing.emailDigestTime,
        notifyOn: {
          newAssignment: body.notifyOn?.newAssignment ?? existing.notifyOn.newAssignment,
          escalation: body.notifyOn?.escalation ?? existing.notifyOn.escalation,
          overdue: body.notifyOn?.overdue ?? existing.notifyOn.overdue,
          atRisk: body.notifyOn?.atRisk ?? existing.notifyOn.atRisk,
          aiSuggestion: body.notifyOn?.aiSuggestion ?? existing.notifyOn.aiSuggestion,
        },
        slackDm: body.slackDm ?? existing.slackDm,
      };

      const existingMetadata = (member.metadata as Record<string, unknown>) ?? {};
      const newMetadata = { ...existingMetadata, notifications: merged };

      await prisma.member.update({
        where: { id: member.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { metadata: newMetadata as any },
      });

      res.json(merged);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
