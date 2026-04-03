import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { getDirectoryProvider } from '../lib/directory';
import {
  getOrCreateOrgForDomain,
  syncDirectoryToOrg,
} from '../services/directory.service';

const router = Router();

// In-memory OIDC state store: state token → provider name
const stateStore = new Map<string, string>();

// ─── GET /api/auth/providers ──────────────────────────────────────────────────

router.get('/providers', (_req: Request, res: Response) => {
  res.json({
    okta: !!process.env.OKTA_DOMAIN,
    azure: !!process.env.AZURE_TENANT_ID,
  });
});

// ─── GET /api/auth/login ──────────────────────────────────────────────────────

router.get('/login', (req: Request, res: Response) => {
  const providerName = (req.query.provider as string | undefined) ?? '';
  const provider = getDirectoryProvider();

  if (!provider || provider.name !== providerName.toLowerCase()) {
    res.status(501).json({ error: `Provider '${providerName}' is not configured` });
    return;
  }

  const config = provider.getOIDCConfig();
  const state = randomBytes(16).toString('hex');
  stateStore.set(state, provider.name);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    state,
  });

  // Set state in cookie for validation on callback
  res.cookie('oidc_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  res.redirect(`${config.authorizationUrl}?${params.toString()}`);
});

// ─── GET /api/auth/callback ───────────────────────────────────────────────────

router.get('/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state) {
    res.status(400).json({ error: 'Missing code or state' });
    return;
  }

  const providerName = stateStore.get(state);
  if (!providerName) {
    res.status(400).json({ error: 'Invalid or expired state' });
    return;
  }
  stateStore.delete(state);
  res.clearCookie('oidc_state');

  const provider = getDirectoryProvider();
  if (!provider || provider.name !== providerName) {
    res.status(501).json({ error: 'Provider no longer configured' });
    return;
  }

  let tokens: { accessToken: string; idToken: string };
  try {
    tokens = await provider.exchangeCodeForToken(code);
  } catch (err) {
    console.error('[auth] token exchange error:', err);
    res.status(502).json({ error: 'Token exchange failed' });
    return;
  }

  let currentUser;
  try {
    currentUser = await provider.getCurrentUser(tokens.accessToken);
  } catch (err) {
    console.error('[auth] getCurrentUser error:', err);
    res.status(502).json({ error: 'Failed to fetch user info' });
    return;
  }

  const domain = currentUser.email.split('@')[1] ?? currentUser.email;
  const orgId = await getOrCreateOrgForDomain(domain);

  // Fire sync in background — do not await
  syncDirectoryToOrg(provider, tokens.accessToken, orgId).catch(console.error);

  res.json({
    orgId,
    email: currentUser.email,
    name: currentUser.name,
    syncing: true,
  });
});

// ─── GET /api/auth/sync ───────────────────────────────────────────────────────

router.get('/sync', async (req: Request, res: Response) => {
  const { orgId, accessToken } = req.query as {
    orgId?: string;
    accessToken?: string;
  };

  if (!orgId) {
    res.status(400).json({ error: 'Missing orgId' });
    return;
  }

  if (!accessToken) {
    res.status(400).json({ error: 'Missing accessToken' });
    return;
  }

  const provider = getDirectoryProvider();
  if (!provider) {
    res.status(501).json({ error: 'No directory provider configured' });
    return;
  }

  try {
    const result = await syncDirectoryToOrg(provider, accessToken, orgId);
    res.json(result);
  } catch (err) {
    console.error('[auth] sync error:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

export default router;
