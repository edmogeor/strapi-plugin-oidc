import type { StrapiConfig } from '../types';

function readConfigFlag(strapi: StrapiConfig, key: string): boolean | null {
  const val = (strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, unknown>)[key];
  if (typeof val === 'boolean') return val;
  if (val === 'true') return true;
  if (val === 'false') return false;
  return null;
}

function resolveConfigFlag(
  strapi: StrapiConfig,
  key: string,
  dbValue: boolean | undefined,
): boolean {
  return readConfigFlag(strapi, key) ?? dbValue ?? false;
}

export function getEnforceOIDCConfig(strapi: StrapiConfig): boolean | null {
  return readConfigFlag(strapi, 'OIDC_ENFORCE');
}

export function resolveEnforceOIDC(strapi: StrapiConfig, dbValue: boolean | undefined): boolean {
  return resolveConfigFlag(strapi, 'OIDC_ENFORCE', dbValue);
}

export function getSkipLoginPageConfig(strapi: StrapiConfig): boolean | null {
  return readConfigFlag(strapi, 'OIDC_SKIP_LOGIN_PAGE');
}

export function resolveSkipLoginPage(strapi: StrapiConfig, dbValue: boolean | undefined): boolean {
  return resolveConfigFlag(strapi, 'OIDC_SKIP_LOGIN_PAGE', dbValue);
}
