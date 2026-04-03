export interface DirectoryUser {
  externalId: string;
  email: string;
  name: string;
  title: string;
  managerId: string | null;
  department?: string;
}

export interface OIDCConfig {
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  redirectUri: string;
}

export interface DirectoryProvider {
  readonly name: string;
  getOIDCConfig(): OIDCConfig;
  exchangeCodeForToken(code: string): Promise<{ accessToken: string; idToken: string }>;
  getCurrentUser(accessToken: string): Promise<DirectoryUser>;
  getUsers(accessToken: string): Promise<DirectoryUser[]>;
}
