import type { Core } from './test-types';
export { clearRateLimitMap } from '../../routes';

export const MOCK_OIDC_CONFIG = {
  REMEMBER_ME: false,
  OIDC_REDIRECT_URI: 'http://localhost:1337/strapi-plugin-oidc/oidc/callback',
  OIDC_CLIENT_ID: 'mock-client-id',
  OIDC_CLIENT_SECRET: 'mock-client-secret',
  OIDC_SCOPE: 'openid profile email',
  OIDC_AUTHORIZATION_ENDPOINT: 'https://mock-oidc.com/authorize',
  OIDC_TOKEN_ENDPOINT: 'https://mock-oidc.com/token',
  OIDC_USERINFO_ENDPOINT: 'https://mock-oidc.com/userinfo',
  OIDC_GRANT_TYPE: 'authorization_code',
  OIDC_FAMILY_NAME_FIELD: 'family_name',
  OIDC_GIVEN_NAME_FIELD: 'given_name',
  OIDC_END_SESSION_ENDPOINT: 'https://mock-oidc.com/logout',
  OIDC_ENFORCE: null,
  AUDIT_LOG_RETENTION_DAYS: 90,
  OIDC_GROUP_FIELD: 'groups',
  OIDC_GROUP_ROLE_MAP: '{}',
};

export const setSettings = (
  strapi: Core.Strapi,
  useWhitelist: boolean,
  enforceOIDC: boolean,
): Promise<void> =>
  strapi
    .plugin('strapi-plugin-oidc')
    .service('whitelist')
    .setSettings({ useWhitelist, enforceOIDC });
