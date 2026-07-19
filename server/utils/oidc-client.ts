import * as client from 'openid-client';
import type { Configuration } from 'openid-client';
import type { PluginConfig } from '../../shared/config';

let configPromise: Promise<Configuration> | null = null;

export function getOidcConfig(): Promise<Configuration> {
  if (!configPromise) {
    const config = strapi.config.get('plugin::strapi-plugin-oidc') as PluginConfig;
    const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET } = config;
    configPromise = client.discovery(new URL(OIDC_ISSUER), OIDC_CLIENT_ID, OIDC_CLIENT_SECRET);
  }
  return configPromise;
}

export function resetOidcConfig(): void {
  configPromise = null;
}
