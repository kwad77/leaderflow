import { google, gmail_v1 } from 'googleapis';
import type { WorkItem } from '@leaderflow/shared';
import { BaseIntegration, type InboundEvent, type IntegrationConfig } from './types';
import { integrationRegistry } from './registry';

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildQuery(settings: Record<string, string | boolean | number | string[]>): string {
  const parts = ['is:unread'];
  if (settings.filterSender) {
    parts.push(`from:${settings.filterSender}`);
  }
  if (settings.filterSubject) {
    parts.push(`subject:${settings.filterSubject}`);
  }
  return parts.join(' ');
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return '';

  // Check parts recursively
  if (payload.parts && payload.parts.length > 0) {
    // Prefer text/plain
    const plain = payload.parts.find((p) => p.mimeType === 'text/plain');
    if (plain?.body?.data) {
      return Buffer.from(plain.body.data, 'base64').toString('utf-8');
    }
    // Fall back to text/html
    const html = payload.parts.find((p) => p.mimeType === 'text/html');
    if (html?.body?.data) {
      return stripHtml(Buffer.from(html.body.data, 'base64').toString('utf-8'));
    }
    // Recurse into multipart
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }

  // Direct body
  if (payload.body?.data) {
    const raw = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    if (payload.mimeType === 'text/html') {
      return stripHtml(raw);
    }
    return raw;
  }

  return '';
}

export class EmailIntegration extends BaseIntegration {
  readonly type = 'email';

  private mode: string = 'forwarding';
  private gmail: gmail_v1.Gmail | null = null;
  private config: IntegrationConfig | null = null;

  async connect(config: IntegrationConfig): Promise<void> {
    this.config = config;
    this.mode = (config.settings.mode as string) ?? 'forwarding';

    if (this.mode === 'forwarding') {
      console.log('[email] Integration connected in forwarding mode (passive)');
      return;
    }

    if (this.mode === 'gmail_oauth') {
      const clientId = config.settings.clientId as string | undefined;
      const clientSecret = config.settings.clientSecret as string | undefined;
      const refreshToken = config.settings.refreshToken as string | undefined;

      if (!clientId || !clientSecret || !refreshToken) {
        console.warn('[email] Gmail OAuth mode requires clientId, clientSecret, refreshToken');
        return;
      }

      try {
        const auth = new google.auth.OAuth2(clientId, clientSecret);
        auth.setCredentials({ refresh_token: refreshToken });
        this.gmail = google.gmail({ version: 'v1', auth });
        console.log('[email] Gmail OAuth integration connected');
      } catch (err) {
        console.error('[email] Failed to connect Gmail OAuth:', err);
      }
      return;
    }

    console.warn(`[email] Unknown mode: ${this.mode}`);
  }

  async disconnect(): Promise<void> {
    this.gmail = null;
    this.config = null;
    console.log('[email] Integration disconnected');
  }

  async healthCheck(): Promise<boolean> {
    if (this.mode === 'forwarding') {
      return true;
    }

    if (this.mode === 'gmail_oauth') {
      if (!this.gmail) return false;
      try {
        await this.gmail.users.getProfile({ userId: 'me' });
        return true;
      } catch (err) {
        console.error('[email] Gmail health check failed:', err);
        return false;
      }
    }

    return false;
  }

  async sync(): Promise<InboundEvent[]> {
    if (this.mode === 'forwarding') {
      return [];
    }

    if (this.mode !== 'gmail_oauth' || !this.gmail || !this.config) {
      return [];
    }

    const settings = this.config.settings;
    const query = buildQuery(settings);
    const events: InboundEvent[] = [];

    try {
      const listRes = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50,
      });

      const messages = listRes.data.messages ?? [];

      for (const msg of messages) {
        if (!msg.id) continue;

        try {
          const fullMsg = await this.gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          });

          const headers = fullMsg.data.payload?.headers ?? [];
          const from = getHeader(headers, 'From');
          const subject = getHeader(headers, 'Subject') || '(no subject)';
          const body = extractBody(fullMsg.data.payload ?? undefined).slice(0, 2000);

          events.push({
            title: subject.slice(0, 200),
            description: body || undefined,
            source: 'email',
            sourceRef: msg.id,
            fromExternal: from,
            metadata: { messageId: msg.id, from, subject },
          });

          // Mark as read by removing UNREAD label
          await this.gmail.users.messages.modify({
            userId: 'me',
            id: msg.id,
            requestBody: {
              removeLabelIds: ['UNREAD'],
            },
          });
        } catch (msgErr) {
          console.error(`[email] Failed to process message ${msg.id}:`, msgErr);
        }
      }
    } catch (err) {
      console.error('[email] Gmail sync failed:', err);
    }

    return events;
  }

  async sendNotification(email: string, message: string): Promise<void> {
    if (!this.gmail || !this.config) {
      console.warn('[email] sendNotification called but Gmail not initialized');
      return;
    }

    const rawEmail = [
      `To: ${email}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: LeaderFlow Notification`,
      '',
      message,
    ].join('\r\n');

    const encoded = Buffer.from(rawEmail).toString('base64url');

    await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });
  }

  async sendHandoff(email: string, item: WorkItem, note?: string): Promise<void> {
    if (!this.gmail || !this.config) {
      console.warn('[email] sendHandoff called but Gmail not initialized');
      return;
    }

    const fromName = (item.from as { name?: string } | null)?.name ?? item.fromExternal ?? 'Unknown';
    const dueStr = item.dueAt ? new Date(item.dueAt).toLocaleDateString() : 'No due date';

    const htmlParts = [
      `<h3>[LeaderFlow] Task delegated to you</h3>`,
      `<p><strong>${item.title}</strong></p>`,
      `<p>Priority: ${item.priority} | From: ${fromName}</p>`,
    ];

    if (item.description) {
      htmlParts.push(`<p>${item.description}</p>`);
    }
    if (note) {
      htmlParts.push(`<p><em>Note: ${note}</em></p>`);
    }
    htmlParts.push(`<p>Due: ${dueStr}</p>`);

    const htmlBody = htmlParts.join('\n');

    const rawEmail = [
      `To: ${email}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: [LeaderFlow] Task delegated to you: ${item.title.slice(0, 60)}`,
      '',
      htmlBody,
    ].join('\r\n');

    const encoded = Buffer.from(rawEmail).toString('base64url');

    await this.gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });
  }
}

// Self-register so importing this file registers the integration
integrationRegistry.register('email', EmailIntegration);
