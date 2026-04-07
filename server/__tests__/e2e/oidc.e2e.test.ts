import request from 'supertest';
import type { Response } from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { oidcServer } from './setup';
import type { Core } from './test-types';

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

describe('OIDC E2E Tests', () => {
  let strapi: Core.Strapi;
  let agent: ReturnType<typeof request.agent>;
  let capturedJwt: string | undefined;

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

    // Capture the JWT for reuse in later tests (e.g. denylist middleware)
    const jwtMatch = callbackRes.text.match(/localStorage\.setItem\('jwtToken',\s*'"([^"]+)"'\)/);
    capturedJwt = jwtMatch?.[1];
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

    // Initiates login, hits the callback, and asserts the standard generic error response.
    // Returns the response so callers can add extra assertions (e.g. no URL leak).
    const assertCallbackError = async () => {
      const callbackUrl = await initiateLogin();
      const res = await agent.get(callbackUrl).redirects(0);
      expect(res.status).toBe(200);
      expect(res.text).toContain('Authentication Failed');
      expect(res.text).toContain('Authentication failed. Please try again.');
      return res;
    };

    it('shows generic error when token exchange fails', async () => {
      oidcServer.use(
        http.post('https://mock-oidc.com/token', () => HttpResponse.json({}, { status: 401 })),
      );
      const res = await assertCallbackError();
      expect(res.text).not.toContain('mock-oidc.com');
    });

    it('shows generic error when userinfo fetch fails', async () => {
      oidcServer.use(
        http.get('https://mock-oidc.com/userinfo', () => HttpResponse.json({}, { status: 503 })),
      );
      const res = await assertCallbackError();
      expect(res.text).not.toContain('mock-oidc.com');
    });

    it('rejects a mismatched nonce in the ID token', async () => {
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
      await assertCallbackError();
    });

    it('rejects a malformed ID token', async () => {
      oidcServer.use(
        http.post('https://mock-oidc.com/token', () =>
          HttpResponse.json({ access_token: 'fake-jwt-token', id_token: 'not.a.valid.jwt.at.all' }),
        ),
      );
      await assertCallbackError();
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
    const parseCookies = (res: Response): string[] =>
      ([] as string[]).concat((res.headers['set-cookie'] as string | string[] | undefined) || []);

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

      it('clears oidc_id_token cookie on logout', async () => {
        const res = await logoutWithOidcSession();

        expect(res.status).toBe(302);

        const cookies = parseCookies(res);
        expect(isCookieExpired(cookies, 'oidc_id_token')).toBe(true);
      });
    });

    // -------------------------------------------------------------------------
    // Selective OIDC logout redirect
    // -------------------------------------------------------------------------
    describe('Selective OIDC logout redirect', () => {
      it('redirects to OIDC logout URL when oidc_authenticated cookie is present (no id_token_hint)', async () => {
        const res = await logoutWithOidcSession();

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('https://mock-oidc.com/logout');
      });

      it('appends id_token_hint when oidc_id_token cookie is set after login', async () => {
        await setSettings(false, false);

        // Build a minimal ID token with the correct nonce so it passes validation
        const loginRes = await agent.get('/strapi-plugin-oidc/oidc').redirects(0);
        const nonce = new URL(loginRes.headers.location).searchParams.get('nonce')!;
        const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ nonce, sub: '1' })).toString('base64url');
        const idToken = `${header}.${payload}.fakesig`;

        oidcServer.use(
          http.post('https://mock-oidc.com/token', () =>
            HttpResponse.json({ access_token: 'fake-jwt-token', id_token: idToken }),
          ),
        );

        const state = new URL(loginRes.headers.location).searchParams.get('state');
        await agent
          .get(`/strapi-plugin-oidc/oidc/callback?code=mock-code&state=${state}`)
          .redirects(0);

        // Now logout — agent carries the oidc_id_token cookie set during callback
        strapi.config.set('plugin::strapi-plugin-oidc', {
          ...MOCK_OIDC_CONFIG,
          OIDC_POST_LOGOUT_REDIRECT_URI: '',
        });
        const logoutRes = await agent
          .get('/strapi-plugin-oidc/logout')
          .set('Cookie', 'oidc_authenticated=1')
          .redirects(0);

        expect(logoutRes.status).toBe(302);
        const location = new URL(logoutRes.headers.location);
        expect(location.origin + location.pathname).toBe('https://mock-oidc.com/logout');
        expect(location.searchParams.get('id_token_hint')).toBe(idToken);
        expect(location.searchParams.get('post_logout_redirect_uri')).toBeNull();
      });

      it('appends post_logout_redirect_uri when OIDC_POST_LOGOUT_REDIRECT_URI is configured', async () => {
        strapi.config.set('plugin::strapi-plugin-oidc', {
          ...MOCK_OIDC_CONFIG,
          OIDC_POST_LOGOUT_REDIRECT_URI: 'https://myapp.com/logged-out',
        });

        const res = await logoutWithOidcSession();

        expect(res.status).toBe(302);
        const location = new URL(res.headers.location);
        expect(location.origin + location.pathname).toBe('https://mock-oidc.com/logout');
        expect(location.searchParams.get('post_logout_redirect_uri')).toBe(
          'https://myapp.com/logged-out',
        );
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

  // ---------------------------------------------------------------------------
  // Denylist middleware — instant revocation after backchannel logout
  // ---------------------------------------------------------------------------
  describe('Denylist middleware', () => {
    let privateKey: CryptoKey;
    let jwksHandler: ReturnType<typeof http.get>;

    // Use a distinct JWKS URI so the module-level jwksCache in oidc.ts does not
    // share a cached RemoteJWKSet with the Backchannel logout describe (which uses
    // a different key pair at the same mock-oidc.com/jwks URI).
    const DENYLIST_JWKS_URI = 'https://mock-oidc-denylist.com/jwks';

    beforeAll(async () => {
      let publicKey: CryptoKey;
      ({ privateKey, publicKey } = await generateKeyPair('RS256'));
      const jwk = await exportJWK(publicKey);
      jwk.kid = 'test-key-denylist';
      jwk.use = 'sig';
      jwksHandler = http.get(DENYLIST_JWKS_URI, () => HttpResponse.json({ keys: [jwk] }));

      strapi.config.set('plugin::strapi-plugin-oidc', {
        ...MOCK_OIDC_CONFIG,
        OIDC_ISSUER: 'https://mock-oidc.com',
        OIDC_JWKS_URI: DENYLIST_JWKS_URI,
      });
    });

    beforeEach(() => {
      oidcServer.use(jwksHandler);
    });

    const signLogoutToken = (payload: Record<string, unknown>) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key-denylist' })
        .setIssuer('https://mock-oidc.com')
        .setAudience('mock-client-id')
        .setIssuedAt()
        .setJti(crypto.randomUUID())
        .sign(privateKey);

    it('immediately rejects an existing JWT after backchannel logout for that user', async () => {
      // Reuse the JWT captured during the full OIDC login flow test — avoids
      // triggering the rate limiter with an additional login attempt.
      // This describe runs before the Backchannel logout describe so the user
      // has not yet been revoked by any other test.
      const jwt = capturedJwt;
      expect(jwt).toBeDefined();

      // 1. Confirm the JWT works before revocation
      const before = await request(strapi.server.httpServer)
        .get('/admin/users/me')
        .set('Authorization', `Bearer ${jwt}`);
      expect(before.status).toBe(200);

      // 2. Trigger backchannel logout for the user
      const logoutToken = await signLogoutToken({
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
        sub: 'test@company.com',
      });
      const logoutRes = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/logout')
        .type('form')
        .send({ logout_token: logoutToken });
      expect(logoutRes.status).toBe(200);

      // 3. The same JWT should now be immediately rejected.
      // The denylist middleware blocks it before route handlers run; Strapi's own
      // session invalidation (invalidateRefreshToken) provides a second layer.
      const after = await request(strapi.server.httpServer)
        .get('/admin/users/me')
        .set('Authorization', `Bearer ${jwt}`);
      expect(after.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // Backchannel logout (POST /logout)
  // ---------------------------------------------------------------------------
  describe('Backchannel logout', () => {
    let privateKey: CryptoKey;
    let jwksHandler: ReturnType<typeof http.get>;

    beforeAll(async () => {
      // Generate a test RSA key pair for signing logout tokens
      let publicKey: CryptoKey;
      ({ privateKey, publicKey } = await generateKeyPair('RS256'));

      const jwk = await exportJWK(publicKey);
      jwk.kid = 'test-key-1';
      jwk.use = 'sig';
      jwksHandler = http.get('https://mock-oidc.com/jwks', () =>
        HttpResponse.json({ keys: [jwk] }),
      );

      strapi.config.set('plugin::strapi-plugin-oidc', {
        ...MOCK_OIDC_CONFIG,
        OIDC_ISSUER: 'https://mock-oidc.com',
        OIDC_JWKS_URI: 'https://mock-oidc.com/jwks',
      });
    });

    // resetHandlers() in the global afterEach clears runtime handlers after every test,
    // so we re-register the JWKS handler before each test in this suite.
    beforeEach(() => {
      oidcServer.use(jwksHandler);
    });

    const signToken = (payload: Record<string, unknown>) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
        .setIssuer('https://mock-oidc.com')
        .setAudience('mock-client-id')
        .setIssuedAt()
        .setJti(crypto.randomUUID())
        .sign(privateKey);

    const makeLogoutToken = (overrides: Record<string, unknown> = {}) =>
      signToken({
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
        sub: 'test@company.com',
        ...overrides,
      });

    const postLogoutToken = (token: string) =>
      request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/logout')
        .type('form')
        .send({ logout_token: token });

    it('returns 501 when OIDC_ISSUER is not configured', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        ...MOCK_OIDC_CONFIG,
        OIDC_JWKS_URI: 'https://mock-oidc.com/jwks',
        OIDC_ISSUER: '',
      });

      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/logout')
        .type('form')
        .send({ logout_token: 'any' });

      expect(res.status).toBe(501);

      // Restore for subsequent tests
      strapi.config.set('plugin::strapi-plugin-oidc', {
        ...MOCK_OIDC_CONFIG,
        OIDC_ISSUER: 'https://mock-oidc.com',
        OIDC_JWKS_URI: 'https://mock-oidc.com/jwks',
      });
    });

    it('returns 400 when logout_token is missing', async () => {
      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/logout')
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 for a token with an invalid signature', async () => {
      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/logout')
        .type('form')
        .send({ logout_token: 'header.payload.badsig' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when nonce is present in the logout token', async () => {
      const res = await postLogoutToken(await makeLogoutToken({ nonce: 'must-not-be-here' }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when the backchannel-logout event is missing', async () => {
      const res = await postLogoutToken(await makeLogoutToken({ events: {} }));
      expect(res.status).toBe(400);
    });

    it('returns 400 when neither sub nor sid is present', async () => {
      const token = await signToken({
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
      });
      const res = await postLogoutToken(token);
      expect(res.status).toBe(400);
    });

    it('returns 200 for a valid logout token (user not found — graceful degradation)', async () => {
      const res = await postLogoutToken(await makeLogoutToken({ sub: 'unknown-user@example.com' }));
      expect(res.status).toBe(200);
    });

    it('returns 200 and revokes the session for a known user', async () => {
      // Ensure the test user exists (created by the full OIDC login flow test)
      const res = await postLogoutToken(await makeLogoutToken({ sub: 'test@company.com' }));
      expect(res.status).toBe(200);
    });

    it('returns 200 when sub is absent but sid is present', async () => {
      const token = await signToken({
        events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
        sid: 'some-session-id',
      });
      const res = await postLogoutToken(token);
      expect(res.status).toBe(200);
    });
  });
});
