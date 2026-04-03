import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import healthRouter from '../../routes/health';
import { prisma } from '../../lib/prisma';
import { redisConnection } from '../../jobs/queue';

// Add top-level $queryRaw to the prisma mock (setup.ts only mocks model-level methods)
const prismaMock = prisma as any;
if (!prismaMock.$queryRaw) {
  prismaMock.$queryRaw = vi.fn();
}

const app = express();
app.use('/api/health', healthRouter);

describe('GET /api/health', () => {
  it('returns 200 with status ok when both DB and Redis are healthy', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    vi.mocked(redisConnection.ping).mockResolvedValueOnce('PONG');

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database).toBe('ok');
    expect(res.body.checks.redis).toBe('ok');
  });

  it('returns 503 with status degraded when DB check fails', async () => {
    prismaMock.$queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    vi.mocked(redisConnection.ping).mockResolvedValueOnce('PONG');

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database).toBe('error');
    expect(res.body.checks.redis).toBe('ok');
  });

  it('returns 503 with status degraded when Redis check fails', async () => {
    prismaMock.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    vi.mocked(redisConnection.ping).mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.database).toBe('ok');
    expect(res.body.checks.redis).toBe('error');
  });
});
