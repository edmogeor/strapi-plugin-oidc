import type { Core } from '@strapi/types';
import { readConfigFlag, resolveConfigFlag } from './resolveConfigFlag';

const KEY = 'OIDC_SKIP_LOGIN_PAGE';

export function getSkipLoginPageConfig(strapi: Core.Strapi): boolean | null {
  return readConfigFlag(strapi, KEY);
}

export function resolveSkipLoginPage(strapi: Core.Strapi, dbValue: boolean | undefined): boolean {
  return resolveConfigFlag(strapi, KEY, dbValue);
}
