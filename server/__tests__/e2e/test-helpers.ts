import request, { Agent } from 'supertest';
import type { Core } from './test-types';
import { http, HttpResponse } from 'msw';
import { oidcServer } from './setup';
import { expect } from 'vitest';
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

export async function initiateLoginAndCallback(agent: Agent): Promise<{ state: string | null }> {
  const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
  const state = new URL(loginRes.headers.location).searchParams.get('state');
  await agent.get(`/strapi-plugin-oidc/oidc/callback?code=mock-code&state=${state}`).redirects(0);
  return { state };
}

export async function getDefaultOidcRoleIds(strapi: Core.Strapi): Promise<string[]> {
  const record = await strapi
    .query('plugin::strapi-plugin-oidc.roles')
    .findOne({ where: { oauth_type: '4' } });
  return record?.roles ?? [];
}

export async function loginWithGroups(
  strapi: Core.Strapi,
  _email: string,
  _groups: string[],
  groupRoleMap: Record<string, string[]>,
): Promise<void> {
  const config = { ...MOCK_OIDC_CONFIG };
  config.OIDC_GROUP_ROLE_MAP = JSON.stringify(groupRoleMap);
  strapi.config.set('plugin::strapi-plugin-oidc', config);

  const agent = request.agent(strapi.server.httpServer);
  await initiateLoginAndCallback(agent);
}

async function applyRoleMapConfig(
  strapi: Core.Strapi,
  groupRoleMap: Record<string, string[]>,
): Promise<ReturnType<typeof request.agent>> {
  const config = { ...MOCK_OIDC_CONFIG };
  config.OIDC_GROUP_ROLE_MAP = JSON.stringify(groupRoleMap);
  strapi.config.set('plugin::strapi-plugin-oidc', config);
  return request.agent(strapi.server.httpServer);
}

export { applyRoleMapConfig as applyRoleMap };

export async function loginAndFetchUser(
  strapi: Core.Strapi,
  email: string,
  mswHandler: Parameters<typeof oidcServer.use>[0],
  groupRoleMap: Record<string, string[]>,
) {
  oidcServer.use(mswHandler);

  const config = { ...MOCK_OIDC_CONFIG };
  config.OIDC_GROUP_ROLE_MAP = JSON.stringify(groupRoleMap);
  strapi.config.set('plugin::strapi-plugin-oidc', config);

  const agent = request.agent(strapi.server.httpServer);
  await initiateLoginAndCallback(agent);

  return strapi.db.query('admin::user').findOne({
    where: { email },
    populate: ['roles'],
  });
}

export function mswUserInfoHandler(
  email: string,
  firstName: string,
  lastName: string,
  groups: string[],
) {
  return http.get('https://mock-oidc.com/userinfo', () =>
    HttpResponse.json({
      email,
      family_name: lastName,
      given_name: firstName,
      groups,
    }),
  );
}
