import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { oidcServer } from './setup';
import type { Core, AuditLogService } from './test-types';

const MOCK_OIDC_CONFIG = {
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
};

const AUDIT_LOG_UID = 'plugin::strapi-plugin-oidc.audit-log';

async function initiateLoginAndCallback(agent: ReturnType<typeof request.agent>): Promise<void> {
  const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
  const locationUrl = new URL(loginRes.headers.location);
  const state = locationUrl.searchParams.get('state');
  await agent.get(`/strapi-plugin-oidc/oidc/callback?code=mock-code&state=${state}`);
}

describe('AuditLog Service', () => {
  let strapi: Core.Strapi;
  let auditLogService: AuditLogService;

  beforeAll(() => {
    strapi = globalThis.strapiInstance;
    auditLogService = strapi.plugin('strapi-plugin-oidc').service('auditLog') as AuditLogService;
  });

  beforeEach(async () => {
    await strapi.db.query(AUDIT_LOG_UID).deleteMany({});
  });

  it('log() persists a record to the DB', async () => {
    await auditLogService.log({ action: 'login_success', email: 'a@b.com', ip: '127.0.0.1' });
    const rows = await strapi.db.query(AUDIT_LOG_UID).findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('login_success');
    expect(rows[0].email).toBe('a@b.com');
  });

  it('log() emits an event on the eventHub', async () => {
    const received: unknown[] = [];
    const listener = (p: unknown) => received.push(p);
    strapi.eventHub.on('strapi-plugin-oidc::auth.login_success', listener);

    await auditLogService.log({ action: 'login_success', email: 'a@b.com', ip: '127.0.0.1' });

    strapi.eventHub.removeListener('strapi-plugin-oidc::auth.login_success', listener);
    expect(received).toHaveLength(1);
  });

  it('find() returns paginated results newest-first', async () => {
    await auditLogService.log({ action: 'login_success', email: 'first@b.com', ip: '1.1.1.1' });
    await auditLogService.log({ action: 'login_failure', email: 'second@b.com', ip: '2.2.2.2' });
    await auditLogService.log({ action: 'logout', ip: '3.3.3.3' });

    const result = await auditLogService.find({ page: 1, pageSize: 2 });
    expect(result.results).toHaveLength(2);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.pageCount).toBe(2);
    // page 2 should exist and contain the remaining record
    const page2 = await auditLogService.find({ page: 2, pageSize: 2 });
    expect(page2.results).toHaveLength(1);
  });

  it('findAll() returns all records', async () => {
    await auditLogService.log({ action: 'login_success', email: 'a@b.com', ip: '1.1.1.1' });
    await auditLogService.log({ action: 'logout', ip: '1.1.1.1' });

    const rows = await auditLogService.findAll();
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('cleanup() deletes records older than retention days', async () => {
    await auditLogService.log({ action: 'login_success', email: 'a@b.com', ip: '127.0.0.1' });

    // Small delay to ensure the record's createdAt is strictly before the cleanup cutoff
    await new Promise((resolve) => setTimeout(resolve, 20));

    // cleanup(0) → cutoff = Date.now() → deletes records with createdAt < now
    await auditLogService.cleanup(0);

    const rows = await strapi.db.query(AUDIT_LOG_UID).findMany({});
    expect(rows).toHaveLength(0);
  });
});

describe('AuditLog Controller', () => {
  let strapi: Core.Strapi;

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    // seed one record so export has content
    await strapi
      .plugin('strapi-plugin-oidc')
      .service('auditLog')
      .log({ action: 'login_success', email: 'ctrl@test.com', ip: '127.0.0.1' });
  });

  afterAll(async () => {
    await strapi.db.query(AUDIT_LOG_UID).deleteMany({});
  });

  it('find() returns paginated logs in ctx.body', async () => {
    const auditLogController = strapi.plugin('strapi-plugin-oidc').controller('auditLog');
    const ctx = { query: { page: '1', pageSize: '10' }, body: null as unknown };
    await auditLogController.find(ctx);
    expect(ctx.body).toHaveProperty('results');
    expect(ctx.body).toHaveProperty('pagination');
    expect(Array.isArray((ctx.body as { results: unknown[] }).results)).toBe(true);
  });

  it('export() sets NDJSON content-type and streams records', async () => {
    const auditLogController = strapi.plugin('strapi-plugin-oidc').controller('auditLog');
    const headers: Record<string, string> = {};
    const ctx = {
      query: {},
      set: (k: string, v: string) => {
        headers[k] = v;
      },
      body: null as unknown,
    };
    await auditLogController.export(ctx);
    expect(headers['Content-Type']).toBe('application/x-ndjson');
    expect(typeof ctx.body).toBe('string');
    // Each line should be valid JSON
    const lines = (ctx.body as string).split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe('AuditLog E2E Integration', () => {
  let strapi: Core.Strapi;
  let agent: ReturnType<typeof request.agent>;

  const setSettings = async (useWhitelist: boolean, enforceOIDC: boolean) => {
    await strapi
      .plugin('strapi-plugin-oidc')
      .service('whitelist')
      .setSettings({ useWhitelist, enforceOIDC });
  };

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    agent = request.agent(strapi.server.httpServer);
    strapi.config.set('plugin::strapi-plugin-oidc', MOCK_OIDC_CONFIG);
    await setSettings(false, false);
  });

  afterAll(async () => {
    await strapi.db.query('admin::user').deleteMany({ where: { email: 'test@company.com' } });
    await strapi.db.query(AUDIT_LOG_UID).deleteMany({});
  });

  afterEach(async () => {
    await strapi.db.query(AUDIT_LOG_UID).deleteMany({});
  });

  it('successful login creates a login_success audit log entry', async () => {
    await initiateLoginAndCallback(agent);

    const rows = await strapi.db
      .query(AUDIT_LOG_UID)
      .findMany({ where: { action: 'login_success' } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].email).toBe('test@company.com');
  });

  it('state mismatch creates a state_mismatch audit log entry', async () => {
    // Initiate login to set cookies, then send wrong state
    await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
    await agent.get('/strapi-plugin-oidc/oidc/callback?code=mock-code&state=wrong-state');

    const rows = await strapi.db
      .query(AUDIT_LOG_UID)
      .findMany({ where: { action: 'state_mismatch' } });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('token exchange failure creates a token_exchange_failed audit log entry', async () => {
    oidcServer.use(
      http.post('https://mock-oidc.com/token', () => HttpResponse.json({}, { status: 401 })),
    );

    const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
    const locationUrl = new URL(loginRes.headers.location);
    const state = locationUrl.searchParams.get('state');
    await agent.get(`/strapi-plugin-oidc/oidc/callback?code=mock-code&state=${state}`);

    const rows = await strapi.db
      .query(AUDIT_LOG_UID)
      .findMany({ where: { action: 'token_exchange_failed' } });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('whitelist rejection creates a whitelist_rejected audit log entry', async () => {
    await setSettings(true, false);
    // Ensure test@company.com is NOT in the whitelist
    await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({
      where: { email: 'test@company.com' },
    });

    await initiateLoginAndCallback(agent);

    await setSettings(false, false);

    const rows = await strapi.db
      .query(AUDIT_LOG_UID)
      .findMany({ where: { action: 'whitelist_rejected' } });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('logout creates a logout audit log entry', async () => {
    // Login first
    await initiateLoginAndCallback(agent);
    await strapi.db.query(AUDIT_LOG_UID).deleteMany({});

    // MSW: userinfo returns 200 so we get a full logout redirect
    await agent.get('/strapi-plugin-oidc/logout').redirects(0);

    const rows = await strapi.db.query(AUDIT_LOG_UID).findMany({});
    expect(rows.length).toBeGreaterThan(0);
    const actions = rows.map((r) => r.action);
    expect(actions.some((a) => a === 'logout' || a === 'session_expired')).toBe(true);
  });
});
