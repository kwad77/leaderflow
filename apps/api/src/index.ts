import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { initSocketServer } from './lib/socket';
import { withClerk } from './middleware/auth';
import { errorHandler, notFound } from './middleware/errorHandler';
import { logger } from './lib/logger';
import { apiLimiter, strictLimiter } from './middleware/rateLimiter';
import healthRouter from './routes/health';

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
import authRouter from './routes/auth';
import importRouter from './routes/import';
import scimRouter from './routes/scim';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.IO
initSocketServer(httpServer);

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(pinoHttp({ logger }));

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
app.use(express.text({ type: 'text/csv' }));

// Clerk middleware (attaches auth state; no-op if keys not set)
app.use(withClerk);

// ─── Rate limiting ────────────────────────────────────────────────────────────

app.use('/api', apiLimiter);
app.use('/api/auth', strictLimiter);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/health', healthRouter);

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/import', importRouter);
app.use('/api/org', orgRoutes);
app.use('/api/items', itemsRoutes);
app.use('/api/briefing', briefingRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/auth', authRouter);
app.use('/api/scim', scimRouter);

// ─── Error handling ───────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001', 10);

httpServer.listen(PORT, async () => {
  logger.info(`LeaderFlow API running on http://localhost:${PORT}`);
  logger.info(`WebSocket: ws://localhost:${PORT}`);
  logger.info(`Health: http://localhost:${PORT}/health`);

  // Start all configured integrations
  try {
    await integrationService.startAllIntegrations();
  } catch (err) {
    logger.error({ err }, '[integrations] Startup error');
  }

  try {
    await startJobWorkers();
  } catch (err) {
    logger.error({ err }, '[jobs] Startup error');
  }
});

export default app;
