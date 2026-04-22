import request from 'supertest';
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { oidcServer } from './setup';
import type { Core, AuditLogService } from './test-types';
import {
  setSettings,
  applyDefaultOidcConfig,
  initiateLoginAndCallback,
  queryAuditLog,
  createAuditLogExportCtx,
  createSilentExportCtx,
  parseNdjsonBody,
  exportAndCountLines,
  assertNdjsonFormat,
  streamToString,
  expectNdjsonExportHeaders,
  createAuditLogSuite,
} from './test-helpers';

const AUDIT_LOG_UID = 'plugin::strapi-plugin-oidc.audit-log';

describe('AuditLog Service', () => {
  const s = createAuditLogSuite(AUDIT_LOG_UID);

  it('log() persists a record to the DB', async () => {
    await s.service.log({ action: 'login_success', email: 'a@b.com', ip: '127.0.0.1' });
    const rows = await s.strapi.db.query(AUDIT_LOG_UID).findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('login_success');
    expect(rows[0].email).toBe('a@b.com');
  });

  it('log() emits an event on the eventHub', async () => {
    const received: unknown[] = [];
    const listener = (p: unknown) => received.push(p);
    s.strapi.eventHub.on('strapi-plugin-oidc::auth.login_success', listener);

    await s.service.log({ action: 'login_success', email: 'a@b.com', ip: '127.0.0.1' });

    s.strapi.eventHub.removeListener('strapi-plugin-oidc::auth.login_success', listener);
    expect(received).toHaveLength(1);
  });

  it('find() returns paginated results newest-first', async () => {
    await s.service.log({ action: 'login_success', email: 'first@b.com', ip: '1.1.1.1' });
    await s.service.log({ action: 'login_failure', email: 'second@b.com', ip: '2.2.2.2' });
    await s.service.log({ action: 'logout', ip: '3.3.3.3' });

    const result = await s.service.find({ page: 1, pageSize: 2 });
    expect(result.results).toHaveLength(2);
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.pageCount).toBe(2);
    // page 2 should exist and contain the remaining record
    const page2 = await s.service.find({ page: 2, pageSize: 2 });
    expect(page2.results).toHaveLength(1);
  });

  it('cleanup() deletes records older than retention days', async () => {
    await s.service.log({ action: 'login_success', email: 'a@b.com', ip: '127.0.0.1' });

    // Small delay to ensure the record's createdAt is strictly before the cleanup cutoff
    await new Promise((resolve) => setTimeout(resolve, 20));

    // cleanup(0) → cutoff = Date.now() → deletes records with createdAt < now
    await s.service.cleanup(0);

    const rows = await s.strapi.db.query(AUDIT_LOG_UID).findMany({});
    expect(rows).toHaveLength(0);
  });

  afterAll(async () => {
    await s.strapi.db.query(AUDIT_LOG_UID).deleteMany({});
  });
});

describe('AuditLog Service with filters', () => {
  const s = createAuditLogSuite(AUDIT_LOG_UID);

  const seedFixture = async () => {
    await s.service.log({ action: 'login_success', email: 'alice@acme.com', ip: '1.1.1.1' });
    await s.service.log({ action: 'login_failure', email: 'bob@acme.com', ip: '2.2.2.2' });
    await s.service.log({ action: 'logout', ip: '3.3.3.3' });
    await s.service.log({ action: 'user_created', email: 'carol@acme.com', ip: '1.1.1.1' });
    await s.service.log({ action: 'login_success', email: 'dave@other.com', ip: '4.4.4.4' });
  };

  it('filters by action $eq', async () => {
    await seedFixture();
    const result = await s.service.find({
      page: 1,
      pageSize: 25,
      filters: { action: { $eq: 'login_success' } },
    });
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.action === 'login_success')).toBe(true);
  });

  it('filters by action $in', async () => {
    await seedFixture();
    const result = await s.service.find({
      page: 1,
      pageSize: 25,
      filters: { action: { $in: ['login_success', 'login_failure'] } },
    });
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => ['login_success', 'login_failure'].includes(r.action))).toBe(
      true,
    );
  });

  it('filters by email $contains (case-insensitive)', async () => {
    await seedFixture();
    const result = await s.service.find({
      page: 1,
      pageSize: 25,
      filters: { email: { $contains: 'acme' } },
    });
    expect(result.results).toHaveLength(3);
    expect(result.results.every((r) => r.email?.toLowerCase().includes('acme'))).toBe(true);
  });

  it('filters by email $endsWith', async () => {
    await seedFixture();
    const result = await s.service.find({
      page: 1,
      pageSize: 25,
      filters: { email: { $endsWith: 'other.com' } },
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].email).toBe('dave@other.com');
  });

  it('filters by email $null returns rows with null email', async () => {
    await seedFixture();
    await s.service.log({ action: 'logout', ip: '5.5.5.5' });
    const result = await s.service.find({
      page: 1,
      pageSize: 25,
      filters: { email: { $null: true } },
    });
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.action === 'logout')).toBe(true);
  });

  it('filters by ip $contains', async () => {
    await seedFixture();
    const result = await s.service.find({
      page: 1,
      pageSize: 25,
      filters: { ip: { $contains: '1.1' } },
    });
    expect(result.results).toHaveLength(2);
  });

  it('combines filters with AND logic', async () => {
    await seedFixture();
    const result = await s.service.find({
      page: 1,
      pageSize: 25,
      filters: {
        action: { $eq: 'login_success' },
        email: { $contains: 'acme' },
      },
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].email).toBe('alice@acme.com');
  });

  it('pagination metadata reflects filtered set', async () => {
    await seedFixture();
    const result = await s.service.find({
      page: 1,
      pageSize: 2,
      filters: { action: { $in: ['login_success', 'login_failure'] } },
    });
    expect(result.pagination.total).toBe(3);
    expect(result.pagination.pageCount).toBe(2);
  });

  it('sort order is always createdAt desc regardless of filters', async () => {
    await s.service.log({ action: 'login_success', email: 'older@test.com', ip: '1.1.1.1' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await s.service.log({ action: 'login_success', email: 'newer@test.com', ip: '1.1.1.1' });

    const result = await s.service.find({
      page: 1,
      pageSize: 25,
      filters: { action: { $eq: 'login_success' } },
    });
    const emails = result.results.map((r) => r.email);
    expect(emails[0]).toBe('newer@test.com');
    expect(emails[1]).toBe('older@test.com');
  });

  afterAll(async () => {
    await s.strapi.db.query(AUDIT_LOG_UID).deleteMany({});
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

  it('export() sets NDJSON content-type and streams rows as newline-delimited JSON', async () => {
    const auditLogController = strapi.plugin('strapi-plugin-oidc').controller('auditLog');
    const ctx = createAuditLogExportCtx(strapi);
    await auditLogController.export(ctx);

    expectNdjsonExportHeaders(ctx.headers);

    const { parsed } = await parseNdjsonBody(ctx.body as import('node:stream').Readable);
    expect(parsed.length).toBeGreaterThan(0);
    for (const row of parsed) {
      expect(row).toHaveProperty('datetime');
      expect(row).toHaveProperty('action');
      expect(row).toHaveProperty('email');
      expect(row).toHaveProperty('ip');
      expect(row).toHaveProperty('details');
    }
  });

  it('export() emits every row across multiple pages', async () => {
    const N = 1507;
    const auditLogService = strapi
      .plugin('strapi-plugin-oidc')
      .service('auditLog') as AuditLogService;
    for (let i = 0; i < N; i++) {
      await auditLogService.log({ action: 'login_success', email: `u${i}@x.com`, ip: '1.1.1.1' });
    }
    const auditLogController = strapi.plugin('strapi-plugin-oidc').controller('auditLog');
    const ctx = createSilentExportCtx(strapi);
    await auditLogController.export(ctx);
    const { lines } = await parseNdjsonBody(ctx.body as import('node:stream').Readable);
    expect(lines.length).toBe(N + 1);
  });

  it('NDJSON body has no wrapping array, no trailing commas, one object per line', async () => {
    const auditLogController = strapi.plugin('strapi-plugin-oidc').controller('auditLog');
    const ctx = createSilentExportCtx(strapi);
    await auditLogController.export(ctx);
    const { text } = await parseNdjsonBody(ctx.body as import('node:stream').Readable);
    assertNdjsonFormat(text);
  });

  it('export() destroys the stream when the DB paging loop throws', async () => {
    const auditLogService = strapi
      .plugin('strapi-plugin-oidc')
      .service('auditLog') as AuditLogService;
    for (let i = 0; i < 501; i++) {
      await auditLogService.log({ action: 'login_success', email: `e${i}@x.com`, ip: '1.1.1.1' });
    }
    const auditLogController = strapi.plugin('strapi-plugin-oidc').controller('auditLog');
    const realFind = auditLogService.find;
    let call = 0;
    (auditLogService as { find: typeof realFind }).find = async (opts) => {
      call++;
      if (call === 2) throw new Error('synthetic DB failure');
      return realFind(opts);
    };

    try {
      const ctx = createSilentExportCtx(strapi);
      await auditLogController.export(ctx);
      const err: unknown = await new Promise((resolve) => {
        const stream = ctx.body as import('node:stream').Readable;
        stream.on('error', resolve);
        stream.on('end', () => resolve(null));
        stream.resume();
      });
      expect(err).toBeInstanceOf(Error);
    } finally {
      (auditLogService as { find: typeof realFind }).find = realFind;
    }
  });
});

describe('AuditLog E2E Integration', () => {
  let strapi: Core.Strapi;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    agent = request.agent(strapi.server.httpServer);
    await applyDefaultOidcConfig(strapi);
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

    const rows = await queryAuditLog(strapi, 'login_success');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].email).toBe('test@company.com');
  });

  it('state mismatch creates a state_mismatch audit log entry', async () => {
    await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
    await agent.get('/strapi-plugin-oidc/oidc/callback?code=mock-code&state=wrong-state');

    const rows = await queryAuditLog(strapi, 'state_mismatch');
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

    const rows = await queryAuditLog(strapi, 'token_exchange_failed');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('whitelist rejection creates a whitelist_rejected audit log entry', async () => {
    await setSettings(strapi, true, false);
    await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({
      where: { email: 'test@company.com' },
    });

    await initiateLoginAndCallback(agent);

    await setSettings(strapi, false, false);

    const rows = await queryAuditLog(strapi, 'whitelist_rejected');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('logout creates a logout audit log entry', async () => {
    await initiateLoginAndCallback(agent);
    await strapi.db.query(AUDIT_LOG_UID).deleteMany({});

    await agent.post('/strapi-plugin-oidc/logout').redirects(0);

    const rows = await queryAuditLog(strapi, 'logout');
    expect(rows.length).toBeGreaterThan(0);
  });
});
