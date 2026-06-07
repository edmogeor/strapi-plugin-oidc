import type { Core } from '@strapi/types';
import { readConfigFlag, resolveConfigFlag } from './resolveConfigFlag';

const KEY = 'OIDC_ENFORCE';

export function getEnforceOIDCConfig(strapi: Core.Strapi): boolean | null {
  return readConfigFlag(strapi, KEY);
}

export function resolveEnforceOIDC(strapi: Core.Strapi, dbValue: boolean | undefined): boolean {
  return resolveConfigFlag(strapi, KEY, dbValue);
}
