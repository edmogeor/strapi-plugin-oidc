import type { Core } from '@strapi/types';

export function readConfigFlag(strapi: Core.Strapi, key: string): boolean | null {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, unknown>;
  const val = config[key];
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return null;
}

export function resolveConfigFlag(
  strapi: Core.Strapi,
  key: string,
  dbValue: boolean | undefined,
): boolean {
  const configValue = readConfigFlag(strapi, key);
  if (configValue !== null) return configValue;
  return dbValue ?? false;
}
