import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import * as orgService from '../services/org.service';
import * as integrationService from '../services/integration.service';
import { protect } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { encryptConfig, decryptConfig } from '../lib/crypto';

const router = Router();

function prepareConfigForStorage(config: Record<string, unknown>): any {
  if (!process.env.ENCRYPTION_KEY) return config;
  return { _encrypted: encryptConfig(config) };
}

function readConfigFromStorage(stored: any): Record<string, unknown> {
  if (stored?._encrypted) return decryptConfig(stored._encrypted);
  return stored ?? {};
}

/**
 * GET /api/integrations
 */
router.get('/', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const integrations = await prisma.integration.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(
      integrations.map((i) => {
        const config = readConfigFromStorage(i.config);
        return {
          ...i,
          createdAt: i.createdAt.toISOString(),
          lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
          // Redact sensitive config fields
          config: Object.fromEntries(
            Object.entries(config).map(([k, v]) =>
              k.toLowerCase().includes('secret') || k.toLowerCase().includes('token')
                ? [k, '[redacted]']
                : [k, v]
            )
          ),
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

const createIntegrationSchema = z.object({
  type: z.string().min(1),
  config: z.record(z.unknown()),
  enabled: z.boolean().default(true),
});

/**
 * POST /api/integrations
 */
router.post('/', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createIntegrationSchema.parse(req.body);
    const org = await orgService.getFirstOrg();
    const integration = await prisma.integration.create({
      data: {
        orgId: org.id,
        type: body.type,
        config: prepareConfigForStorage(body.config),
        enabled: body.enabled,
      },
    });
    res.status(201).json({
      ...integration,
      createdAt: integration.createdAt.toISOString(),
      lastSyncAt: null,
      config: readConfigFromStorage(integration.config),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/integrations/:id
 */
const updateIntegrationSchema = z.object({
  enabled: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

router.patch('/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateIntegrationSchema.parse(req.body);
    const org = await orgService.getFirstOrg();

    const existing = await prisma.integration.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.orgId !== org.id) {
      throw createError('Integration not found', 404);
    }

    const updated = await prisma.integration.update({
      where: { id: req.params.id },
      data: {
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.config && { config: prepareConfigForStorage(body.config) }),
      },
    });

    res.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      lastSyncAt: updated.lastSyncAt?.toISOString() ?? null,
      config: readConfigFromStorage(updated.config),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/integrations/:id
 */
router.delete('/:id', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const existing = await prisma.integration.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.orgId !== org.id) {
      throw createError('Integration not found', 404);
    }
    await prisma.integration.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/integrations/:id/test
 * Run health check on the integration
 */
router.post('/:id/test', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const existing = await prisma.integration.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.orgId !== org.id) {
      throw createError('Integration not found', 404);
    }

    const result = await integrationService.testIntegration(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/integrations/:id/sync
 * Manually trigger a sync for the integration
 */
router.post('/:id/sync', protect, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await orgService.getFirstOrg();
    const existing = await prisma.integration.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.orgId !== org.id) {
      throw createError('Integration not found', 404);
    }

    await integrationService.syncIntegration(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
