import type { DirectoryProvider, DirectoryUser, OIDCConfig } from '../provider';

interface GraphUser {
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  department?: string;
  manager?: { id: string };
}

interface GraphResponse {
  value: GraphUser[];
  '@odata.nextLink'?: string;
}

export class AzureProvider implements DirectoryProvider {
  readonly name = 'azure';

  private get tenantId(): string {
    const v = process.env.AZURE_TENANT_ID;
    if (!v) throw new Error('AZURE_TENANT_ID is not set');
    return v;
  }

  private get clientId(): string {
    const v = process.env.AZURE_CLIENT_ID;
    if (!v) throw new Error('AZURE_CLIENT_ID is not set');
    return v;
  }

  private get clientSecret(): string {
    const v = process.env.AZURE_CLIENT_SECRET;
    if (!v) throw new Error('AZURE_CLIENT_SECRET is not set');
    return v;
  }

  private get base(): string {
    return `https://login.microsoftonline.com/${this.tenantId}/v2.0`;
  }

  private get redirectUri(): string {
    return `${process.env.API_URL ?? 'http://localhost:3001'}/api/auth/callback`;
  }

  getOIDCConfig(): OIDCConfig {
    return {
      authorizationUrl: `${this.base}/authorize`,
      tokenUrl: `${this.base}/token`,
      userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      scopes: ['openid', 'profile', 'email', 'User.Read', 'User.Read.All'],
      redirectUri: this.redirectUri,
    };
  }

  async exchangeCodeForToken(
    code: string
  ): Promise<{ accessToken: string; idToken: string }> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: this.getOIDCConfig().scopes.join(' '),
    });
    const res = await fetch(`${this.base}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Azure token exchange failed ${res.status}: ${text}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      id_token: string;
    };
    return { accessToken: data.access_token, idToken: data.id_token };
  }

  async getCurrentUser(accessToken: string): Promise<DirectoryUser> {
    const res = await fetch(
      'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,jobTitle',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      throw new Error(`Azure /me failed: ${res.status}`);
    }
    const u = (await res.json()) as GraphUser;
    return {
      externalId: u.id,
      email: u.mail ?? u.userPrincipalName ?? '',
      name: u.displayName ?? '',
      title: u.jobTitle ?? '',
      managerId: null,
    };
  }

  async getUsers(accessToken: string): Promise<DirectoryUser[]> {
    const users: DirectoryUser[] = [];
    let url: string | null =
      'https://graph.microsoft.com/v1.0/users' +
      '?$select=id,displayName,mail,userPrincipalName,jobTitle,department' +
      '&$expand=manager($select=id)';

    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Azure Graph users failed ${res.status}: ${text}`);
      }
      const page = (await res.json()) as GraphResponse;
      for (const u of page.value) {
        users.push({
          externalId: u.id,
          email: u.mail ?? u.userPrincipalName ?? '',
          name: u.displayName ?? '',
          title: u.jobTitle ?? '',
          managerId: u.manager?.id ?? null,
          department: u.department,
        });
      }
      url = page['@odata.nextLink'] ?? null;
    }

    return users;
  }
}
