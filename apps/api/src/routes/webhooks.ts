import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as workItemService from '../services/workItem.service';
import * as orgService from '../services/org.service';
import * as integrationService from '../services/integration.service';
import { createError } from '../middleware/errorHandler';
import { verifySlackSignature, verifyEmailSignature } from '../middleware/webhookVerify';

const router = Router();

// Webhook handlers receive inbound payloads from external systems
// and convert them into LeaderFlow work items.

const slackWebhookSchema = z.object({
  type: z.string(),
  event: z.object({
    type: z.string(),
    text: z.string().optional(),
    user: z.string().optional(),
    channel: z.string().optional(),
    ts: z.string().optional(),
  }).optional(),
  challenge: z.string().optional(),
});

/**
 * POST /api/webhooks/slack
 * Handle Slack event subscriptions
 */
router.post('/slack', verifySlackSignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = slackWebhookSchema.parse(req.body);

    // Respond to Slack URL verification challenge
    if (body.type === 'url_verification' && body.challenge) {
      res.json({ challenge: body.challenge });
      return;
    }

    if (body.type === 'event_callback' && body.event) {
      // Check if a Slack integration instance is active — if so, let Bolt handle it
      const org = await orgService.getFirstOrg();
      const integrations = await (await import('../lib/prisma')).prisma.integration.findMany({
        where: { orgId: org.id, type: 'slack', enabled: true },
      });

      const hasActiveInstance = integrations.some(
        (i) => integrationService.getInstance(i.id) !== null
      );

      if (!hasActiveInstance) {
        // Fallback: process event inline when no Bolt instance is running
        const members = await orgService.listMembers(org.id);
        const leader = members.find((m) => m.parentId === null) ?? members[0];

        if (body.event.text && leader) {
          await workItemService.createWorkItem(org.id, {
            title: body.event.text.slice(0, 100),
            description: `Slack message from channel ${body.event.channel ?? 'unknown'}`,
            type: 'INGRESS',
            priority: 'MEDIUM',
            toMemberId: leader.id,
            fromExternal: `slack:${body.event.user ?? 'unknown'}`,
          });
        }
      }
      // If hasActiveInstance, Bolt's own event handling takes care of it
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const emailWebhookSchema = z.object({
  from: z.string(),
  to: z.string(),
  subject: z.string(),
  body: z.string().optional(),
  messageId: z.string().optional(),
});

/**
 * POST /api/webhooks/email
 * Handle inbound email webhooks (e.g. from SendGrid or Postmark)
 */
router.post('/email', verifyEmailSignature, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = emailWebhookSchema.parse(req.body);
    const org = await orgService.getFirstOrg();
    const members = await orgService.listMembers(org.id);

    // Try to find recipient member by email
    const recipient = members.find(
      (m) => m.email.toLowerCase() === body.to.toLowerCase()
    );

    if (!recipient) {
      throw createError(`No member found for email: ${body.to}`, 404);
    }

    await workItemService.createWorkItem(org.id, {
      title: body.subject,
      description: body.body,
      type: 'INGRESS',
      priority: 'MEDIUM',
      toMemberId: recipient.id,
      fromExternal: body.from,
      tags: ['email'],
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/webhooks/github
 * Handle GitHub webhook events (PRs, issues as ingress items)
 */
router.post('/github', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const event = req.headers['x-github-event'] as string;
    const payload = req.body;

    if (!['pull_request', 'issues'].includes(event)) {
      res.status(200).json({ ok: true, skipped: true });
      return;
    }

    const action = payload.action;
    if (!['opened', 'reopened'].includes(action)) {
      res.status(200).json({ ok: true, skipped: true });
      return;
    }

    const org = await orgService.getFirstOrg();
    const members = await orgService.listMembers(org.id);
    const ceo = members[0];

    if (ceo) {
      const item = event === 'pull_request' ? payload.pull_request : payload.issue;
      await workItemService.createWorkItem(org.id, {
        title: `[GitHub] ${item.title}`,
        description: item.body?.slice(0, 500) ?? '',
        type: 'INGRESS',
        priority: 'MEDIUM',
        toMemberId: ceo.id,
        fromExternal: `github:${payload.sender?.login ?? 'unknown'}`,
        source: 'github',
        sourceRef: item.html_url,
        tags: ['github', event],
      } as any);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
