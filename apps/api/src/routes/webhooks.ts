import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as workItemService from '../services/workItem.service';
import * as orgService from '../services/org.service';
import * as integrationService from '../services/integration.service';
import { createError } from '../middleware/errorHandler';
import { verifySlackSignature, verifyEmailSignature } from '../middleware/webhookVerify';
import { prisma } from '../lib/prisma';
import { deliverWebhook } from '../lib/webhook';

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

/**
 * GET /api/webhooks/deliveries/stats
 * Returns aggregate delivery statistics for the org.
 * Must be declared before /deliveries/:id/retry so Express matches it first.
 */
router.get('/deliveries/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, successful, failed, last24hTotal, last24hSuccessful, last24hFailed] =
      await Promise.all([
        prisma.webhookDelivery.count({ where: { orgId: org.id } }),
        prisma.webhookDelivery.count({ where: { orgId: org.id, success: true } }),
        prisma.webhookDelivery.count({ where: { orgId: org.id, success: false } }),
        prisma.webhookDelivery.count({ where: { orgId: org.id, createdAt: { gte: since24h } } }),
        prisma.webhookDelivery.count({
          where: { orgId: org.id, success: true, createdAt: { gte: since24h } },
        }),
        prisma.webhookDelivery.count({
          where: { orgId: org.id, success: false, createdAt: { gte: since24h } },
        }),
      ]);

    res.json({
      total,
      successful,
      failed,
      last24h: { total: last24hTotal, successful: last24hSuccessful, failed: last24hFailed },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/webhooks/deliveries
 * Returns paginated delivery log for the org.
 * Query params: limit, cursor, event, success
 */
router.get('/deliveries', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const cursor = req.query.cursor as string | undefined;
    const eventFilter = req.query.event as string | undefined;
    const successFilter =
      req.query.success === 'true'
        ? true
        : req.query.success === 'false'
        ? false
        : undefined;

    const where: Record<string, unknown> = { orgId: org.id };
    if (eventFilter) where.event = eventFilter;
    if (successFilter !== undefined) where.success = successFilter;

    const deliveries = await prisma.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = deliveries.length > limit;
    const items = hasMore ? deliveries.slice(0, limit) : deliveries;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    res.json({ items, nextCursor, hasMore });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/webhooks/deliveries/:id/retry
 * Re-delivers a previously failed (or any) webhook delivery.
 * Creates a new WebhookDelivery record with attempts incremented.
 */
router.post(
  '/deliveries/:id/retry',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const original = await prisma.webhookDelivery.findUnique({
        where: { id: req.params.id },
      });

      if (!original) {
        throw createError(`Delivery not found: ${req.params.id}`, 404);
      }

      const targetUrl = original.targetUrl;
      const payload = original.payload as Record<string, unknown>;
      const event = original.event;

      // Look up the integration config to get the secret (if any)
      const integrations = await prisma.integration.findMany({
        where: { orgId: original.orgId, type: 'webhook', enabled: true },
      });
      const matchingIntegration = integrations.find((i) => {
        const c = i.config as any;
        return c.url === targetUrl;
      });
      const secret = (matchingIntegration?.config as any)?.secret ?? '';

      const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
      const { createHmac } = await import('crypto');
      const signature = secret
        ? 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
        : '';

      let statusCode: number | undefined;
      let success = false;
      let error: string | undefined;
      let deliveredAt: Date | undefined;

      try {
        const res2 = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-LeaderFlow-Event': event,
            ...(signature ? { 'X-LeaderFlow-Signature': signature } : {}),
          },
          signal: AbortSignal.timeout(10000),
        });
        statusCode = res2.status;
        success = res2.ok;
        if (res2.ok) deliveredAt = new Date();
        else error = `HTTP ${res2.status}`;
      } catch (err2) {
        error = err2 instanceof Error ? err2.message : 'Unknown error';
      }

      const newDelivery = await prisma.webhookDelivery.create({
        data: {
          orgId: original.orgId,
          event,
          payload,
          targetUrl,
          statusCode,
          success,
          error,
          attempts: original.attempts + 1,
          deliveredAt,
        },
      });

      res.json(newDelivery);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
