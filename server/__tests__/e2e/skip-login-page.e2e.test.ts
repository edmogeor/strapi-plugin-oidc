import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Core } from './test-types';
import {
  MOCK_OIDC_CONFIG,
  applyDefaultOidcConfig,
  makeLogoutCtx,
  expectCookieCleared,
} from './test-helpers';

describe('Skip Login Page E2E', () => {
  let strapi: Core.Strapi;

  const enableSkipLoginPage = () => {
    strapi.config.set('plugin::strapi-plugin-oidc', {
      ...MOCK_OIDC_CONFIG,
      OIDC_SKIP_LOGIN_PAGE: true,
    });
  };

  const disableSkipLoginPage = () => {
    strapi.config.set('plugin::strapi-plugin-oidc', {
      ...MOCK_OIDC_CONFIG,
      OIDC_SKIP_LOGIN_PAGE: false,
    });
  };

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    await applyDefaultOidcConfig(strapi);
  });

  afterAll(async () => {
    disableSkipLoginPage();
  });

  describe('server-side redirect middleware', () => {
    beforeEach(() => {
      enableSkipLoginPage();
    });

    it('redirects GET /admin to /strapi-plugin-oidc/oidc when unauthenticated', async () => {
      const res = await request(strapi.server.httpServer).get('/admin').redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/strapi-plugin-oidc/oidc');
    });

    it('redirects GET /admin/auth/login to /strapi-plugin-oidc/oidc', async () => {
      const res = await request(strapi.server.httpServer).get('/admin/auth/login').redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/strapi-plugin-oidc/oidc');
    });

    it('does NOT redirect excluded API path GET /admin/init', async () => {
      const res = await request(strapi.server.httpServer).get('/admin/init').redirects(0);
      expect(res.status).toBe(200);
    });

    it('does NOT redirect excluded API path GET /admin/logout', async () => {
      const res = await request(strapi.server.httpServer).get('/admin/logout').redirects(0);
      expect(res.status).not.toBe(302);
    });

    it('does NOT redirect POST /admin/login (method check)', async () => {
      const res = await request(strapi.server.httpServer).post('/admin/login').redirects(0);
      expect(res.status).not.toBe(302);
    });

    it('does NOT redirect excluded API path GET /admin/register-admin', async () => {
      const res = await request(strapi.server.httpServer).get('/admin/register-admin').redirects(0);
      expect(res.status).not.toBe(302);
    });

    it('does NOT redirect excluded API path GET /admin/forgot-password', async () => {
      const res = await request(strapi.server.httpServer)
        .get('/admin/forgot-password')
        .redirects(0);
      expect(res.status).not.toBe(302);
    });

    it('does NOT redirect excluded API path GET /admin/reset-password', async () => {
      const res = await request(strapi.server.httpServer).get('/admin/reset-password').redirects(0);
      expect(res.status).not.toBe(302);
    });

    it('does NOT redirect static asset requests (.js)', async () => {
      const res = await request(strapi.server.httpServer).get('/admin/main.js').redirects(0);
      expect(res.status).not.toBe(302);
    });

    it('does NOT redirect static asset requests (.css)', async () => {
      const res = await request(strapi.server.httpServer).get('/admin/styles.css').redirects(0);
      expect(res.status).not.toBe(302);
    });

    it('does NOT redirect non-admin pages', async () => {
      const res = await request(strapi.server.httpServer).get('/api/something').redirects(0);
      expect(res.status).not.toBe(302);
    });

    it('does NOT redirect when authenticated (admin_refresh cookie present)', async () => {
      const res = await request(strapi.server.httpServer)
        .get('/admin')
        .set('Cookie', 'strapi_admin_refresh=fake-refresh-token')
        .redirects(0);
      // Should not redirect to OIDC (the fake cookie won't authenticate, but the check
      // for admin_refresh presence must skip the redirect)
      expect(res.headers.location).not.toBe('/strapi-plugin-oidc/oidc');
    });

    it('does NOT redirect when skip is disabled', async () => {
      disableSkipLoginPage();
      const res = await request(strapi.server.httpServer).get('/admin').redirects(0);
      // Should serve the admin SPA (200) or redirect to login (302 to /admin/auth/login)
      expect(res.headers.location).not.toBe('/strapi-plugin-oidc/oidc');
    });
  });

  describe('logout controller with skip-login-page', () => {
    beforeEach(() => {
      enableSkipLoginPage();
      strapi.config.set('admin.url', '/admin');
    });

    it('redirects non-OIDC sessions to OIDC sign-in instead of admin login', async () => {
      const ctxLogout = makeLogoutCtx(); // no oidc_authenticated cookie
      const oidcController = strapi.plugin('strapi-plugin-oidc').controller('oidc');
      await oidcController.logout(ctxLogout);

      expect(ctxLogout.redirectedTo).toBe('/strapi-plugin-oidc/oidc');
      expectCookieCleared(ctxLogout, 'strapi_admin_refresh');
    });

    it('falls back to OIDC sign-in when OIDC logout not configured', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        OIDC_SKIP_LOGIN_PAGE: true,
        OIDC_END_SESSION_ENDPOINT: undefined,
      });

      const ctxLogout = makeLogoutCtx({ oidc_authenticated: '1' });
      const oidcController = strapi.plugin('strapi-plugin-oidc').controller('oidc');
      await oidcController.logout(ctxLogout);

      expect(ctxLogout.redirectedTo).toBe('/strapi-plugin-oidc/oidc');
      expectCookieCleared(ctxLogout, 'strapi_admin_refresh');
      expectCookieCleared(ctxLogout, 'oidc_authenticated');
    });

    it('falls back to OIDC sign-in when provider rejects expired token', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        OIDC_SKIP_LOGIN_PAGE: true,
        OIDC_END_SESSION_ENDPOINT: 'https://mock-oidc.com/logout',
        OIDC_USERINFO_ENDPOINT: 'https://mock-oidc.com/userinfo',
      });

      const ctxLogout = makeLogoutCtx({
        oidc_authenticated: '1',
        oidc_access_token: 'expired-token',
      });
      const oidcController = strapi.plugin('strapi-plugin-oidc').controller('oidc');
      await oidcController.logout(ctxLogout);

      expect(ctxLogout.redirectedTo).toBe('/strapi-plugin-oidc/oidc');
    });
  });
});
