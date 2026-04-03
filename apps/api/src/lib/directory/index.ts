import type { DirectoryProvider } from './provider';
export type { DirectoryProvider, DirectoryUser, OIDCConfig } from './provider';

export function getDirectoryProvider(): DirectoryProvider | null {
  const name = (process.env.DIRECTORY_PROVIDER ?? '').toLowerCase();
  if (name === 'okta') {
    const { OktaProvider } = require('./providers/okta');
    return new OktaProvider();
  }
  if (name === 'azure') {
    const { AzureProvider } = require('./providers/azure');
    return new AzureProvider();
  }
  return null;
}
