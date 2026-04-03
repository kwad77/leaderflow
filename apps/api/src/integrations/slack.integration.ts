import { App as BoltApp } from '@slack/bolt';
import type { KnownBlock } from '@slack/bolt';
import type { WorkItem } from '@leaderflow/shared';
import { BaseIntegration, type InboundEvent, type IntegrationConfig } from './types';
import { integrationRegistry } from './registry';

function priorityEmoji(priority: string): string {
  switch (priority) {
    case 'URGENT':
      return '🚨';
    case 'HIGH':
      return '🔴';
    case 'MEDIUM':
      return '🟡';
    case 'LOW':
      return '🟢';
    default:
      return '⚪';
  }
}

export class SlackIntegration extends BaseIntegration {
  readonly type = 'slack';

  private app: BoltApp | null = null;
  private config: IntegrationConfig | null = null;
  private eventHandler: ((event: InboundEvent) => Promise<void>) | null = null;

  async connect(config: IntegrationConfig): Promise<void> {
    this.config = config;
    const settings = config.settings;

    const token = settings.botToken as string | undefined;
    const signingSecret = settings.signingSecret as string | undefined;
    const appToken = settings.appToken as string | undefined;

    if (!token || !signingSecret) {
      console.warn('[slack] Missing botToken or signingSecret — integration not connected');
      return;
    }

    try {
      if (appToken) {
        // Socket Mode for local dev (no public URL required)
        this.app = new BoltApp({
          token,
          signingSecret,
          socketMode: true,
          appToken,
        });
      } else {
        // HTTP mode for production (requires public URL + Express receiver)
        this.app = new BoltApp({
          token,
          signingSecret,
          // receiver is not wired to Express here — HTTP mode requires external setup
        });
      }
      console.log('[slack] Integration connected');
    } catch (err) {
      console.error('[slack] Failed to connect:', err);
    }
  }

  async disconnect(): Promise<void> {
    if (this.app) {
      try {
        await this.app.stop();
      } catch {
        // ignore stop errors
      }
      this.app = null;
    }
    this.eventHandler = null;
    console.log('[slack] Integration disconnected');
  }

  async healthCheck(): Promise<boolean> {
    if (!this.app) return false;
    try {
      await this.app.client.auth.test();
      return true;
    } catch (err) {
      console.error('[slack] Health check failed:', err);
      return false;
    }
  }

  async sync(): Promise<InboundEvent[]> {
    // Slack is event-driven — use startListening instead
    return [];
  }

  startListening(handler: (event: InboundEvent) => Promise<void>): void {
    if (!this.app) {
      console.warn('[slack] Cannot startListening — app not initialized');
      return;
    }
    this.eventHandler = handler;

    // app_mention events
    this.app.event('app_mention', async ({ event, say }) => {
      try {
        const inbound: InboundEvent = {
          title: (event.text ?? '').slice(0, 200) || 'Slack mention',
          description: `App mention in channel ${event.channel}`,
          source: 'slack',
          sourceRef: event.ts,
          fromExternal: `slack:${event.user}`,
          metadata: { slackUserId: event.user, channel: event.channel, ts: event.ts },
        };
        await handler(inbound);
        await say('Got it! Your message has been logged in LeaderFlow.');
      } catch (err) {
        console.error('[slack] app_mention handler error:', err);
      }
    });

    // Direct messages
    this.app.event('message', async ({ event }) => {
      const msgEvent = event as { subtype?: string; channel_type?: string; text?: string; user?: string; channel?: string; ts?: string };
      // Only handle DMs (channel_type === 'im')
      if (msgEvent.channel_type !== 'im') return;
      if (msgEvent.subtype) return; // skip bot messages, edits, etc.

      try {
        const inbound: InboundEvent = {
          title: (msgEvent.text ?? '').slice(0, 200) || 'Slack direct message',
          description: `Direct message from Slack user ${msgEvent.user}`,
          source: 'slack',
          sourceRef: msgEvent.ts,
          fromExternal: `slack:${msgEvent.user}`,
          metadata: { slackUserId: msgEvent.user, channel: msgEvent.channel, ts: msgEvent.ts },
        };
        await handler(inbound);
      } catch (err) {
        console.error('[slack] message handler error:', err);
      }
    });

    // Escalation reactions
    this.app.event('reaction_added', async ({ event }) => {
      const reactionEvent = event as { reaction?: string; user?: string; item?: { ts?: string; channel?: string } };
      if (!reactionEvent.reaction) return;
      if (!['escalate', 'arrow_up'].includes(reactionEvent.reaction)) return;

      try {
        const inbound: InboundEvent = {
          title: `Escalation reaction :${reactionEvent.reaction}: on message`,
          description: `User ${reactionEvent.user} added :${reactionEvent.reaction}: reaction — suggesting escalation`,
          source: 'slack',
          sourceRef: reactionEvent.item?.ts,
          fromExternal: `slack:${reactionEvent.user}`,
          suggestedPriority: 'HIGH',
          metadata: {
            slackUserId: reactionEvent.user,
            channel: reactionEvent.item?.channel,
            reaction: reactionEvent.reaction,
          },
        };
        await handler(inbound);
      } catch (err) {
        console.error('[slack] reaction_added handler error:', err);
      }
    });

    // /leaderflow slash command
    this.app.command('/leaderflow', async ({ command, ack, respond }) => {
      await ack();
      const text = (command.text ?? '').trim();
      const parts = text.split(/\s+/);
      const subcommand = parts[0]?.toLowerCase();

      if (subcommand === 'help' || !subcommand) {
        await respond({
          text: [
            '*LeaderFlow Slash Command Usage:*',
            '• `/leaderflow escalate <description>` — create an escalation item',
            '• `/leaderflow delegate @user <description>` — delegate with a hint',
            '• `/leaderflow help` — show this message',
          ].join('\n'),
        });
        return;
      }

      if (subcommand === 'escalate') {
        const description = parts.slice(1).join(' ');
        if (!description) {
          await respond({ text: 'Usage: `/leaderflow escalate <description>`' });
          return;
        }
        try {
          const inbound: InboundEvent = {
            title: description.slice(0, 200),
            description: `Escalation from Slack slash command by ${command.user_id}`,
            source: 'slack',
            fromExternal: `slack:${command.user_id}`,
            suggestedPriority: 'HIGH',
            metadata: {
              slackUserId: command.user_id,
              channel: command.channel_id,
              subcommand: 'escalate',
            },
          };
          await handler(inbound);
          await respond({ text: `Escalation created: "${description.slice(0, 80)}"` });
        } catch (err) {
          console.error('[slack] /leaderflow escalate error:', err);
          await respond({ text: 'Failed to create escalation. Please try again.' });
        }
        return;
      }

      if (subcommand === 'delegate') {
        // Format: delegate @username <description>
        const mention = parts[1] ?? '';
        const description = parts.slice(2).join(' ');
        if (!description) {
          await respond({ text: 'Usage: `/leaderflow delegate @user <description>`' });
          return;
        }
        const suggestedDelegate = mention.replace(/^@/, '');
        try {
          const inbound: InboundEvent = {
            title: description.slice(0, 200),
            description: `Delegation hint from Slack slash command by ${command.user_id} to ${mention}`,
            source: 'slack',
            fromExternal: `slack:${command.user_id}`,
            metadata: {
              slackUserId: command.user_id,
              channel: command.channel_id,
              subcommand: 'delegate',
              suggestedDelegate,
            },
          };
          await handler(inbound);
          await respond({ text: `Delegation item created for ${mention}: "${description.slice(0, 80)}"` });
        } catch (err) {
          console.error('[slack] /leaderflow delegate error:', err);
          await respond({ text: 'Failed to create delegation item. Please try again.' });
        }
        return;
      }

      await respond({ text: `Unknown subcommand: \`${subcommand}\`. Try \`/leaderflow help\`.` });
    });

    // Start the Bolt app (Socket Mode or HTTP)
    this.app.start().then(() => {
      console.log('[slack] Bolt app started, listening for events');
    }).catch((err: unknown) => {
      console.error('[slack] Failed to start Bolt app:', err);
    });
  }

  stopListening(): void {
    if (this.app) {
      this.app.stop().catch((err: unknown) => {
        console.error('[slack] Error stopping Bolt app:', err);
      });
    }
    this.eventHandler = null;
  }

  async sendNotification(slackUserId: string, message: string): Promise<void> {
    if (!this.app) {
      console.warn('[slack] sendNotification called but app not initialized');
      return;
    }
    await this.app.client.chat.postMessage({
      channel: slackUserId,
      text: message,
    });
  }

  async sendHandoff(slackUserId: string, item: WorkItem, note?: string): Promise<void> {
    if (!this.app) {
      console.warn('[slack] sendHandoff called but app not initialized');
      return;
    }

    const blocks: KnownBlock[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*[LeaderFlow]* Task delegated to you:\n*${item.title}*`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Priority:*\n${priorityEmoji(item.priority)} ${item.priority}`,
          },
          {
            type: 'mrkdwn',
            text: `*From:*\n${(item.from as { name?: string } | null)?.name ?? item.fromExternal ?? 'Unknown'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Due:*\n${item.dueAt ? new Date(item.dueAt).toLocaleDateString() : 'No due date'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\n${item.status}`,
          },
        ],
      },
    ];

    if (item.description) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: item.description },
      });
    }

    if (note) {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Note:* ${note}` },
      });
    }

    await this.app.client.chat.postMessage({
      channel: slackUserId,
      text: `[LeaderFlow] Task delegated to you: ${item.title}`,
      blocks,
    });
  }
}

// Self-register so importing this file registers the integration
integrationRegistry.register('slack', SlackIntegration);
