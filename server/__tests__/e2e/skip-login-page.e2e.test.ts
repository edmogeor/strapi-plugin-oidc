import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Core } from './test-types';
import { MOCK_OIDC_CONFIG, applyDefaultOidcConfig, setSettings } from './test-helpers';
import { OIDC_SIGN_IN_PATH } from '../../../shared/constants';
import { resetOidcConfig } from '../../utils/oidc-client';

describe('Skip Login Page E2E', () => {
  let strapi: Core.Strapi;

  const enableSkipLoginPage = async () => {
    strapi.config.set('plugin::strapi-plugin-oidc', {
      ...MOCK_OIDC_CONFIG,
      OIDC_SKIP_LOGIN_PAGE: null,
    });
    await setSettings(strapi, false, false, true);
  };

  const disableSkipLoginPage = async () => {
    strapi.config.set('plugin::strapi-plugin-oidc', {
      ...MOCK_OIDC_CONFIG,
      OIDC_SKIP_LOGIN_PAGE: null,
    });
    await setSettings(strapi, false, false, false);
  };

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    await applyDefaultOidcConfig(strapi);
  });

  afterAll(async () => {
    await disableSkipLoginPage();
  });

  describe('server-side redirect middleware', () => {
    beforeEach(async () => {
      await enableSkipLoginPage();
    });

    it('redirects GET /admin to /strapi-plugin-oidc/oidc when unauthenticated', async () => {
      const res = await request(strapi.server.httpServer).get('/admin').redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(OIDC_SIGN_IN_PATH);
    });

    it('redirects GET /admin/auth/login to /strapi-plugin-oidc/oidc', async () => {
      const res = await request(strapi.server.httpServer).get('/admin/auth/login').redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(OIDC_SIGN_IN_PATH);
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
      expect(res.headers.location).not.toBe(OIDC_SIGN_IN_PATH);
    });

    it('does NOT redirect when skip is disabled', async () => {
      await disableSkipLoginPage();
      const res = await request(strapi.server.httpServer).get('/admin').redirects(0);
      expect(res.headers.location).not.toBe(OIDC_SIGN_IN_PATH);
    });
  });

  describe('logout controller with skip-login-page', () => {
    beforeEach(async () => {
      resetOidcConfig();
      strapi.config.set('plugin::strapi-plugin-oidc', {
        ...MOCK_OIDC_CONFIG,
        OIDC_SKIP_LOGIN_PAGE: null,
      });
      await setSettings(strapi, false, false, true);
      strapi.config.set('admin.url', '/admin');
    });

    it('redirects non-OIDC sessions to OIDC sign-in instead of admin login', async () => {
      const res = await request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/logout')
        .redirects(0);

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(OIDC_SIGN_IN_PATH);
      expect(res.headers['set-cookie']).toEqual(
        expect.arrayContaining([expect.stringMatching(/^strapi_admin_refresh=;/)]),
      );
    });

    it('redirects OIDC sessions to end session URL', async () => {
      const res = await request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/logout')
        .set('Cookie', '__Host-oidc_id_token=mock-id-token')
        .redirects(0);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('https://mock-oidc.com/logout');
      expect(res.headers['set-cookie']).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^__Host-oidc_id_token=;/),
          expect.stringMatching(/^strapi_admin_refresh=;/),
        ]),
      );
    });
  });
});
