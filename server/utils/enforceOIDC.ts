import type { Core } from '@strapi/types';

// Returns null when OIDC_ENFORCE is unset, deferring to the database setting.
export function getEnforceOIDCConfig(strapi: Core.Strapi): boolean | null {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, unknown>;
  const val = config.OIDC_ENFORCE;
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return null;
}

export function resolveEnforceOIDC(strapi: Core.Strapi, dbValue: boolean | undefined): boolean {
  const configValue = getEnforceOIDCConfig(strapi);
  if (configValue !== null) return configValue;
  return dbValue ?? false;
}
