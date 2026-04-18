import request, { Agent } from 'supertest';
import type { Core, AuditLogService } from './test-types';
import { http, HttpResponse } from 'msw';
import { oidcServer } from './setup';
import { expect, beforeAll, beforeEach } from 'vitest';
import type { Readable } from 'node:stream';
export { clearRateLimitMap } from '../../routes';

export async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

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

export function getStateFromLoginRes(loginRes: { headers: { location: string } }): string | null {
  return new URL(loginRes.headers.location).searchParams.get('state');
}

export function performCallback(agent: Agent, state: string | null): ReturnType<Agent['get']> {
  return agent.get(`/strapi-plugin-oidc/oidc/callback?code=mock-code&state=${state}`).redirects(0);
}

export function createOidcAgent(strapi: Core.Strapi): ReturnType<typeof request.agent> {
  return request.agent(strapi.server.httpServer);
}

export async function getDefaultOidcRoleIds(strapi: Core.Strapi): Promise<string[]> {
  const record = await strapi
    .query('plugin::strapi-plugin-oidc.roles')
    .findOne({ where: { oauth_type: '4' } });
  return record?.roles ?? [];
}

export async function queryAuditLog(
  strapi: Core.Strapi,
  action: string,
  uid = 'plugin::strapi-plugin-oidc.audit-log',
) {
  return strapi.db.query(uid).findMany({ where: { action } });
}

export async function assertGenericAuthError(
  agent: ReturnType<typeof request.agent>,
  callbackUrl: string,
) {
  const res = await agent.get(callbackUrl).redirects(0);
  expect(res.status).toBe(200);
  expect(res.text).toContain('Authentication Failed');
  expect(res.text).toContain('Authentication failed. Please try again.');
  expect(res.text).not.toContain('mock-oidc.com');
  return res;
}

export async function initiateLogin(agent: ReturnType<typeof request.agent>): Promise<string> {
  const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
  return `/strapi-plugin-oidc/oidc/callback?code=mock-code&state=${new URL(loginRes.headers.location).searchParams.get('state')}`;
}

export async function loginWithGroups(
  strapi: Core.Strapi,
  _email: string,
  _groups: string[],
  groupRoleMap: Record<string, string[]>,
): Promise<void> {
  setGroupRoleMap(strapi, groupRoleMap);
  const agent = request.agent(strapi.server.httpServer);
  await initiateLoginAndCallback(agent);
}

async function applyRoleMapConfig(
  strapi: Core.Strapi,
  groupRoleMap: Record<string, string[]>,
): Promise<ReturnType<typeof request.agent>> {
  setGroupRoleMap(strapi, groupRoleMap);
  return request.agent(strapi.server.httpServer);
}

export { applyRoleMapConfig as applyRoleMap };

export function setGroupRoleMap(strapi: Core.Strapi, groupRoleMap: Record<string, string[]>) {
  const config = { ...MOCK_OIDC_CONFIG };
  config.OIDC_GROUP_ROLE_MAP = JSON.stringify(groupRoleMap);
  strapi.config.set('plugin::strapi-plugin-oidc', config);
}

export async function loginAndFetchUser(
  strapi: Core.Strapi,
  email: string,
  mswHandler: Parameters<typeof oidcServer.use>[0],
  groupRoleMap: Record<string, string[]>,
) {
  oidcServer.use(mswHandler);
  setGroupRoleMap(strapi, groupRoleMap);
  const agent = request.agent(strapi.server.httpServer);
  await initiateLoginAndCallback(agent);
  return fetchUserWithRoles(strapi, email);
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

export function makeLogoutCtx(initialCookies: Record<string, string> = {}) {
  const cookieCalls: Array<{ name: string; value: string; opts?: Record<string, unknown> }> = [];
  return {
    request: { secure: false },
    redirectedTo: undefined as string | undefined,
    cookies: {
      get(name: string) {
        return initialCookies[name];
      },
      set(name: string, value: string, opts?: Record<string, unknown>) {
        cookieCalls.push({ name, value, opts });
      },
      calls: cookieCalls,
    },
    redirect(url: string) {
      (this as { redirectedTo: string | undefined }).redirectedTo = url;
    },
  };
}

export function makeCookieTestCtx(secure = false) {
  const calls: Array<{ name: string; value: string; opts: Record<string, unknown> }> = [];
  return {
    request: { secure },
    cookies: {
      set(name: string, value: string, opts: Record<string, unknown>) {
        calls.push({ name, value, opts });
      },
      calls,
    },
  };
}

export function expectCookieCleared(ctx: ReturnType<typeof makeLogoutCtx>, name: string) {
  return expect(ctx.cookies.calls.some((c) => c.name === name && c.opts?.maxAge === 0)).toBe(true);
}

export function findAdminRefreshCookieCall(ctx: {
  cookies: { calls: Array<{ name: string; opts?: Record<string, unknown> }> };
}) {
  return ctx.cookies.calls.find((c) => c.name === 'strapi_admin_refresh');
}

export function expectAdminCookieSecure(
  ctx: { cookies: { calls: Array<{ name: string; opts?: Record<string, unknown> }> } },
  secure: boolean,
) {
  const adminCall = findAdminRefreshCookieCall(ctx);
  expect(adminCall?.opts?.secure).toBe(secure);
}

export async function setupGroupRoleMapping(
  strapi: Core.Strapi,
  groupRoleMap: Record<string, string[]>,
) {
  setGroupRoleMap(strapi, groupRoleMap);
}

export async function fetchUserWithRoles(strapi: Core.Strapi, email: string) {
  return strapi.db.query('admin::user').findOne({
    where: { email },
    populate: ['roles'],
  });
}

export function assertUserHasRole(user: { roles: Array<{ id: number }> }, roleId: number) {
  const userRoleIds = user.roles.map((r: { id: number }) => r.id);
  expect(userRoleIds).toContain(roleId);
}

export async function getFirstAvailableRole(strapi: Core.Strapi) {
  const availableRoles = await strapi.db.query('admin::role').findMany();
  return availableRoles[0];
}

export function createAuditLogExportCtx(strapi: Core.Strapi) {
  const headers: Record<string, string> = {};
  return {
    query: {},
    set: (k: string, v: string) => {
      headers[k] = v;
    },
    body: null as unknown,
    strapi,
    headers,
  };
}

export function createSilentExportCtx(strapi: Core.Strapi) {
  return {
    query: {},
    set: () => {},
    body: null as unknown,
    strapi,
  };
}

export async function parseNdjsonBody(body: import('node:stream').Readable) {
  const text = await streamToString(body);
  const lines = text.split('\n').filter(Boolean);
  return {
    lines,
    text,
    parsed: lines.map((l) => JSON.parse(l)),
  };
}

export async function exportAndCountLines(
  strapi: Core.Strapi,
  auditLogController: { export: (ctx: unknown) => Promise<void> },
) {
  const ctx = createSilentExportCtx(strapi);
  await auditLogController.export(ctx);
  const { lines } = await parseNdjsonBody(ctx.body as import('node:stream').Readable);
  return lines.length;
}

export function createAuditLogSuite(uid: string) {
  const ref = {} as { strapi: Core.Strapi; service: AuditLogService };
  beforeAll(() => {
    ref.strapi = globalThis.strapiInstance;
    ref.service = ref.strapi.plugin('strapi-plugin-oidc').service('auditLog') as AuditLogService;
  });
  beforeEach(async () => {
    await ref.strapi.db.query(uid).deleteMany({});
  });
  return ref;
}

export function expectNdjsonExportHeaders(headers: Record<string, string>) {
  expect(headers['Content-Type']).toMatch(/application\/x-ndjson/);
  expect(headers['Content-Disposition']).toMatch(/\.ndjson"$/);
  expect(headers['Cache-Control']).toBe('no-store');
}

export function assertNdjsonFormat(text: string) {
  expect(text.trim().startsWith('[')).toBe(false);
  expect(text.trim().endsWith(']')).toBe(false);
  expect(text).not.toMatch(/},\n/);
  for (const line of text.split('\n').filter(Boolean)) {
    expect(() => JSON.parse(line)).not.toThrow();
  }
}
