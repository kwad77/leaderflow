import { Router } from 'express';
import { prisma } from '../lib/prisma';

const router = Router();

router.get('/', async (_req, res) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  // DB check
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  // Redis check — import from jobs/queue
  try {
    const { redisConnection } = await import('../jobs/queue');
    await redisConnection.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  const healthy = Object.values(checks).every(v => v === 'ok');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    version: process.env.npm_package_version ?? '0.0.1',
    uptime: Math.floor(process.uptime()),
  });
});

export default router;
