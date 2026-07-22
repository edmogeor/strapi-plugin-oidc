import type { Core } from '@strapi/types';

function readConfigFlag(strapi: Core.Strapi, key: string): boolean | null {
  const val = (strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, unknown>)[key];
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
  return readConfigFlag(strapi, key) ?? dbValue ?? false;
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
