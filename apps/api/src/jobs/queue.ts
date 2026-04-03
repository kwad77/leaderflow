import { Queue, Worker, type Processor } from 'bullmq';
import IORedis from 'ioredis';

export const redisConnection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const triageQueue     = new Queue('triage',     { connection: redisConnection });
export const followupQueue   = new Queue('followup',   { connection: redisConnection });
export const escalationQueue = new Queue('escalation', { connection: redisConnection });
export const automationQueue = new Queue('automation', { connection: redisConnection });
export const digestQueue     = new Queue('digest',     { connection: redisConnection });

export function createWorker(queueName: string, processor: Processor) {
  return new Worker(queueName, processor, {
    connection: redisConnection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '3'),
  });
}
