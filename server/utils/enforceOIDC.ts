import type { Core } from '@strapi/types';

/**
 * Parse the OIDC_ENFORCE config value into a boolean or null.
 *
 * Returns `true` or `false` when the config explicitly sets enforcement,
 * or `null` when it should fall through to the database setting.
 */
export function getEnforceOIDCConfig(strapi: Core.Strapi): boolean | null {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, unknown>;
  const val = config.OIDC_ENFORCE;
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return null;
}

/**
 * Resolve the effective enforceOIDC value by preferring the config override
 * and falling back to the database setting.
 */
export function resolveEnforceOIDC(strapi: Core.Strapi, dbValue: boolean | undefined): boolean {
  const configValue = getEnforceOIDCConfig(strapi);
  if (configValue !== null) return configValue;
  return dbValue ?? false;
}
