import type { Core } from '@strapi/types';

function readConfigFlag(strapi: Core.Strapi, key: string): boolean | null {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, unknown>;
  const val = config[key];
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return null;
}

function resolveConfigFlag(
  strapi: Core.Strapi,
  key: string,
  dbValue: boolean | undefined,
): boolean {
  const configValue = readConfigFlag(strapi, key);
  if (configValue !== null) return configValue;
  return dbValue ?? false;
}

export function getEnforceOIDCConfig(strapi: Core.Strapi): boolean | null {
  return readConfigFlag(strapi, 'OIDC_ENFORCE');
}

export function resolveEnforceOIDC(strapi: Core.Strapi, dbValue: boolean | undefined): boolean {
  return resolveConfigFlag(strapi, 'OIDC_ENFORCE', dbValue);
}

export function getSkipLoginPageConfig(strapi: Core.Strapi): boolean | null {
  return readConfigFlag(strapi, 'OIDC_SKIP_LOGIN_PAGE');
}

export function resolveSkipLoginPage(strapi: Core.Strapi, dbValue: boolean | undefined): boolean {
  return resolveConfigFlag(strapi, 'OIDC_SKIP_LOGIN_PAGE', dbValue);
}
