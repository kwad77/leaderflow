import { vi } from 'vitest';

// Mock prisma globally
vi.mock('../lib/prisma', () => ({
  prisma: {
    workItem: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    workItemUpdate: {
      create: vi.fn(),
    },
    member: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      $queryRaw: vi.fn(),
    },
    automationRule: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock socket emit
vi.mock('../lib/socket', () => ({
  emitToOrg: vi.fn(),
}));

// Mock job queues
vi.mock('../jobs/queue', () => ({
  triageQueue: { add: vi.fn().mockResolvedValue({}) },
  escalationQueue: { add: vi.fn().mockResolvedValue({}) },
  followupQueue: { add: vi.fn().mockResolvedValue({}) },
  automationQueue: { add: vi.fn().mockResolvedValue({}) },
  redisConnection: { ping: vi.fn().mockResolvedValue('PONG') },
}));

// Clear all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
