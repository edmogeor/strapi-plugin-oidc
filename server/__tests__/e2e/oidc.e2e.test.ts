import request from 'supertest';
import { describe, it, expect, beforeAll } from 'vitest';

describe('OIDC E2E Tests', () => {
  let strapi: any;
  let agent: any;

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
      OIDC_LOGOUT_URL: 'https://mock-oidc.com/logout'
    });

    // Disable whitelist for tests
    await strapi.store({ type: 'plugin', name: 'strapi-plugin-oidc', key: 'settings' }).set({ value: { useWhitelist: false, enforceOIDC: false } });
  });

  it('should have initialized the plugin', () => {
    expect(strapi.plugin('strapi-plugin-oidc')).toBeDefined();
  });

  it('should handle the full OIDC login flow', async () => {
    // 1. Initiate login
    const loginRes = await agent
      .get('/strapi-plugin-oidc/oidc')
      .redirects(0);

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
});