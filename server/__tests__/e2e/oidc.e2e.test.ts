import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { oidcServer } from './setup';
import type { Core } from './test-types';
import {
  MOCK_OIDC_CONFIG,
  setSettings,
  applyDefaultOidcConfig,
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
  setupGroupRoleMapping,
  fetchUserWithRoles,
  getFirstAvailableRole,
  loginAndExpectSuccess,
  expectUserRoleIdsToContain,
  storeNonceFromResponse,
} from './test-helpers';
import { t } from '../../i18n';
import type { WhitelistService } from '../../types';
import { getOidcSignInUrl } from '../../../admin/src/utils/shouldRedirect';
import { runInNewContext } from 'node:vm';

const createAgent = () => request.agent(strapi.server.httpServer);

describe('OIDC E2E Tests', () => {
  let strapi: Core.Strapi;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    agent = request.agent(strapi.server.httpServer);

    clearRateLimitMap();
    await applyDefaultOidcConfig(strapi);
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
    storeNonceFromResponse(loginRes);
    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toContain('https://mock-oidc.com/authorize');
    const state = getStateFromLoginRes(loginRes);
    expect(state).toBeDefined();

    const callbackRes = await performCallback(agent, state);
    expect(callbackRes.status).toBe(200);
    expect(callbackRes.text).toContain('jwtToken');
    expect(callbackRes.text).toContain('localStorage.setItem');
    expect(callbackRes.headers['content-security-policy']).toMatch(
      /^script-src 'nonce-[a-f0-9-]+'$/,
    );
    const expired = callbackRes.headers['set-cookie'] as unknown as string[];
    for (const name of ['oidc_state', 'oidc_code_verifier', 'oidc_nonce', 'oidc_redirect']) {
      expect(expired.find((cookie) => cookie.startsWith(`${name}=`))).toContain(
        'expires=Thu, 01 Jan 1970',
      );
    }
  });

  it('should expose public settings for OIDC enforcement', async () => {
    // Skip-login-page redirects interfere with enforcement testing — disable it for this test.
    strapi.config.set('plugin::strapi-plugin-oidc', {
      ...MOCK_OIDC_CONFIG,
      OIDC_SKIP_LOGIN_PAGE: null,
    });
    await setSettings(strapi, false, false, false);

    let res = await agent.get('/strapi-plugin-oidc/settings/public');
    expect(res.status).toBe(200);
    expect(res.body.enforceOIDC).toBe(false);

    const localLoginAllowed = await agent.post('/admin/login').send({
      email: 'test@test.com',
      password: 'password',
    });
    expect(localLoginAllowed.status).not.toBe(403);

    const getLoginAllowed = await agent
      .get('/admin/auth/login')
      .set('Accept', 'text/html')
      .redirects(0);
    expect(getLoginAllowed.status).not.toBe(302);

    await setSettings(strapi, true, true, false);

    res = await agent.get('/strapi-plugin-oidc/settings/public');
    expect(res.status).toBe(200);
    expect(res.body.enforceOIDC).toBe(true);

    const localLoginBlocked = await agent.post('/admin/login').send({
      email: 'test@test.com',
      password: 'password',
    });
    expect(localLoginBlocked.status).toBe(403);
    expect(localLoginBlocked.body.error.message).toContain('Local login is disabled');

    const registerBlocked = await agent.post('/admin/register').send({});
    expect(registerBlocked.status).toBe(403);

    const forgotPasswordBlocked = await agent.post('/admin/forgot-password').send({});
    expect(forgotPasswordBlocked.status).toBe(403);

    const resetPasswordBlocked = await agent.post('/admin/reset-password').send({});
    expect(resetPasswordBlocked.status).toBe(403);

    // GET HTML routes should NOT redirect — enforcement is handled client-side via DOM removal.
    const unauthAgent = request.agent(strapi.server.httpServer);

    const getLoginAllowedEnforced = await unauthAgent
      .get('/admin/auth/login')
      .set('Accept', 'text/html')
      .redirects(0);
    expect(getLoginAllowedEnforced.status).not.toBe(302);

    strapi.config.set('plugin::strapi-plugin-oidc', MOCK_OIDC_CONFIG);
    await setSettings(strapi, false, false, false);
  });

  describe('post-login destination', () => {
    let savedAdminUrl: unknown;

    beforeEach(async () => {
      savedAdminUrl = strapi.config.get('admin.url');
      strapi.config.set('admin.url', '/admin');
      await applyDefaultOidcConfig(strapi);
    });

    afterEach(() => {
      strapi.config.set('admin.url', savedAdminUrl);
      strapi.config.set('plugin::strapi-plugin-oidc', MOCK_OIDC_CONFIG);
    });

    function getSuccessDestination(html: string): string {
      const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
      expect(script).toBeDefined();
      const location = { href: '' };
      runInNewContext(script!, {
        window: { addEventListener: (_event: string, callback: () => void) => callback() },
        document: { cookie: '' },
        localStorage: { setItem: () => {} },
        location,
      });
      return location.href;
    }

    async function completeLogin(signInUrl: string): Promise<string> {
      const loginAgent = createAgent();
      const login = await loginAgent.get(signInUrl).redirects(0);
      expect(login.status).toBe(302);
      storeNonceFromResponse(login);
      const response = await performCallback(loginAgent, getStateFromLoginRes(login));
      expect(response.status).toBe(200);
      expect(response.text).toContain('jwtToken');
      return getSuccessDestination(response.text);
    }

    it.each([
      [
        '/admin',
        '/content-manager/collection-types/api::lesson.lesson/create?value=a%26b#details',
        true,
        '/admin/content-manager/collection-types/api::lesson.lesson/create?value=a%26b#details',
      ],
      ['/admin', '/admin/content-manager', false, '/admin/content-manager'],
      ['/dashboard/', '/content-manager', false, '/dashboard/content-manager'],
      [
        'https://admin.example/dashboard',
        '/content-manager',
        true,
        'https://admin.example/dashboard/content-manager',
      ],
    ])('preserves %s destination %s through SSO', async (adminUrl, target, automatic, expected) => {
      strapi.config.set('admin.url', adminUrl);
      const pathname = `${new URL(adminUrl, 'https://example.com').pathname.replace(/\/$/, '')}/auth/login`;
      const signInUrl = getOidcSignInUrl(
        { pathname, search: `?${new URLSearchParams({ redirectTo: target })}`, hash: '' },
        automatic,
      );
      expect(await completeLogin(signInUrl)).toBe(expected);
    });

    it('preserves a deep link before the login page has mounted', async () => {
      const signInUrl = getOidcSignInUrl(
        { pathname: '/admin/content-manager', search: '?value=a%26b', hash: '#details' },
        true,
      );
      expect(await completeLogin(signInUrl)).toBe('/admin/content-manager?value=a%26b#details');
    });

    it.each([
      '/admin/content-manager?value=a%26b',
      '/admin/auth/login?redirectTo=%2Fcontent-manager%3Fvalue%3Da%2526b',
    ])('preserves the destination through the server-side redirect from %s', async (url) => {
      const redirect = await request(strapi.server.httpServer).get(url).redirects(0);
      expect(redirect.status).toBe(302);
      expect(await completeLogin(redirect.headers.location)).toBe(
        '/admin/content-manager?value=a%26b',
      );
    });

    it('rejects protocol-relative paths after URL normalization when admin is mounted at root', async () => {
      strapi.config.set('admin.url', '/');
      expect(
        await completeLogin('/strapi-plugin-oidc/oidc?redirectTo=%2F..%2F%2Fevil.example'),
      ).toBe('/');
    });

    it('preserves destinations with Secure cookies', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        ...MOCK_OIDC_CONFIG,
        OIDC_FORCE_SECURE_COOKIES: true,
      });
      const login = await request(strapi.server.httpServer).get(
        '/strapi-plugin-oidc/oidc?redirectTo=%2Fcontent-manager',
      );
      expect(login.status).toBe(302);
      storeNonceFromResponse(login);
      const cookies = login.headers['set-cookie'] as unknown as string[];
      const destinationCookie = cookies.find((cookie) =>
        cookie.startsWith('__Host-oidc_redirect='),
      );
      expect(destinationCookie).toContain('; secure');
      expect(destinationCookie).toContain('; httponly');
      const response = await request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/oidc/callback')
        .set('Cookie', cookies.map((cookie) => cookie.split(';')[0]).join('; '))
        .query({ code: 'mock-code', state: getStateFromLoginRes(login) });
      expect(getSuccessDestination(response.text)).toBe('/admin/content-manager');
      const expired = response.headers['set-cookie'] as unknown as string[];
      expect(expired.find((cookie) => cookie.startsWith('__Host-oidc_redirect='))).toContain(
        'expires=Thu, 01 Jan 1970',
      );
    });

    it('preserves the destination when automatic SSO falls back to the login page', async () => {
      await setSettings(strapi, false, false, false);
      const target = '/content-manager?value=a%26b#details';
      const automatic = getOidcSignInUrl(
        {
          pathname: '/admin/auth/login',
          search: `?${new URLSearchParams({ redirectTo: target })}`,
          hash: '',
        },
        true,
      );
      const bounce = await request(strapi.server.httpServer).get(automatic).redirects(0);
      const loginUrl = new URL(bounce.headers.location, 'https://example.com');
      expect(loginUrl.pathname).toBe('/admin/auth/login');
      expect(loginUrl.searchParams.get('oidc_redirect')).toBe('1');
      const manual = getOidcSignInUrl(loginUrl);
      expect(new URL(manual, loginUrl).searchParams.has('oidc_redirect')).toBe(false);
      expect(await completeLogin(manual)).toBe('/admin/content-manager?value=a%26b#details');
    });

    it.each([
      'https://evil.example/admin',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/admin/../outside',
      '/admin/%2e%2e/outside',
      '/admin/auth/login',
      '/auth/login',
      '/admin/%61uth/login',
      '/admin/logout',
      '/admin/\nauth/login',
      '/admin/%E0%A4%A',
      '/content-manager' + 'a'.repeat(4000),
    ])('falls back to admin home for unsafe destination %#', async (target) => {
      const query = new URLSearchParams({ redirectTo: target });
      expect(await completeLogin(`/strapi-plugin-oidc/oidc?${query}`)).toBe('/admin');
    });

    it('safely serializes destination text into the success-page script', async () => {
      const target =
        '/content-manager?quote=%27&value=a%26b#</script><script>throw "injected"</script>';
      const expected = new URL(`/admin${target}`, 'https://example.com');
      expect(
        await completeLogin(
          `/strapi-plugin-oidc/oidc?${new URLSearchParams({ redirectTo: target })}`,
        ),
      ).toBe(`${expected.pathname}${expected.search}${expected.hash}`);
    });

    it('does not reuse a destination cookie from a different login state', async () => {
      const loginAgent = createAgent();
      const previous = await loginAgent
        .get('/strapi-plugin-oidc/oidc?redirectTo=%2Fcontent-manager')
        .redirects(0);
      const current = await loginAgent.get('/strapi-plugin-oidc/oidc').redirects(0);
      storeNonceFromResponse(current);
      const oldCookies = previous.headers['set-cookie'] as unknown as string[];
      const currentCookies = current.headers['set-cookie'] as unknown as string[];
      const cookies = [
        ...currentCookies.filter((cookie) => !cookie.startsWith('oidc_redirect')),
        ...oldCookies.filter((cookie) => cookie.startsWith('oidc_redirect')),
      ];
      const response = await request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/oidc/callback')
        .set('Cookie', cookies.map((cookie) => cookie.split(';')[0]).join('; '))
        .query({
          code: 'mock-code',
          state: getStateFromLoginRes(current),
          redirectTo: '//evil.example',
        });
      expect(getSuccessDestination(response.text)).toBe('/admin');
    });
  });

  it('should block login if whitelist is enabled and user is not in whitelist', async () => {
    await setSettings(strapi, true, false);

    const callbackRes = await loginAndExpectSuccess(agent);
    expect(callbackRes.text).toContain('Authentication Failed');
    expect(callbackRes.text).toContain('Authentication failed. Please try again.');
    expect(callbackRes.headers['content-security-policy']).toMatch(
      /^script-src 'nonce-[a-f0-9-]+'$/,
    );
  });

  const assertCallbackError = async (url: string, expectedMsg: string) => {
    const res = await agent.get(url).redirects(0);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Authentication Failed');
    expect(res.text).toContain(expectedMsg);
    expect(res.headers['content-security-policy']).toMatch(/^script-src 'nonce-[a-f0-9-]+'$/);
  };

  it('should fail if callback is missing code', async () => {
    await assertCallbackError(
      '/strapi-plugin-oidc/oidc/callback?state=mock-state',
      t('en', 'user.missing_code'),
    );
  });

  it('should fail if callback has invalid state', async () => {
    await assertCallbackError(
      '/strapi-plugin-oidc/oidc/callback?code=mock-code&state=invalid-state',
      t('en', 'user.invalid_state'),
    );
  });

  describe('OIDC callback error handling', () => {
    it.each([
      ['access_denied', true, 'user.authorization_denied', 'login_failure'],
      ['server_error', true, 'user.signInError', 'login_failure'],
      ['access_denied', false, 'user.invalid_state', 'state_mismatch'],
    ])(
      'handles provider error %s with matching state=%s',
      async (error, validState, messageKey, action) => {
        const loginAgent = createAgent();
        const login = await loginAgent.get('/strapi-plugin-oidc/oidc').redirects(0);
        expect(login.status).toBe(302);
        const state = getStateFromLoginRes(login)!;
        let tokenRequests = 0;
        oidcServer.use(
          http.post('https://mock-oidc.com/token', () => {
            tokenRequests++;
            return HttpResponse.json({}, { status: 500 });
          }),
        );
        await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});

        const response = await loginAgent
          .get('/strapi-plugin-oidc/oidc/callback')
          .query({
            error,
            state: validState ? state : 'wrong-state',
            error_description: '<script>alert("untrusted-provider-error")</script>\r\nforged log',
          })
          .redirects(0);

        expect(response.status).toBe(200);
        expect(response.text).toContain(t('en', messageKey));
        expect(response.text).not.toContain('untrusted-provider-error');
        expect(response.headers['content-security-policy']).toMatch(
          /^script-src 'nonce-[a-f0-9-]+'$/,
        );
        const cookies = response.headers['set-cookie'] as unknown as string[];
        expect(
          cookies.every((cookie) =>
            /^(oidc_state|oidc_code_verifier|oidc_nonce|oidc_redirect)(\.sig)?=/.test(cookie),
          ),
        ).toBe(true);
        for (const name of ['oidc_state', 'oidc_code_verifier', 'oidc_nonce', 'oidc_redirect']) {
          expect(cookies.find((cookie) => cookie.startsWith(`${name}=`))).toContain(
            'expires=Thu, 01 Jan 1970',
          );
        }
        const logs = await queryAuditLog(strapi, action);
        expect(logs).toHaveLength(1);
        expect(JSON.stringify(logs)).not.toContain('untrusted-provider-error');

        const replay = await loginAgent
          .get('/strapi-plugin-oidc/oidc/callback')
          .query({ code: 'mock-code', state })
          .redirects(0);
        expect(replay.text).toContain(t('en', 'user.invalid_state'));
        expect(tokenRequests).toBe(0);
      },
    );

    const assertInvalidTokenRejected = async (idToken: string) => {
      oidcServer.use(
        http.post('https://mock-oidc.com/token', () =>
          HttpResponse.json({ access_token: 'fake-jwt-token', id_token: idToken }),
        ),
      );
      const callbackUrl = await initiateLogin(agent);
      const res = await assertGenericAuthError(agent, callbackUrl);
      expect(res.headers['content-security-policy']).toMatch(/^script-src 'nonce-[a-f0-9-]+'$/);
    };

    it.each([
      {
        scenario: 'token exchange fails',
        handler: http.post('https://mock-oidc.com/token', () =>
          HttpResponse.json({}, { status: 401 }),
        ),
        auditAction: 'login_failure',
      },
      {
        scenario: 'token response lacks access_token',
        handler: http.post('https://mock-oidc.com/token', () =>
          HttpResponse.json({ error: 'invalid_grant' }, { status: 200 }),
        ),
        auditAction: 'login_failure',
      },
      {
        scenario: 'userinfo fetch fails',
        handler: http.get('https://mock-oidc.com/userinfo', () =>
          HttpResponse.json({}, { status: 503 }),
        ),
        auditAction: 'login_failure',
      },
    ])(
      'shows generic error and logs $auditAction when $scenario',
      async ({ handler, auditAction }) => {
        await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});
        oidcServer.use(handler);
        await assertGenericAuthError(agent, await initiateLogin(agent));
        const rows = await queryAuditLog(strapi, auditAction);
        expect(rows.length).toBeGreaterThan(0);
      },
    );

    it('rejects a malformed ID token and logs login_failure', async () => {
      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});

      // A structurally well-formed JWS (3 base64url segments, valid JSON header
      // and payload) with a bogus signature. Establishing the token is
      // structurally decodable up front means the rejection cannot stem from
      // JWT parsing — it must come from signature/claims verification. So a
      // future refactor that silently accepts well-formed-but-unsigned tokens
      // still fails this assertion.
      const b64url = (obj: unknown) =>
        Buffer.from(JSON.stringify(obj))
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
      const malformedIdToken = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url({
        sub: 'test',
      })}.${'invalid-signature'}`;

      const segments = malformedIdToken.split('.');
      expect(segments).toHaveLength(3);
      expect(() =>
        JSON.parse(Buffer.from(segments[0], 'base64url').toString('utf8')),
      ).not.toThrow();
      expect(() =>
        JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')),
      ).not.toThrow();

      await assertInvalidTokenRejected(malformedIdToken);
      const rows = await queryAuditLog(strapi, 'login_failure');
      expect(rows.length).toBeGreaterThan(0);
      const detailParams = rows[0]?.detailsParams as Record<string, string> | undefined;
      expect(detailParams?.message).toBeTruthy();
    });

    it('does not reflect user-supplied values in error responses', async () => {
      const res = await agent
        .get('/strapi-plugin-oidc/oidc/callback?code=mock-code&state=<script>alert(1)</script>')
        .redirects(0);

      expect(res.status).toBe(200);
      expect(res.text).not.toContain('<script>');
      expect(res.text).toContain(t('en', 'user.invalid_state'));
    });
  });

  describe('OIDC sign-in error handling', () => {
    it('renders sign-in error page when required config is missing', async () => {
      const savedConfig = strapi.config.get('plugin::strapi-plugin-oidc');
      strapi.config.set('plugin::strapi-plugin-oidc', {
        ...MOCK_OIDC_CONFIG,
        OIDC_CLIENT_ID: '',
      });

      try {
        const res = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
        expect(res.status).toBe(200);
        expect(res.text).toContain('Authentication Failed');
      } finally {
        strapi.config.set('plugin::strapi-plugin-oidc', savedConfig);
      }
    });
  });

  describe('email_verified enforcement', () => {
    const assertEmailVerifiedRejected = async (overrides: Record<string, unknown>) => {
      oidcServer.use(userinfoWith(overrides));
      const callbackRes = await loginAndExpectSuccess(createAgent());
      expect(callbackRes.text).toContain('Authentication Failed');
      const logs = await queryAuditLog(strapi, 'email_not_verified');
      expect(logs.length).toBeGreaterThan(0);
    };

    const userinfoWith = (overrides: Record<string, unknown>) =>
      http.get('https://mock-oidc.com/userinfo', () =>
        HttpResponse.json({
          sub: 'mock-sub',
          email: 'verify-test@company.com',
          family_name: 'Doe',
          given_name: 'John',
          ...overrides,
        }),
      );

    beforeEach(async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', MOCK_OIDC_CONFIG);
      await setSettings(strapi, false, false);
      await strapi.db
        .query('admin::user')
        .deleteMany({ where: { email: 'verify-test@company.com' } });
      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});
    });

    it('accepts email_verified: true (boolean)', async () => {
      oidcServer.use(userinfoWith({ email_verified: true }));
      const callbackRes = await loginAndExpectSuccess(createAgent());
      expect(callbackRes.text).toContain('jwtToken');
    });

    it('accepts email_verified: "true" (string)', async () => {
      oidcServer.use(userinfoWith({ email_verified: 'true' }));
      const callbackRes = await loginAndExpectSuccess(createAgent());
      expect(callbackRes.text).toContain('jwtToken');
    });

    it('rejects email_verified: false and emits email_not_verified audit action', async () => {
      await assertEmailVerifiedRejected({ email_verified: false });
    });

    it('rejects when email_verified claim is missing (default)', async () => {
      await assertEmailVerifiedRejected({});
    });

    it('allows missing email_verified when OIDC_REQUIRE_EMAIL_VERIFIED is disabled', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        ...MOCK_OIDC_CONFIG,
        OIDC_REQUIRE_EMAIL_VERIFIED: false,
      });
      oidcServer.use(userinfoWith({}));
      const callbackRes = await loginAndExpectSuccess(createAgent());
      expect(callbackRes.text).toContain('jwtToken');
    });
  });

  describe('EnforceOIDC Security', () => {
    const parseCookies = (res: {
      headers: Record<string, string | string[] | undefined>;
    }): string[] => {
      const raw = res.headers['set-cookie'];
      if (!raw) return [];
      return Array.isArray(raw) ? raw : [raw];
    };

    const isCookieExpired = (cookies: string[], name: string): boolean => {
      const cookie = cookies.find((c) => c.startsWith(`${name}=`));
      return !!cookie && /expires=Thu, 01 Jan 1970/i.test(cookie);
    };

    const logoutWithOidcSession = () =>
      request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/logout')
        .set('Cookie', 'oidc_id_token=1')
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

        // No server-side redirect — DOM removal happens in the browser.
        expect(res.status).not.toBe(302);
        expect(res.headers.location).not.toBe('/strapi-plugin-oidc/oidc');
      });

      it('allows admin HTML through when both strapi_admin_refresh and oidc_id_token are present', async () => {
        const res = await request(strapi.server.httpServer)
          .get('/admin/auth/login')
          .set('Cookie', 'strapi_admin_refresh=some-oidc-token; oidc_id_token=1')
          .set('Accept', 'text/html')
          .redirects(0);

        expect(res.headers.location).not.toBe('/strapi-plugin-oidc/oidc');
      });

      it('does not reject local sessions when enforceOIDC is disabled', async () => {
        await setSettings(strapi, false, false);

        const res = await request(strapi.server.httpServer)
          .get('/admin/auth/login')
          .set('Cookie', 'strapi_admin_refresh=some-local-token')
          .set('Accept', 'text/html')
          .redirects(0);

        expect(res.headers.location).not.toBe('/strapi-plugin-oidc/oidc');
      });
    });

    describe('Direct API auth calls', () => {
      it.each([
        ['/admin/login', { email: 'admin@strapi.test', password: 'SuperAdmin123!' }],
        ['/admin/register', { registrationToken: 'some-token', userInfo: {} }],
        [
          '/admin/register-admin',
          { firstname: 'Test', lastname: 'User', email: 'test@test.com', password: 'Password1!' },
        ],
        ['/admin/forgot-password', { email: 'admin@strapi.test' }],
      ])('blocks POST %s when enforceOIDC is enabled', async (path, body) => {
        const res = await request(strapi.server.httpServer).post(path).send(body);
        expect(res.status).toBe(403);
      });
    });

    describe('Token refresh bypass prevention', () => {
      it.each([
        [
          'only strapi_admin_refresh (local session)',
          { Cookie: 'strapi_admin_refresh=some-local-token' },
        ],
        ['no session cookies at all', {}],
      ])('returns 401 for token refresh with %s', async (_label, headers) => {
        const res = await request(strapi.server.httpServer)
          .post('/admin/token/refresh')
          .set(headers);
        expect(res.status).toBe(401);
        expect(res.body.error.message).toContain('OIDC');
      });

      it('passes token refresh through to Strapi when oidc_id_token is present', async () => {
        const res = await request(strapi.server.httpServer)
          .post('/admin/token/refresh')
          .set('Cookie', 'strapi_admin_refresh=some-oidc-token; oidc_id_token=1');

        // Our middleware passes it through — Strapi may return 401 for the invalid
        // token itself, but the error must NOT be our OIDC enforcement message.
        expect(res.body?.error?.message ?? '').not.toContain('OIDC');
      });

      it('does not block token refresh when enforceOIDC is disabled', async () => {
        await setSettings(strapi, false, false);

        const res = await request(strapi.server.httpServer)
          .post('/admin/token/refresh')
          .set('Cookie', 'strapi_admin_refresh=some-local-token');

        expect(res.body?.error?.message ?? '').not.toContain('OIDC');
      });
    });

    describe('oidc_id_token cookie lifecycle', () => {
      it('sets oidc_id_token cookie after a successful OIDC callback', async () => {
        await setSettings(strapi, false, false);
        const callbackRes = await loginAndExpectSuccess(agent);

        const cookies = parseCookies(callbackRes);
        const oidcCookie = cookies.find((c) => c.startsWith('oidc_id_token='));
        expect(oidcCookie).toBeDefined();
      });

      it('clears oidc_id_token cookie on logout', async () => {
        const res = await logoutWithOidcSession();

        expect(res.status).toBe(302);

        const cookies = parseCookies(res);
        expect(isCookieExpired(cookies, 'oidc_id_token')).toBe(true);
        expect(isCookieExpired(cookies, 'strapi_admin_refresh')).toBe(true);
      });
    });

    describe('Selective OIDC logout redirect', () => {
      it('redirects to OIDC end session URL when oidc_id_token cookie is present', async () => {
        const res = await logoutWithOidcSession();

        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('https://mock-oidc.com/logout');
      });

      it('redirects to OIDC sign-in when oidc_id_token cookie is absent (non-OIDC session)', async () => {
        strapi.config.set('admin.url', '/admin');
        await setSettings(strapi, false, true, true);

        const res = await request(strapi.server.httpServer)
          .post('/strapi-plugin-oidc/logout')
          .redirects(0);

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('/strapi-plugin-oidc/oidc');
        expect(res.headers.location).not.toBe('https://mock-oidc.com/logout');
      });

      it('logout completes quickly and redirects to OIDC end session URL', async () => {
        const startTime = Date.now();

        const res = await request(strapi.server.httpServer)
          .post('/strapi-plugin-oidc/logout')
          .set('Cookie', 'oidc_id_token=test-token; oidc_user_email=test@test.com')
          .redirects(0);

        const elapsed = Date.now() - startTime;

        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('https://mock-oidc.com/logout');
        expect(elapsed).toBeLessThan(5000);
      });
    });
  });

  // Run serially to avoid MSW handler stacking from parallel execution.
  describe('Group-to-role mapping', { sequential: true }, () => {
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
      // to prevent handler stacking from parallel test execution.
      oidcServer.resetHandlers();
      clearRateLimitMap();
      strapi.config.set('plugin::strapi-plugin-oidc', MOCK_OIDC_CONFIG);
      await setSettings(strapi, false, false);
    });

    afterEach(async () => {
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
            sub: 'mock-sub',
            email: 'group-match@test.com',
            email_verified: true,
            family_name: 'Test',
            given_name: 'User',
            groups: ['test-group'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, { 'test-group': [targetRole.name] });

      const loginAgent = createAgent();
      await initiateLoginAndCallback(loginAgent);

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
            sub: 'mock-sub',
            email: 'audit-role@test.com',
            email_verified: true,
            family_name: 'Test',
            given_name: 'User',
            groups: ['audit-group'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, { 'audit-group': [targetRole.name] });

      const loginAgent = createAgent();
      await initiateLoginAndCallback(loginAgent);

      const logs = await queryAuditLog(strapi, 'user_created');
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].detailsKey).toBe('user_created');
      expect(logs[0].detailsParams).toBeDefined();
      expect(logs[0].detailsParams.roles).toContain(targetRole.name);
    });

    it.each([
      [
        'non-matching group',
        'no-match@test.com',
        ['unknown-group'],
        { 'some-other-group': ['SomeFakeRole'] },
      ],
      ['no groups claim', 'no-groups@test.com', [], { 'any-group': ['SomeFakeRole'] }],
    ])(
      'new user with %s → falls back to default OIDC roles',
      async (_label, email, groups, groupMap) => {
        const defaultRoleIds = await getDefaultOidcRoleIds(strapi);
        expect(defaultRoleIds.length).toBeGreaterThan(0);

        const user = await loginAndFetchUser(
          strapi,
          email,
          mswUserInfoHandler(email, 'Test', 'User', groups),
          groupMap,
        );
        expect(user).not.toBeNull();
        expectUserRoleIdsToContain(user, defaultRoleIds);
      },
    );

    it('group mapping takes priority over default OIDC role', async () => {
      const defaultRoleIds = await getDefaultOidcRoleIds(strapi);
      expect(defaultRoleIds.length).toBeGreaterThan(0);

      const allRoles = await strapi.db.query('admin::role').findMany();
      const mappedRole = allRoles.find((r) => !defaultRoleIds.includes(String(r.id)));
      expect(mappedRole, 'Expected at least one role outside the default OIDC roles').toBeDefined();

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
      expect(
        availableRoles.length,
        'Expected at least 2 admin roles to exist',
      ).toBeGreaterThanOrEqual(2);

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
            sub: 'mock-sub',
            email: 'role-removed@test.com',
            email_verified: true,
            family_name: 'Existing',
            given_name: 'User',
            groups: ['no-longer-mapped-group'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, {});

      const loginAgent = createAgent();
      await initiateLoginAndCallback(loginAgent);

      const user = await fetchUserWithRoles(strapi, 'role-removed@test.com');
      const userRoleIds = user.roles.map((r: { id: number }) => String(r.id));
      expect(userRoleIds).toContain(String(roleB.id));
    });

    it('existing user → groups change between logins → role updates to new mapping', async () => {
      const allRoles = await strapi.db.query('admin::role').findMany();
      expect(allRoles.length, 'Expected at least 2 admin roles to exist').toBeGreaterThanOrEqual(2);

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
            sub: 'mock-sub',
            email: 'group-changed@test.com',
            email_verified: true,
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

      const loginAgent = createAgent();
      await initiateLoginAndCallback(loginAgent);

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
            sub: 'mock-sub',
            email: 'whitelist-group@test.com',
            email_verified: true,
            family_name: 'Test',
            given_name: 'User',
            groups: ['special-group'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, { 'special-group': [targetRole.name] });
      await setSettings(strapi, true, false);

      const loginAgent = createAgent();
      const callbackRes = await loginAndExpectSuccess(loginAgent);
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
            sub: 'mock-sub',
            email: 'existing-group@test.com',
            email_verified: true,
            family_name: 'Existing',
            given_name: 'User',
            groups: ['some-group'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, { 'some-group': [groupMappedRole.name] });

      const loginAgent = createAgent();
      await initiateLoginAndCallback(loginAgent);

      const user = await fetchUserWithRoles(strapi, 'existing-group@test.com');
      const userRoleIds = user.roles.map((r: { id: number }) => r.id);
      expect(userRoleIds).toContain(groupMappedRole.id);
    });

    it('existing user with no roles → login assigns OIDC roles', async () => {
      const availableRoles = await strapi.db.query('admin::role').findMany();
      expect(
        availableRoles.length,
        'Expected at least 2 admin roles to exist',
      ).toBeGreaterThanOrEqual(2);

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
            sub: 'mock-sub',
            email: 'no-role-user@test.com',
            email_verified: true,
            family_name: 'Existing',
            given_name: 'User',
            groups: ['group-a'],
          }),
        ),
      );

      await setupGroupRoleMapping(strapi, { 'group-a': [roleA.name] });

      const loginAgent = createAgent();
      await initiateLoginAndCallback(loginAgent);

      const user = await fetchUserWithRoles(strapi, 'no-role-user@test.com');
      const userRoleIds = user.roles.map((r: { id: number }) => r.id);
      expect(userRoleIds).toContain(roleA.id);
    });
  });
});
