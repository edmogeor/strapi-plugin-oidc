import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { oidcServer } from './setup';

const MOCK_OIDC_CONFIG = {
  REMEMBER_ME: false,
  OIDC_REDIRECT_URI: 'http://localhost:1337/strapi-plugin-oidc/oidc/callback',
  OIDC_CLIENT_ID: 'mock-client-id',
  OIDC_CLIENT_SECRET: 'mock-client-secret',
  OIDC_SCOPES: 'openid profile email',
  OIDC_AUTHORIZATION_ENDPOINT: 'https://mock-oidc.com/authorize',
  OIDC_TOKEN_ENDPOINT: 'https://mock-oidc.com/token',
  OIDC_USER_INFO_ENDPOINT: 'https://mock-oidc.com/userinfo',
  OIDC_GRANT_TYPE: 'authorization_code',
  OIDC_FAMILY_NAME_FIELD: 'family_name',
  OIDC_GIVEN_NAME_FIELD: 'given_name',
  OIDC_LOGOUT_URL: 'https://mock-oidc.com/logout',
};

describe('OIDC E2E Tests', () => {
  let strapi: any;
  let agent: any;

  const setSettings = async (useWhitelist: boolean, enforceOIDC: boolean) => {
    await strapi
      .plugin('strapi-plugin-oidc')
      .service('whitelist')
      .setSettings({ useWhitelist, enforceOIDC });
  };

  beforeAll(async () => {
    strapi = (global as any).strapiInstance;
    agent = request.agent(strapi.server.httpServer);

    strapi.config.set('plugin::strapi-plugin-oidc', MOCK_OIDC_CONFIG);

    // Disable whitelist for tests
    await setSettings(false, false);
  });

  afterAll(async () => {
    // Clean up the created mock user from the database
    await strapi.db.query('admin::user').deleteMany({
      where: { email: 'test@company.com' },
    });
  });

  it('should have initialized the plugin', () => {
    expect(strapi.plugin('strapi-plugin-oidc')).toBeDefined();
  });

  it('should handle the full OIDC login flow', async () => {
    // 1. Initiate login
    const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);

    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toContain('https://mock-oidc.com/authorize');

    const locationUrl = new URL(loginRes.headers.location);
    const state = locationUrl.searchParams.get('state');
    expect(state).toBeDefined();

    // 2. Simulate callback from OIDC provider
    const callbackRes = await agent
      .get(`/strapi-plugin-oidc/oidc/callback?code=mock-code&state=${state}`)
      .redirects(0);

    // The plugin returns a 200 OK with an HTML page that stores the token in local storage
    expect(callbackRes.status).toBe(200);
    expect(callbackRes.text).toContain('jwtToken'); // Check if the HTML contains the generated token logic
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
    await setSettings(true, true);

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
    // Ensure whitelist is active and no one is in it
    await setSettings(true, false);

    // 1. Initiate login to get a valid state
    const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);

    const locationUrl = new URL(loginRes.headers.location);
    const state = locationUrl.searchParams.get('state');

    // 2. Simulate callback from OIDC provider with the valid state
    const callbackRes = await agent
      .get(`/strapi-plugin-oidc/oidc/callback?code=mock-code&state=${state}`)
      .redirects(0);

    // The plugin should return a 200 OK with an HTML page showing the error
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
    expect(callbackRes.text).toContain('code Not Found');
  });

  it('should fail if callback has invalid state', async () => {
    const callbackRes = await agent
      .get('/strapi-plugin-oidc/oidc/callback?code=mock-code&state=invalid-state')
      .redirects(0);

    expect(callbackRes.status).toBe(200);
    expect(callbackRes.text).toContain('Authentication Failed');
    expect(callbackRes.text).toContain('Invalid state');
  });

  // ---------------------------------------------------------------------------
  // OIDC callback error handling
  // ---------------------------------------------------------------------------
  describe('OIDC callback error handling', () => {
    // Helper: initiate login and return the callback URL with valid state+cookies
    const initiateLogin = async () => {
      const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
      const state = new URL(loginRes.headers.location).searchParams.get('state');
      return `/strapi-plugin-oidc/oidc/callback?code=mock-code&state=${state}`;
    };

    it('shows generic error when token exchange fails', async () => {
      oidcServer.use(
        http.post('https://mock-oidc.com/token', () => HttpResponse.json({}, { status: 401 })),
      );

      const callbackUrl = await initiateLogin();
      const res = await agent.get(callbackUrl).redirects(0);

      expect(res.status).toBe(200);
      expect(res.text).toContain('Authentication Failed');
      expect(res.text).toContain('Authentication failed. Please try again.');
      expect(res.text).not.toContain('mock-oidc.com');
    });

    it('shows generic error when userinfo fetch fails', async () => {
      oidcServer.use(
        http.get('https://mock-oidc.com/userinfo', () => HttpResponse.json({}, { status: 503 })),
      );

      const callbackUrl = await initiateLogin();
      const res = await agent.get(callbackUrl).redirects(0);

      expect(res.status).toBe(200);
      expect(res.text).toContain('Authentication Failed');
      expect(res.text).toContain('Authentication failed. Please try again.');
      expect(res.text).not.toContain('mock-oidc.com');
    });

    it('rejects a mismatched nonce in the ID token', async () => {
      // Build a minimal JWT with a wrong nonce in the payload
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ nonce: 'wrong-nonce', sub: '1' })).toString(
        'base64url',
      );
      const fakeIdToken = `${header}.${payload}.fakesig`;

      oidcServer.use(
        http.post('https://mock-oidc.com/token', () =>
          HttpResponse.json({ access_token: 'fake-jwt-token', id_token: fakeIdToken }),
        ),
      );

      const callbackUrl = await initiateLogin();
      const res = await agent.get(callbackUrl).redirects(0);

      expect(res.status).toBe(200);
      expect(res.text).toContain('Authentication Failed');
      expect(res.text).toContain('Authentication failed. Please try again.');
    });

    it('rejects a malformed ID token', async () => {
      oidcServer.use(
        http.post('https://mock-oidc.com/token', () =>
          HttpResponse.json({ access_token: 'fake-jwt-token', id_token: 'not.a.valid.jwt.at.all' }),
        ),
      );

      const callbackUrl = await initiateLogin();
      const res = await agent.get(callbackUrl).redirects(0);

      expect(res.status).toBe(200);
      expect(res.text).toContain('Authentication Failed');
      expect(res.text).toContain('Authentication failed. Please try again.');
    });

    it('does not reflect user-supplied values in error responses', async () => {
      // The state value is never echoed back — the response must only contain
      // the static 'Invalid state' message with no reflection of the input.
      const res = await agent
        .get('/strapi-plugin-oidc/oidc/callback?code=mock-code&state=<script>alert(1)</script>')
        .redirects(0);

      expect(res.status).toBe(200);
      expect(res.text).not.toContain('<script>');
      expect(res.text).toContain('Invalid state');
    });
  });

  describe('EnforceOIDC Security', () => {
    // Helper to get cookies from a Set-Cookie header array
    const parseCookies = (res: any): string[] =>
      ([] as string[]).concat(res.headers['set-cookie'] || []);

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
      await setSettings(false, true);
    });

    afterAll(async () => {
      await setSettings(false, false);
    });

    // -------------------------------------------------------------------------
    // Fix 1: Pre-existing local sessions are rejected
    // -------------------------------------------------------------------------
    describe('Fix 1: Pre-existing local sessions', () => {
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
        await setSettings(false, false);

        const res = await request(strapi.server.httpServer)
          .get('/admin/auth/login')
          .set('Cookie', 'strapi_admin_refresh=some-local-token')
          .set('Accept', 'text/html')
          .redirects(0);

        // Middleware should not redirect to OIDC
        expect(res.headers.location).not.toBe('/strapi-plugin-oidc/oidc');
      });
    });

    // -------------------------------------------------------------------------
    // Fix 2: Direct API auth calls are blocked
    // -------------------------------------------------------------------------
    describe('Fix 2: Direct API auth calls', () => {
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
    // Fix 4: Token refresh is blocked for non-OIDC sessions
    // -------------------------------------------------------------------------
    describe('Fix 4: Token refresh bypass prevention', () => {
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
        await setSettings(false, false);

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
        await setSettings(false, false); // disable enforce so callback completes normally

        const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
        const state = new URL(loginRes.headers.location).searchParams.get('state');

        const callbackRes = await agent
          .get(`/strapi-plugin-oidc/oidc/callback?code=mock-code&state=${state}`)
          .redirects(0);

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
    });
  });
});
