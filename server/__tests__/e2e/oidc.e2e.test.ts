import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { oidcServer } from './setup';
import type { Core } from './test-types';
import {
  MOCK_OIDC_CONFIG,
  setSettings,
  clearRateLimitMap,
  initiateLoginAndCallback,
  getDefaultOidcRoleIds,
  loginAndFetchUser,
  mswUserInfoHandler,
  getStateFromLoginRes,
  performCallback,
  initiateLogin,
  assertGenericAuthError,
  queryAuditLog,
  createOidcAgent,
  setupGroupRoleMapping,
  fetchUserWithRoles,
  getFirstAvailableRole,
} from './test-helpers';
import { userFacingMessages } from '../../audit-error-strings';
import type { WhitelistService } from '../../types';

const createAgent = () => request.agent(strapi.server.httpServer);

describe('OIDC E2E Tests', () => {
  let strapi: Core.Strapi;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    agent = request.agent(strapi.server.httpServer);

    clearRateLimitMap();
    strapi.config.set('plugin::strapi-plugin-oidc', MOCK_OIDC_CONFIG);

    // Disable whitelist for tests
    await setSettings(strapi, false, false);
  });

  afterAll(async () => {
    await strapi.db.query('admin::user').deleteMany({ where: { email: 'test@company.com' } });
    await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});
  });

  it('should have initialized the plugin', () => {
    expect(strapi.plugin('strapi-plugin-oidc')).toBeDefined();
  });

  it('should handle the full OIDC login flow', async () => {
    const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toContain('https://mock-oidc.com/authorize');
    const state = getStateFromLoginRes(loginRes);
    expect(state).toBeDefined();

    const callbackRes = await performCallback(agent, state);
    expect(callbackRes.status).toBe(200);
    expect(callbackRes.text).toContain('jwtToken');
    expect(callbackRes.text).toContain('localStorage.setItem');
  });

  it('should expose public settings for OIDC enforcement', async () => {
    // 1. Initial state (should be false)
    let res = await agent.get('/strapi-plugin-oidc/settings/public');
    expect(res.status).toBe(200);
    expect(res.body.enforceOIDC).toBe(false);

    // Ensure normal local login is allowed
    const localLoginAllowed = await agent.post('/admin/login').send({
      email: 'test@test.com',
      password: 'password',
    });
    // It should not be a 403 Forbidden Error from our middleware
    expect(localLoginAllowed.status).not.toBe(403);

    // Ensure GET to /admin/auth/login doesn't redirect
    const getLoginAllowed = await agent
      .get('/admin/auth/login')
      .set('Accept', 'text/html')
      .redirects(0);
    expect(getLoginAllowed.status).not.toBe(302);

    // 2. Enable enforceOIDC in settings
    await setSettings(strapi, true, true);

    // 3. Check again
    res = await agent.get('/strapi-plugin-oidc/settings/public');
    expect(res.status).toBe(200);
    expect(res.body.enforceOIDC).toBe(true);

    // Ensure normal local login is blocked
    const localLoginBlocked = await agent.post('/admin/login').send({
      email: 'test@test.com',
      password: 'password',
    });
    // It should be blocked by our middleware
    expect(localLoginBlocked.status).toBe(403);
    expect(localLoginBlocked.body.error.message).toContain('Local login is disabled');

    // Ensure other POST auth routes are blocked
    const registerBlocked = await agent.post('/admin/register').send({});
    expect(registerBlocked.status).toBe(403);

    const forgotPasswordBlocked = await agent.post('/admin/forgot-password').send({});
    expect(forgotPasswordBlocked.status).toBe(403);

    const resetPasswordBlocked = await agent.post('/admin/reset-password').send({});
    expect(resetPasswordBlocked.status).toBe(403);

    // GET HTML routes should NOT redirect — enforcement is handled client-side via DOM removal
    const unauthAgent = request.agent(strapi.server.httpServer);

    const getLoginAllowedEnforced = await unauthAgent
      .get('/admin/auth/login')
      .set('Accept', 'text/html')
      .redirects(0);
    expect(getLoginAllowedEnforced.status).not.toBe(302);
  });

  it('should block login if whitelist is enabled and user is not in whitelist', async () => {
    await setSettings(strapi, true, false);

    const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
    const state = getStateFromLoginRes(loginRes);
    const callbackRes = await performCallback(agent, state);

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.text).toContain('Authentication Failed');
    expect(callbackRes.text).toContain('Authentication failed. Please try again.');
  });

  it('should fail if callback is missing code', async () => {
    const callbackRes = await agent
      .get('/strapi-plugin-oidc/oidc/callback?state=mock-state')
      .redirects(0);

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.text).toContain('Authentication Failed');
    expect(callbackRes.text).toContain(userFacingMessages.missing_code);
  });

  it('should fail if callback has invalid state', async () => {
    const callbackRes = await agent
      .get('/strapi-plugin-oidc/oidc/callback?code=mock-code&state=invalid-state')
      .redirects(0);

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.text).toContain('Authentication Failed');
    expect(callbackRes.text).toContain(userFacingMessages.invalid_state);
  });

  // ---------------------------------------------------------------------------
  // OIDC callback error handling
  // ---------------------------------------------------------------------------
  describe('OIDC callback error handling', () => {
    const assertInvalidTokenRejected = async (idToken: string) => {
      oidcServer.use(
        http.post('https://mock-oidc.com/token', () =>
          HttpResponse.json({ access_token: 'fake-jwt-token', id_token: idToken }),
        ),
      );
      const callbackUrl = await initiateLogin(agent);
      const res = await agent.get(callbackUrl).redirects(0);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Authentication Failed');
      expect(res.text).toContain('Authentication failed. Please try again.');
    };

    it('shows generic error when token exchange fails', async () => {
      oidcServer.use(
        http.post('https://mock-oidc.com/token', () => HttpResponse.json({}, { status: 401 })),
      );
      await assertGenericAuthError(agent, await initiateLogin(agent));
    });

    it('shows generic error when userinfo fetch fails', async () => {
      oidcServer.use(
        http.get('https://mock-oidc.com/userinfo', () => HttpResponse.json({}, { status: 503 })),
      );
      await assertGenericAuthError(agent, await initiateLogin(agent));
    });

    it('rejects a mismatched nonce in the ID token', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ nonce: 'wrong-nonce', sub: '1' })).toString(
        'base64url',
      );
      await assertInvalidTokenRejected(`${header}.${payload}.fakesig`);
    });

    it('rejects a malformed ID token', async () => {
      await assertInvalidTokenRejected('not.a.valid.jwt.at.all');
    });

    it('does not reflect user-supplied values in error responses', async () => {
      const res = await agent
        .get('/strapi-plugin-oidc/oidc/callback?code=mock-code&state=<script>alert(1)</script>')
        .redirects(0);

      expect(res.status).toBe(200);
      expect(res.text).not.toContain('<script>');
      expect(res.text).toContain(userFacingMessages.invalid_state);
    });

    it('token_exchange_failed produces token_exchange_failed audit action', async () => {
      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});
      oidcServer.use(
        http.post('https://mock-oidc.com/token', () => HttpResponse.json({}, { status: 401 })),
      );
      const callbackUrl = await initiateLogin(agent);
      await agent.get(callbackUrl).redirects(0);
      const logs = await queryAuditLog(strapi, 'token_exchange_failed');
      expect(logs.length).toBeGreaterThan(0);
    });

    it('nonce_mismatch produces nonce_mismatch audit action', async () => {
      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ nonce: 'wrong-nonce', sub: '1' })).toString(
        'base64url',
      );
      oidcServer.use(
        http.post('https://mock-oidc.com/token', () =>
          HttpResponse.json({
            access_token: 'fake-jwt-token',
            id_token: `${header}.${payload}.fakesig`,
          }),
        ),
      );
      const callbackUrl = await initiateLogin(agent);
      await agent.get(callbackUrl).redirects(0);
      const logs = await queryAuditLog(strapi, 'nonce_mismatch');
      expect(logs.length).toBeGreaterThan(0);
    });

    it('userinfo_fetch_failed produces login_failure audit action', async () => {
      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});
      oidcServer.use(
        http.get('https://mock-oidc.com/userinfo', () => HttpResponse.json({}, { status: 503 })),
      );
      const callbackUrl = await initiateLogin(agent);
      await agent.get(callbackUrl).redirects(0);
      const logs = await queryAuditLog(strapi, 'login_failure');
      expect(logs.length).toBeGreaterThan(0);
    });

    it('id_token_parse_failed produces login_failure audit action', async () => {
      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});
      oidcServer.use(
        http.post('https://mock-oidc.com/token', () =>
          HttpResponse.json({ access_token: 'fake-jwt-token', id_token: 'not.a.valid.jwt.at.all' }),
        ),
      );
      const callbackUrl = await initiateLogin(agent);
      await agent.get(callbackUrl).redirects(0);
      const logs = await queryAuditLog(strapi, 'login_failure');
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('EnforceOIDC Security', () => {
    // Helper to get cookies from a Set-Cookie header array
    const parseCookies = (res: Response): string[] => {
      const raw = res.headers['set-cookie'] as string | string[] | undefined;
      if (!raw) return [];
      return Array.isArray(raw) ? raw : [raw];
    };

    const isCookieExpired = (cookies: string[], name: string): boolean => {
      const cookie = cookies.find((c) => c.startsWith(`${name}=`));
      return !!cookie && /expires=Thu, 01 Jan 1970/i.test(cookie);
    };

    const logoutWithOidcSession = () =>
      request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/logout')
        .set('Cookie', 'oidc_authenticated=1')
        .redirects(0);

    beforeEach(async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', MOCK_OIDC_CONFIG);
      await setSettings(strapi, false, true);
    });

    afterAll(async () => {
      await setSettings(strapi, false, false);
    });

    describe('Pre-existing local sessions', () => {
      it('does not redirect GET admin pages — enforcement is client-side only', async () => {
        const res = await request(strapi.server.httpServer)
          .get('/admin/auth/login')
          .set('Cookie', 'strapi_admin_refresh=some-local-token')
          .set('Accept', 'text/html')
          .redirects(0);

        // No server-side redirect — DOM removal happens in the browser
        expect(res.status).not.toBe(302);
        expect(res.headers.location).not.toBe('/strapi-plugin-oidc/oidc');
      });

      it('allows admin HTML through when both strapi_admin_refresh and oidc_authenticated are present', async () => {
        const res = await request(strapi.server.httpServer)
          .get('/admin/auth/login')
          .set('Cookie', 'strapi_admin_refresh=some-oidc-token; oidc_authenticated=1')
          .set('Accept', 'text/html')
          .redirects(0);

        // Middleware passes through — should not redirect to our OIDC endpoint
        expect(res.headers.location).not.toBe('/strapi-plugin-oidc/oidc');
      });

      it('does not reject local sessions when enforceOIDC is disabled', async () => {
        await setSettings(strapi, false, false);

        const res = await request(strapi.server.httpServer)
          .get('/admin/auth/login')
          .set('Cookie', 'strapi_admin_refresh=some-local-token')
          .set('Accept', 'text/html')
          .redirects(0);

        // Middleware should not redirect to OIDC
        expect(res.headers.location).not.toBe('/strapi-plugin-oidc/oidc');
      });
    });

    describe('Direct API auth calls', () => {
      it('blocks POST /admin/login even when called directly (no browser)', async () => {
        const res = await request(strapi.server.httpServer)
          .post('/admin/login')
          .send({ email: 'admin@strapi.test', password: 'SuperAdmin123!' });

        expect(res.status).toBe(403);
        expect(res.body.error.message).toContain('Local login is disabled');
      });

      it('blocks POST /admin/register directly', async () => {
        const res = await request(strapi.server.httpServer)
          .post('/admin/register')
          .send({ registrationToken: 'some-token', userInfo: {} });

        expect(res.status).toBe(403);
      });

      it('blocks POST /admin/register-admin directly', async () => {
        const res = await request(strapi.server.httpServer).post('/admin/register-admin').send({
          firstname: 'Test',
          lastname: 'User',
          email: 'test@test.com',
          password: 'Password1!',
        });

        expect(res.status).toBe(403);
      });

      it('blocks POST /admin/forgot-password directly', async () => {
        const res = await request(strapi.server.httpServer)
          .post('/admin/forgot-password')
          .send({ email: 'admin@strapi.test' });

        expect(res.status).toBe(403);
      });
    });

    // -------------------------------------------------------------------------
    describe('Token refresh bypass prevention', () => {
      it('returns 401 for token refresh when only strapi_admin_refresh is present (local session)', async () => {
        const res = await request(strapi.server.httpServer)
          .post('/admin/token/refresh')
          .set('Cookie', 'strapi_admin_refresh=some-local-token');

        expect(res.status).toBe(401);
        expect(res.body.error.message).toContain('OIDC');
      });

      it('returns 401 for token refresh with no session cookies at all', async () => {
        const res = await request(strapi.server.httpServer).post('/admin/token/refresh');

        expect(res.status).toBe(401);
        expect(res.body.error.message).toContain('OIDC');
      });

      it('passes token refresh through to Strapi when oidc_authenticated is present', async () => {
        const res = await request(strapi.server.httpServer)
          .post('/admin/token/refresh')
          .set('Cookie', 'strapi_admin_refresh=some-oidc-token; oidc_authenticated=1');

        // Our middleware passes it through — Strapi may return 401 for the invalid
        // token itself, but the error must NOT be our OIDC enforcement message
        if (res.status === 401) {
          expect(res.body?.error?.message).not.toContain('OIDC');
        }
      });

      it('does not block token refresh when enforceOIDC is disabled', async () => {
        await setSettings(strapi, false, false);

        const res = await request(strapi.server.httpServer)
          .post('/admin/token/refresh')
          .set('Cookie', 'strapi_admin_refresh=some-local-token');

        // Our middleware must not return our specific 401 message
        if (res.status === 401) {
          expect(res.body?.error?.message).not.toContain('OIDC');
        }
      });
    });

    // -------------------------------------------------------------------------
    // Cookie lifecycle: oidc_authenticated is set and cleared correctly
    // -------------------------------------------------------------------------
    describe('oidc_authenticated cookie lifecycle', () => {
      it('sets oidc_authenticated cookie after a successful OIDC callback', async () => {
        await setSettings(strapi, false, false);
        const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
        const state = getStateFromLoginRes(loginRes);
        const callbackRes = await performCallback(agent, state);

        expect(callbackRes.status).toBe(200);

        const cookies = parseCookies(callbackRes);
        const oidcCookie = cookies.find((c) => c.startsWith('oidc_authenticated='));
        expect(oidcCookie).toBeDefined();
        expect(oidcCookie).toContain('oidc_authenticated=1');
      });

      it('clears oidc_authenticated cookie on logout', async () => {
        const res = await logoutWithOidcSession();

        expect(res.status).toBe(302);

        const cookies = parseCookies(res);
        expect(isCookieExpired(cookies, 'oidc_authenticated')).toBe(true);
        expect(isCookieExpired(cookies, 'strapi_admin_refresh')).toBe(true);
      });
    });

    // -------------------------------------------------------------------------
    // Selective OIDC logout redirect
    // -------------------------------------------------------------------------
    describe('Selective OIDC logout redirect', () => {
      it('redirects to OIDC logout URL when oidc_authenticated cookie is present', async () => {
        const res = await logoutWithOidcSession();

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('https://mock-oidc.com/logout');
      });

      it('redirects to admin login when oidc_authenticated cookie is absent (non-OIDC session)', async () => {
        strapi.config.set('admin.url', '/admin');

        const res = await request(strapi.server.httpServer)
          .get('/strapi-plugin-oidc/logout')
          .redirects(0); // no oidc_authenticated cookie

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/admin/auth/login');
        expect(res.headers.location).not.toBe('https://mock-oidc.com/logout');
      });

      it('logout with unreachable IdP completes within 5s and redirects to admin login', async () => {
        oidcServer.use(http.get('https://mock-oidc.com/userinfo', () => new Promise(() => {})));

        const startTime = Date.now();

        const res = await request(strapi.server.httpServer)
          .get('/strapi-plugin-oidc/logout')
          .set(
            'Cookie',
            'oidc_authenticated=1; oidc_access_token=test-token; oidc_user_email=test@test.com',
          )
          .redirects(0);

        const elapsed = Date.now() - startTime;

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/admin/auth/login');
        expect(elapsed).toBeLessThan(5000);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Group-to-role mapping
  // ---------------------------------------------------------------------------
  // Run serially to avoid MSW handler stacking from parallel execution
  describe('Group-to-role mapping', { serial: true }, () => {
    beforeAll(async () => {
      // Ensure the default OIDC role record exists with at least one valid role,
      // so tests that rely on it are not dependent on pre-seeded database state.
      const existing = await strapi
        .query('plugin::strapi-plugin-oidc.roles')
        .findOne({ where: { oauth_type: '4' } });

      if (!existing?.roles?.length) {
        const defaultRole =
          (await strapi.db.query('admin::role').findOne({ where: { code: 'strapi-editor' } })) ??
          (await strapi.db.query('admin::role').findMany({ limit: 1 }))[0];

        if (defaultRole) {
          if (existing) {
            await strapi.query('plugin::strapi-plugin-oidc.roles').update({
              where: { oauth_type: '4' },
              data: { roles: [defaultRole.id.toString()] },
            });
          } else {
            await strapi.query('plugin::strapi-plugin-oidc.roles').create({
              data: { oauth_type: '4', roles: [defaultRole.id.toString()] },
            });
          }
        }
      }
    });

    beforeEach(async () => {
      // Reset MSW handlers and restore default config before each test
      // to prevent handler stacking from parallel test execution
      oidcServer.resetHandlers();
      clearRateLimitMap();
      strapi.config.set('plugin::strapi-plugin-oidc', MOCK_OIDC_CONFIG);
      await setSettings(strapi, false, false);
    });

    afterEach(async () => {
      // Clean up any test users created in this describe block
      const emails = [
        'group-match@test.com',
        'no-match@test.com',
        'no-groups@test.com',
        'whitelist-group@test.com',
        'existing-group@test.com',
        'role-priority@test.com',
        'role-removed@test.com',
        'group-changed@test.com',
      ];
      await Promise.all(
        emails.map((email) => strapi.db.query('admin::user').deleteMany({ where: { email } })),
      );
      await strapi.db
        .query('plugin::strapi-plugin-oidc.whitelists')
        .deleteMany({ where: { email: 'whitelist-group@test.com' } });
    });

    it('new user with matching group → gets group-mapped role', async () => {
      const targetRole = await getFirstAvailableRole(strapi);

      oidcServer.use(
        http.get('https://mock-oidc.com/userinfo', () =>
          HttpResponse.json({
            email: 'group-match@test.com',
            family_name: 'Test',
            given_name: 'User',
            groups: ['test-group'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, { 'test-group': [targetRole.name] });

      const agent = createAgent();
      await initiateLoginAndCallback(agent);

      const user = await fetchUserWithRoles(strapi, 'group-match@test.com');
      expect(user).not.toBeNull();
      expect(user.roles).toBeDefined();
      expect(user.roles.length).toBeGreaterThan(0);
      expect(user.roles.some((r: { id: number }) => r.id === targetRole.id)).toBe(true);
    });

    it('login with group-mapped role → audit log user_created details include mapped role name', async () => {
      const targetRole = await getFirstAvailableRole(strapi);

      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});
      await strapi.db.query('admin::user').deleteMany({ where: { email: 'audit-role@test.com' } });

      oidcServer.use(
        http.get('https://mock-oidc.com/userinfo', () =>
          HttpResponse.json({
            email: 'audit-role@test.com',
            family_name: 'Test',
            given_name: 'User',
            groups: ['audit-group'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, { 'audit-group': [targetRole.name] });

      const agent = createAgent();
      await initiateLoginAndCallback(agent);

      const logs = await queryAuditLog(strapi, 'user_created');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].detailsKey).toBe('user_created');
      expect(logs[0].detailsParams).toBeDefined();
      expect(logs[0].detailsParams.roles).toContain(targetRole.name);
    });

    it('new user with non-matching group → falls back to default OIDC roles', async () => {
      const defaultRoleIds = await getDefaultOidcRoleIds(strapi);
      expect(defaultRoleIds.length).toBeGreaterThan(0);

      const user = await loginAndFetchUser(
        strapi,
        'no-match@test.com',
        mswUserInfoHandler('no-match@test.com', 'Test', 'User', ['unknown-group']),
        { 'some-other-group': ['SomeFakeRole'] },
      );
      expect(user).not.toBeNull();
      const userRoleIds = user.roles.map((r: { id: number }) => String(r.id));
      expect(userRoleIds).toEqual(expect.arrayContaining(defaultRoleIds));
    });

    it('new user with no groups claim → falls back to default OIDC roles', async () => {
      const defaultRoleIds = await getDefaultOidcRoleIds(strapi);
      expect(defaultRoleIds.length).toBeGreaterThan(0);

      const user = await loginAndFetchUser(
        strapi,
        'no-groups@test.com',
        mswUserInfoHandler('no-groups@test.com', 'Test', 'User', []),
        { 'any-group': ['SomeFakeRole'] },
      );
      expect(user).not.toBeNull();
      const userRoleIds = user.roles.map((r: { id: number }) => String(r.id));
      expect(userRoleIds).toEqual(expect.arrayContaining(defaultRoleIds));
    });

    it('group mapping takes priority over default OIDC role', async () => {
      const defaultRoleIds = await getDefaultOidcRoleIds(strapi);
      expect(defaultRoleIds.length).toBeGreaterThan(0);

      const allRoles = await strapi.db.query('admin::role').findMany();
      const mappedRole = allRoles.find((r) => !defaultRoleIds.includes(String(r.id)));
      if (!mappedRole) return;

      const user = await loginAndFetchUser(
        strapi,
        'role-priority@test.com',
        mswUserInfoHandler('role-priority@test.com', 'Test', 'User', ['priority-group']),
        { 'priority-group': [mappedRole.name] },
      );
      const userRoleIds = user.roles.map((r: { id: number }) => String(r.id));
      expect(userRoleIds).toContain(String(mappedRole.id));
      expect(userRoleIds).not.toEqual(expect.arrayContaining(defaultRoleIds));
    });

    it('existing user → group mapping removed → user keeps last known roles', async () => {
      const availableRoles = await strapi.db.query('admin::role').findMany();
      if (availableRoles.length < 2) return;

      const roleB = availableRoles[1];

      await strapi.db.query('admin::user').create({
        data: {
          email: 'role-removed@test.com',
          firstname: 'Existing',
          lastname: 'User',
          roles: [roleB.id],
        },
      });

      oidcServer.use(
        http.get('https://mock-oidc.com/userinfo', () =>
          HttpResponse.json({
            email: 'role-removed@test.com',
            family_name: 'Existing',
            given_name: 'User',
            groups: ['no-longer-mapped-group'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, {});

      const agent = createAgent();
      await initiateLoginAndCallback(agent);

      const user = await fetchUserWithRoles(strapi, 'role-removed@test.com');
      const userRoleIds = user.roles.map((r: { id: number }) => String(r.id));
      expect(userRoleIds).toContain(String(roleB.id));
    });

    it('existing user → groups change between logins → role updates to new mapping', async () => {
      const allRoles = await strapi.db.query('admin::role').findMany();
      if (allRoles.length < 2) return;

      const roleA = allRoles[0];
      const roleB = allRoles[1];

      await strapi.db.query('admin::user').create({
        data: {
          email: 'group-changed@test.com',
          firstname: 'Existing',
          lastname: 'User',
          roles: [roleA.id],
        },
      });

      oidcServer.use(
        http.get('https://mock-oidc.com/userinfo', () =>
          HttpResponse.json({
            email: 'group-changed@test.com',
            family_name: 'Existing',
            given_name: 'User',
            groups: ['group-b'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, {
        'group-a': [roleA.name],
        'group-b': [roleB.name],
      });

      const agent = createAgent();
      await initiateLoginAndCallback(agent);

      const user = await fetchUserWithRoles(strapi, 'group-changed@test.com');
      const userRoleIds = user.roles.map((r: { id: number }) => r.id);
      expect(userRoleIds).toContain(roleB.id);
      expect(userRoleIds).not.toContain(roleA.id);
    });

    it('whitelisted user with matching group → login succeeds and user gets group-mapped role', async () => {
      const targetRole = await getFirstAvailableRole(strapi);

      const whitelistService = strapi
        .plugin('strapi-plugin-oidc')
        .service('whitelist') as WhitelistService;
      await whitelistService.registerUser('whitelist-group@test.com');

      oidcServer.use(
        http.get('https://mock-oidc.com/userinfo', () =>
          HttpResponse.json({
            email: 'whitelist-group@test.com',
            family_name: 'Test',
            given_name: 'User',
            groups: ['special-group'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, { 'special-group': [targetRole.name] });
      await setSettings(strapi, true, false);

      const agent = createAgent();
      const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
      const state = getStateFromLoginRes(loginRes);
      const callbackRes = await performCallback(agent, state);

      expect(callbackRes.status).toBe(200);
      expect(callbackRes.text).toContain('jwtToken');

      const user = await fetchUserWithRoles(strapi, 'whitelist-group@test.com');
      const userRoleIds = user.roles.map((r: { id: number }) => r.id);
      expect(userRoleIds).toContain(targetRole.id);
    });

    it('existing user → roles are re-synced from group mapping on login', async () => {
      const availableRoles = await strapi.db.query('admin::role').findMany();
      expect(availableRoles.length).toBeGreaterThan(0);
      const initialRole = availableRoles[0];
      const groupMappedRole = availableRoles.find((r) => r.id !== initialRole.id) ?? initialRole;

      await strapi.db.query('admin::user').create({
        data: {
          email: 'existing-group@test.com',
          firstname: 'Existing',
          lastname: 'User',
          roles: [initialRole.id],
        },
      });

      oidcServer.use(
        http.get('https://mock-oidc.com/userinfo', () =>
          HttpResponse.json({
            email: 'existing-group@test.com',
            family_name: 'Existing',
            given_name: 'User',
            groups: ['some-group'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, { 'some-group': [groupMappedRole.name] });

      const agent = createAgent();
      await initiateLoginAndCallback(agent);

      const user = await fetchUserWithRoles(strapi, 'existing-group@test.com');
      const userRoleIds = user.roles.map((r: { id: number }) => r.id);
      expect(userRoleIds).toContain(groupMappedRole.id);
    });

    it('existing user with no roles → login assigns OIDC roles', async () => {
      const availableRoles = await strapi.db.query('admin::role').findMany();
      if (availableRoles.length < 2) return;

      const roleA = availableRoles[0];

      await strapi.db.query('admin::user').create({
        data: {
          email: 'no-role-user@test.com',
          firstname: 'Existing',
          lastname: 'User',
          roles: [],
        },
      });

      oidcServer.use(
        http.get('https://mock-oidc.com/userinfo', () =>
          HttpResponse.json({
            email: 'no-role-user@test.com',
            family_name: 'Existing',
            given_name: 'User',
            groups: ['group-a'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, { 'group-a': [roleA.name] });

      const agent = createAgent();
      await initiateLoginAndCallback(agent);

      const user = await fetchUserWithRoles(strapi, 'no-role-user@test.com');
      const userRoleIds = user.roles.map((r: { id: number }) => r.id);
      expect(userRoleIds).toContain(roleA.id);
    });
  });
});
