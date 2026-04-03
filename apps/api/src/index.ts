import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { initSocketServer } from './lib/socket';
import { withClerk } from './middleware/auth';
import { errorHandler, notFound } from './middleware/errorHandler';

// Self-register integrations before routes load
import './integrations/slack.integration';
import './integrations/email.integration';

import * as integrationService from './services/integration.service';
import { startJobWorkers } from './jobs/index';
import orgRoutes from './routes/org';
import itemsRoutes from './routes/items';
import briefingRoutes from './routes/briefing';
import integrationsRoutes from './routes/integrations';
import webhooksRoutes from './routes/webhooks';
import automationRoutes from './routes/automation';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
initSocketServer(httpServer);

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: process.env.WEB_URL ?? 'http://localhost:5173',
    credentials: true,
  })
);

// Parse raw body for webhook signature verification before JSON parse
app.use('/api/webhooks', express.raw({ type: '*/*' }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    req.body = JSON.parse(req.body.toString());
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk middleware (attaches auth state; no-op if keys not set)
app.use(withClerk);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/org', orgRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/briefing', briefingRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/automation', automationRoutes);

// ─── Error handling ───────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10);

httpServer.listen(PORT, async () => {
  console.log(`\n🚀 LeaderFlow API running on http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);

  // Start all configured integrations
  try {
    await integrationService.startAllIntegrations();
  } catch (err) {
    console.error('[integrations] Startup error:', err);
  }

  try {
    await startJobWorkers();
  } catch (err) {
    console.error('[jobs] Startup error:', err);
  }
});

export default app;
