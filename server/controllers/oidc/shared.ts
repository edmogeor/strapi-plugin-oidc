import { getPluginConfig } from '../../utils/pluginConfig';
import { OIDC_CALLBACK_PATH } from '../../../shared/constants';
import type { PluginConfig } from '../../../shared/config';

export function resolveRedirectUri(config: PluginConfig): string {
  const publicUrl =
    config.OIDC_PUBLIC_URL ||
    process.env.PUBLIC_URL ||
    (process.env.NODE_ENV !== 'production' ? 'http://localhost:1337' : '');

  if (!publicUrl) {
    throw new Error(
      'OIDC_PUBLIC_URL or PUBLIC_URL must be set in production. Provide your Strapi origin (e.g. https://myapp.com).',
    );
  }

  return `${publicUrl.replace(/\/+$/, '')}${OIDC_CALLBACK_PATH}`;
}

export function configValidation(): PluginConfig {
  const config = getPluginConfig(strapi);

  if (!config.OIDC_ISSUER || !config.OIDC_CLIENT_ID) {
    const missing = [];
    if (!config.OIDC_ISSUER) missing.push('OIDC_ISSUER');
    if (!config.OIDC_CLIENT_ID) missing.push('OIDC_CLIENT_ID');
    throw new Error(
      `Missing required config keys: ${missing.join(', ')}. Set them via plugin config or environment variables.`,
    );
  }

  return config;
}
