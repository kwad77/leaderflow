import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function verifySlackSignature(req: Request, res: Response, next: NextFunction): void {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  // Skip verification if no secret configured (dev mode)
  if (!signingSecret) {
    next();
    return;
  }

  const slackSignature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;

  if (!slackSignature || !timestamp) {
    res.status(401).json({ error: 'Missing Slack signature headers' });
    return;
  }

  // Replay attack prevention: reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    res.status(401).json({ error: 'Request timestamp too old' });
    return;
  }

  const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(JSON.stringify(req.body));
  const sigBase = `v0:${timestamp}:${rawBody.toString()}`;
  const computed =
    'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBase).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(slackSignature))) {
    res.status(401).json({ error: 'Invalid Slack signature' });
    return;
  }

  next();
}

export function verifyEmailSignature(req: Request, res: Response, next: NextFunction): void {
  // SendGrid uses a different signature scheme; Postmark uses a webhook token
  // For now: check a shared secret header if configured
  const expectedToken = process.env.EMAIL_WEBHOOK_TOKEN;

  if (!expectedToken) {
    next();
    return;
  }

  const providedToken = req.headers['x-webhook-token'] as string;
  if (!providedToken || providedToken !== expectedToken) {
    res.status(401).json({ error: 'Invalid webhook token' });
    return;
  }

  next();
}
