import type { DirectoryProvider, DirectoryUser, OIDCConfig } from '../provider';

interface OktaWellKnown {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

interface OktaUserProfile {
  login: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  managerId?: string;
  department?: string;
}

interface OktaUser {
  id: string;
  profile: OktaUserProfile;
}

let cachedWellKnown: OktaWellKnown | null = null;

async function getWellKnown(domain: string): Promise<OktaWellKnown> {
  if (cachedWellKnown) return cachedWellKnown;
  const res = await fetch(
    `https://${domain}/oauth2/default/.well-known/openid-configuration`
  );
  if (!res.ok) {
    throw new Error(`Okta well-known fetch failed: ${res.status}`);
  }
  cachedWellKnown = (await res.json()) as OktaWellKnown;
  return cachedWellKnown;
}

export class OktaProvider implements DirectoryProvider {
  readonly name = 'okta';

  private get domain(): string {
    const d = process.env.OKTA_DOMAIN;
    if (!d) throw new Error('OKTA_DOMAIN is not set');
    return d;
  }

  private get clientId(): string {
    const v = process.env.OKTA_CLIENT_ID;
    if (!v) throw new Error('OKTA_CLIENT_ID is not set');
    return v;
  }

  private get clientSecret(): string {
    const v = process.env.OKTA_CLIENT_SECRET;
    if (!v) throw new Error('OKTA_CLIENT_SECRET is not set');
    return v;
  }

  private get apiToken(): string {
    const v = process.env.OKTA_API_TOKEN;
    if (!v) throw new Error('OKTA_API_TOKEN is not set');
    return v;
  }

  private get redirectUri(): string {
    return `${process.env.API_URL ?? 'http://localhost:3001'}/api/auth/callback`;
  }

  getOIDCConfig(): OIDCConfig {
    // Returns a synchronous snapshot; endpoints fetched lazily on first use
    const base = `https://${this.domain}/oauth2/default`;
    return {
      authorizationUrl: `${base}/v1/authorize`,
      tokenUrl: `${base}/v1/token`,
      userInfoUrl: `${base}/v1/userinfo`,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      scopes: ['openid', 'profile', 'email'],
      redirectUri: this.redirectUri,
    };
  }

  async exchangeCodeForToken(
    code: string
  ): Promise<{ accessToken: string; idToken: string }> {
    const wk = await getWellKnown(this.domain);
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const res = await fetch(wk.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Okta token exchange failed ${res.status}: ${text}`);
    }
    const data = (await res.json()) as { access_token: string; id_token: string };
    return { accessToken: data.access_token, idToken: data.id_token };
  }

  async getCurrentUser(accessToken: string): Promise<DirectoryUser> {
    const wk = await getWellKnown(this.domain);
    const res = await fetch(wk.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`Okta userinfo failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      sub: string;
      email?: string;
      name?: string;
      title?: string;
      managerId?: string;
      department?: string;
    };
    return {
      externalId: data.sub,
      email: data.email ?? '',
      name: data.name ?? '',
      title: data.title ?? '',
      managerId: data.managerId ?? null,
      department: data.department,
    };
  }

  async getUsers(accessToken: string): Promise<DirectoryUser[]> {
    const users: DirectoryUser[] = [];
    let url: string | null =
      `https://${this.domain}/api/v1/users?limit=200`;

    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `SSWS ${this.apiToken}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Okta users fetch failed ${res.status}: ${text}`);
      }
      const page = (await res.json()) as OktaUser[];
      for (const u of page) {
        const p = u.profile;
        users.push({
          externalId: u.id,
          email: p.login,
          name:
            p.displayName ??
            [p.firstName, p.lastName].filter(Boolean).join(' '),
          title: p.title ?? '',
          managerId: p.managerId ?? null,
          department: p.department,
        });
      }

      // Follow Link header for pagination
      url = null;
      const link = res.headers.get('Link') ?? '';
      for (const part of link.split(',')) {
        const m = part.match(/<([^>]+)>;\s*rel="next"/);
        if (m) {
          url = m[1];
          break;
        }
      }
    }

    return users;
  }
}
