import { errorMessages } from '../../error-strings';
import { OIDC_CALLBACK_PATH } from '../../../shared/constants';
import type { PluginConfig } from '../../../shared/config';

const REQUIRED_CONFIG_KEYS = [
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_SCOPE',
  'OIDC_FAMILY_NAME_FIELD',
  'OIDC_GIVEN_NAME_FIELD',
] as const;

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
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as PluginConfig;

  const missing = REQUIRED_CONFIG_KEYS.filter((key) => !config[key]);
  if (missing.length === 0) {
    return config;
  }
  throw new Error(errorMessages.MISSING_CONFIG(missing.join(', ')));
}
