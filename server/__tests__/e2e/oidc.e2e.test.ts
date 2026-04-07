import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('OIDC E2E Tests', () => {
  let strapi: any;
  let agent: any;

  const setSettings = async (useWhitelist: boolean, enforceOIDC: boolean) => {
    await strapi
      .store({ environment: '', type: 'plugin', name: 'strapi-plugin-oidc', key: 'settings' })
      .set({ value: { useWhitelist, enforceOIDC } });
  };

  beforeAll(async () => {
    strapi = (global as any).strapiInstance;
    agent = request.agent(strapi.server.httpServer);

    // Give the plugin some mocked config
    strapi.config.set('plugin::strapi-plugin-oidc', {
      REMEMBER_ME: false,
      OIDC_REDIRECT_URI: 'http://localhost:1337/strapi-plugin-oidc/oidc/callback',
      OIDC_CLIENT_ID: 'mock-client-id',
      OIDC_CLIENT_SECRET: 'mock-client-secret',
      OIDC_SCOPES: 'openid profile email',
      OIDC_AUTHORIZATION_ENDPOINT: 'https://mock-oidc.com/authorize',
      OIDC_TOKEN_ENDPOINT: 'https://mock-oidc.com/token',
      OIDC_USER_INFO_ENDPOINT: 'https://mock-oidc.com/userinfo',
      OIDC_USER_INFO_ENDPOINT_WITH_AUTH_HEADER: false,
      OIDC_GRANT_TYPE: 'authorization_code',
      OIDC_FAMILY_NAME_FIELD: 'family_name',
      OIDC_GIVEN_NAME_FIELD: 'given_name',
      OIDC_LOGOUT_URL: 'https://mock-oidc.com/logout',
    });

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

    // Ensure GET HTML routes redirect to OIDC
    const unauthAgent = request.agent(strapi.server.httpServer);

    const getLoginBlocked = await unauthAgent
      .get('/admin/auth/login')
      .set('Accept', 'text/html')
      .redirects(0);
    expect(getLoginBlocked.status).toBe(302);
    expect(getLoginBlocked.headers.location).toBe('/strapi-plugin-oidc/oidc');

    const getRegisterBlocked = await unauthAgent
      .get('/admin/auth/register')
      .set('Accept', 'text/html')
      .redirects(0);
    expect(getRegisterBlocked.status).toBe(302);
    expect(getRegisterBlocked.headers.location).toBe('/strapi-plugin-oidc/oidc');

    const getForgotPasswordBlocked = await unauthAgent
      .get('/admin/auth/forgot-password')
      .set('Accept', 'text/html')
      .redirects(0);
    expect(getForgotPasswordBlocked.status).toBe(302);
    expect(getForgotPasswordBlocked.headers.location).toBe('/strapi-plugin-oidc/oidc');

    const getResetPasswordBlocked = await unauthAgent
      .get('/admin/auth/reset-password')
      .set('Accept', 'text/html')
      .redirects(0);
    expect(getResetPasswordBlocked.status).toBe(302);
    expect(getResetPasswordBlocked.headers.location).toBe('/strapi-plugin-oidc/oidc');
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
    expect(callbackRes.text).toContain('Not present in whitelist');
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
});
