import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { getFirstOrg, getOrgTree } from '../services/org.service';
import { emitToOrg } from '../lib/socket';
import { childLogger } from '../lib/logger';

const router = Router();
const log = childLogger('scim');

// ─── SCIM Bearer Token Auth ───────────────────────────────────────────────────

function scimAuth(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.SCIM_BEARER_TOKEN;
  if (!token) {
    // Dev mode: no token configured, accept all requests
    next();
    return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Missing or invalid Authorization header',
    });
    return;
  }

  const provided = authHeader.slice('Bearer '.length);
  if (provided !== token) {
    res.status(401).json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '401',
      detail: 'Invalid bearer token',
    });
    return;
  }

  next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCIM_CONTENT_TYPE = 'application/scim+json';

type Member = {
  id: string;
  email: string;
  name: string;
  role: string;
  parentId: string | null;
  createdAt: Date;
};

function toScimUser(member: Member) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: member.id,
    userName: member.email,
    name: { formatted: member.name },
    title: member.role,
    active: true,
    ...(member.parentId ? { manager: { value: member.parentId } } : {}),
    meta: {
      resourceType: 'User',
      created: member.createdAt.toISOString(),
      location: `/api/scim/v2/Users/${member.id}`,
    },
  };
}

// Parse simple SCIM filter: `userName eq "value"` or `userName eq 'value'`
function parseEqFilter(filter: string): { attr: string; value: string } | null {
  const match = filter.match(/^\s*(\w+(?:\.\w+)?)\s+eq\s+["'](.+?)["']\s*$/i);
  if (!match) return null;
  return { attr: match[1], value: match[2] };
}

// ─── GET /v2/ServiceProviderConfig ───────────────────────────────────────────

router.get('/v2/ServiceProviderConfig', scimAuth, (_req: Request, res: Response) => {
  log.debug('ServiceProviderConfig requested');
  res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
  res.json({
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Bearer token auth',
      },
    ],
  });
});

// ─── GET /v2/Schemas ──────────────────────────────────────────────────────────

router.get('/v2/Schemas', scimAuth, (_req: Request, res: Response) => {
  log.debug('Schemas requested');
  res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
  res.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 1,
    Resources: [
      {
        id: 'urn:ietf:params:scim:schemas:core:2.0:User',
        name: 'User',
        description: 'User Account',
        attributes: [
          { name: 'userName', type: 'string', required: true, uniqueness: 'server' },
          { name: 'name', type: 'complex', subAttributes: [{ name: 'formatted', type: 'string' }] },
          { name: 'title', type: 'string' },
          { name: 'active', type: 'boolean' },
        ],
        meta: { resourceType: 'Schema', location: '/api/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User' },
      },
    ],
  });
});

// ─── GET /v2/ResourceTypes ────────────────────────────────────────────────────

router.get('/v2/ResourceTypes', scimAuth, (_req: Request, res: Response) => {
  log.debug('ResourceTypes requested');
  res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
  res.json({
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 1,
    Resources: [
      {
        schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
        id: 'User',
        name: 'User',
        endpoint: '/Users',
        schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
        meta: { resourceType: 'ResourceType', location: '/api/scim/v2/ResourceTypes/User' },
      },
    ],
  });
});

// ─── GET /v2/Users ────────────────────────────────────────────────────────────

router.get('/v2/Users', scimAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = await getFirstOrg();
    let members = await prisma.member.findMany({
      where: { orgId: org.id },
      orderBy: { createdAt: 'asc' },
    });

    // Apply filter if provided (Okta uses: userName eq "email@domain.com")
    const filterParam = req.query['filter'] as string | undefined;
    if (filterParam) {
      const parsed = parseEqFilter(filterParam);
      if (parsed) {
        const { attr, value } = parsed;
        if (attr === 'userName') {
          members = members.filter((m) => m.email === value);
        } else if (attr === 'name.formatted') {
          members = members.filter((m) => m.name === value);
        }
      }
    }

    log.debug({ count: members.length, filter: filterParam }, 'SCIM list users');

    res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
    res.json({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: members.length,
      Resources: members.map(toScimUser),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /v2/Users/:id ────────────────────────────────────────────────────────

router.get('/v2/Users/:id', scimAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!member) {
      res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
      res.status(404).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      });
      return;
    }

    log.debug({ memberId: member.id }, 'SCIM get user');
    res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
    res.json(toScimUser(member));
  } catch (err) {
    next(err);
  }
});

// ─── POST /v2/Users ───────────────────────────────────────────────────────────

router.post('/v2/Users', scimAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      userName?: string;
      name?: { formatted?: string };
      title?: string;
      manager?: { value?: string };
    };

    const email = body.userName ?? '';
    const name = body.name?.formatted ?? email;
    const role = body.title ?? 'Member';
    const parentId = body.manager?.value ?? undefined;

    const org = await getFirstOrg();

    // Check for duplicate email within org
    const existing = await prisma.member.findFirst({
      where: { orgId: org.id, email },
    });
    if (existing) {
      res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
      res.status(409).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '409',
        detail: `User with userName "${email}" already exists`,
      });
      return;
    }

    const member = await prisma.member.create({
      data: {
        email,
        name,
        role,
        orgId: org.id,
        ...(parentId ? { parentId } : {}),
      },
    });

    log.info({ memberId: member.id, email }, 'SCIM created user');

    const updatedTree = await getOrgTree(org.id);
    emitToOrg(org.id, { type: 'ORG_UPDATED', payload: updatedTree, timestamp: new Date().toISOString() });

    res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
    res.status(201).json(toScimUser(member));
  } catch (err) {
    next(err);
  }
});

// ─── PUT /v2/Users/:id ────────────────────────────────────────────────────────

router.put('/v2/Users/:id', scimAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!member) {
      res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
      res.status(404).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      });
      return;
    }

    const body = req.body as {
      userName?: string;
      name?: { formatted?: string };
      title?: string;
      manager?: { value?: string };
    };

    const email = body.userName ?? member.email;
    const name = body.name?.formatted ?? member.name;
    const role = body.title ?? member.role;
    const parentId = body.manager?.value !== undefined ? body.manager.value : member.parentId;

    const updated = await prisma.member.update({
      where: { id: req.params.id },
      data: { email, name, role, parentId: parentId ?? null },
    });

    log.info({ memberId: updated.id }, 'SCIM full-replace user');

    const org = await getFirstOrg();
    const updatedTree = await getOrgTree(org.id);
    emitToOrg(org.id, { type: 'ORG_UPDATED', payload: updatedTree, timestamp: new Date().toISOString() });

    res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
    res.json(toScimUser(updated));
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /v2/Users/:id ──────────────────────────────────────────────────────

router.patch('/v2/Users/:id', scimAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!member) {
      res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
      res.status(404).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      });
      return;
    }

    const body = req.body as {
      Operations?: Array<{ op: string; path?: string; value?: unknown }>;
    };

    const ops = body.Operations ?? [];
    const patch: Record<string, unknown> = {};
    let shouldDelete = false;

    for (const operation of ops) {
      const op = operation.op?.toLowerCase();
      const path = operation.path?.toLowerCase();
      const value = operation.value;

      if (op === 'replace' || op === 'add') {
        if (path === 'title') {
          patch['role'] = value as string;
        } else if (path === 'active') {
          if (value === false || value === 'false') {
            shouldDelete = true;
          }
          // active: true — no-op (already active, no soft-delete field in schema)
        } else if (path === 'name.formatted') {
          patch['name'] = value as string;
        } else if (path === 'manager.value') {
          patch['parentId'] = value as string;
        } else if (path === 'username') {
          patch['email'] = value as string;
        } else if (!path && typeof value === 'object' && value !== null) {
          // Valueless path: Operations with no path carry the whole object
          const v = value as Record<string, unknown>;
          if ('title' in v) patch['role'] = v['title'];
          if ('active' in v && (v['active'] === false || v['active'] === 'false')) shouldDelete = true;
          if ('userName' in v) patch['email'] = v['userName'];
          if ('name' in v && typeof v['name'] === 'object' && v['name'] !== null) {
            const nameObj = v['name'] as Record<string, unknown>;
            if ('formatted' in nameObj) patch['name'] = nameObj['formatted'];
          }
        }
      }
    }

    if (shouldDelete) {
      log.info({ memberId: member.id }, 'SCIM deactivating (deleting) user via PATCH active=false');
      await prisma.member.delete({ where: { id: member.id } });

      const org = await getFirstOrg();
      const updatedTree = await getOrgTree(org.id);
      emitToOrg(org.id, { type: 'ORG_UPDATED', payload: updatedTree, timestamp: new Date().toISOString() });

      res.status(204).end();
      return;
    }

    const updated = await prisma.member.update({
      where: { id: req.params.id },
      data: patch,
    });

    log.info({ memberId: updated.id, patch }, 'SCIM patch user');

    const org = await getFirstOrg();
    const updatedTree = await getOrgTree(org.id);
    emitToOrg(org.id, { type: 'ORG_UPDATED', payload: updatedTree, timestamp: new Date().toISOString() });

    res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
    res.json(toScimUser(updated));
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /v2/Users/:id ─────────────────────────────────────────────────────

router.delete('/v2/Users/:id', scimAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const member = await prisma.member.findUnique({ where: { id: req.params.id } });
    if (!member) {
      res.setHeader('Content-Type', SCIM_CONTENT_TYPE);
      res.status(404).json({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        status: '404',
        detail: 'User not found',
      });
      return;
    }

    await prisma.member.delete({ where: { id: req.params.id } });

    log.info({ memberId: req.params.id }, 'SCIM deleted user');

    const org = await getFirstOrg();
    const updatedTree = await getOrgTree(org.id);
    emitToOrg(org.id, { type: 'ORG_UPDATED', payload: updatedTree, timestamp: new Date().toISOString() });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
