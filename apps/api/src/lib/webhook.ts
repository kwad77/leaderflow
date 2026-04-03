import { createHmac } from 'crypto';
import { prisma } from './prisma';
import { logger } from './logger';

export async function deliverWebhook(
  orgId: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    // Find all enabled webhook integrations for this org
    // (stored in Integration table with type='webhook' and config.url)
    const integrations = await prisma.integration.findMany({
      where: { orgId, type: 'webhook', enabled: true },
    });

    for (const integration of integrations) {
      const config = integration.config as any;
      const targetUrl = config.url as string;
      if (!targetUrl) continue;

      const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
      let statusCode: number | undefined;
      let success = false;
      let error: string | undefined;
      let deliveredAt: Date | undefined;

      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-LeaderFlow-Event': event,
            'X-LeaderFlow-Signature': computeHmac(body, config.secret ?? ''),
          },
          signal: AbortSignal.timeout(10000), // 10s timeout
        });
        statusCode = res.status;
        success = res.ok;
        if (res.ok) deliveredAt = new Date();
        else error = `HTTP ${res.status}`;
      } catch (err) {
        error = err instanceof Error ? err.message : 'Unknown error';
      }

      // Log delivery
      await prisma.webhookDelivery
        .create({
          data: { orgId, event, payload, targetUrl, statusCode, success, error, deliveredAt },
        })
        .catch((e) => logger.error({ err: e }, 'Failed to log webhook delivery'));

      if (!success) {
        logger.warn({ event, targetUrl, statusCode, error }, '[webhook] Delivery failed');
      }
    }
  } catch (err) {
    logger.error({ err }, '[webhook] Unexpected error in deliverWebhook');
  }
}

function computeHmac(body: string, secret: string): string {
  if (!secret) return '';
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}
