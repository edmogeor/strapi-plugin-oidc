import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type {
  Core,
  OidcRole,
  WhitelistController,
  RoleController,
  MockCtx,
  WhitelistInfoBody,
  RegisterBody,
  ImportBody,
} from './test-types';
import {
  MOCK_OIDC_CONFIG,
  setSettings,
  expectOidcSessionLogout,
  expectNonOidcLogoutRedirect,
  getPluginController,
  getPluginConfig,
} from './test-helpers';
import { resetOidcConfig } from '../../utils/oidc-client';

const whitelistFixture: { email: string }[] = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/whitelist-import.json'), 'utf-8'),
);

describe('Controllers E2E', () => {
  let strapi: Core.Strapi;
  let whitelistController: WhitelistController;
  let roleController: RoleController;

  beforeAll(() => {
    strapi = globalThis.strapiInstance;
    whitelistController = getPluginController<WhitelistController>(strapi, 'whitelist');
    roleController = getPluginController<RoleController>(strapi, 'role');
  });

  describe('Whitelist Controller', () => {
    beforeAll(() => {
      // Ensure OIDC_ENFORCE config override is absent so DB values are used
      strapi.config.set('plugin::strapi-plugin-oidc', {
        ...getPluginConfig(strapi),
        OIDC_ENFORCE: null,
      });
    });

    afterAll(async () => {
      await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({
        where: { email: { $in: ['sync1@test.com', 'sync2@test.com', 'sync3@test.com'] } },
      });
    });

    it('should get and update settings via controller', async () => {
      const ctxUpdate: MockCtx = {
        request: { body: { useWhitelist: false, enforceOIDC: true, skipLoginPage: false } },
      };

      await whitelistController.updateSettings(ctxUpdate);
      expect(ctxUpdate.body).toEqual({
        useWhitelist: false,
        enforceOIDC: true,
        skipLoginPage: false,
      });

      const ctxInfo: MockCtx = {};
      await whitelistController.info(ctxInfo);

      expect(ctxInfo.body).toMatchObject({ useWhitelist: false, enforceOIDC: true });
      expect(Array.isArray((ctxInfo.body as WhitelistInfoBody).whitelistUsers)).toBe(true);
    });

    it('should force enforceOIDC to false if whitelist is enabled but empty', async () => {
      // Ensure the whitelist is empty
      await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({});

      const ctxUpdate: MockCtx = {
        request: { body: { useWhitelist: true, enforceOIDC: true, skipLoginPage: false } },
      };

      await whitelistController.updateSettings(ctxUpdate);

      // enforceOIDC should be forced to false
      expect(ctxUpdate.body).toEqual({
        useWhitelist: true,
        enforceOIDC: false,
        skipLoginPage: false,
      });

      // Restore settings for the next test
      await whitelistController.updateSettings({
        request: { body: { useWhitelist: false, enforceOIDC: true, skipLoginPage: false } },
      });
    });

    it('should return public settings', async () => {
      const ctxPublic = { body: null };
      await whitelistController.publicSettings(ctxPublic);
      expect(ctxPublic.body).toMatchObject({ enforceOIDC: true });
      expect(ctxPublic.body).toHaveProperty('ssoButtonText');
    });

    it('should return skipLoginPage in public settings', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        ...getPluginConfig(strapi),
        OIDC_ENFORCE: null,
        OIDC_SKIP_LOGIN_PAGE: null,
      });
      await strapi
        .plugin('strapi-plugin-oidc')
        .service('whitelist')
        .setSettings({ useWhitelist: false, enforceOIDC: true, skipLoginPage: true });

      const ctxPublic = { body: null };
      await whitelistController.publicSettings(ctxPublic);
      expect(ctxPublic.body).toMatchObject({ skipLoginPage: true });
      expect(ctxPublic.body).toHaveProperty('enforceOIDC');
      expect(ctxPublic.body).toHaveProperty('ssoButtonText');
    });

    it('should register and remove whitelist users via controller', async () => {
      const ctxRegister: MockCtx = {
        request: { body: { email: 'controller-test@whitelist.com' } },
      };

      await whitelistController.register(ctxRegister);
      const registerBody = ctxRegister.body as RegisterBody;
      expect(registerBody.acceptedCount).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(registerBody.rejectedEmails)).toBe(true);

      // Verify it fails without an email
      const ctxRegisterFail: MockCtx = { request: { body: { email: '' } } };
      await whitelistController.register(ctxRegisterFail);
      expect((ctxRegisterFail.body as RegisterBody).message).toBe(
        'Please enter a valid email address',
      );

      // Verify it's added
      const ctxInfo: MockCtx = {};
      await whitelistController.info(ctxInfo);
      const addedUser = (ctxInfo.body as WhitelistInfoBody).whitelistUsers.find(
        (u) => u.email === 'controller-test@whitelist.com',
      );
      expect(addedUser).toBeDefined();

      // Remove it
      const ctxRemove: MockCtx = { params: { email: addedUser!.email } };
      await whitelistController.removeEmail(ctxRemove);

      // Verify it's removed
      await whitelistController.info(ctxInfo);
      const removedUser = (ctxInfo.body as WhitelistInfoBody).whitelistUsers.find(
        (u) => u.email === 'controller-test@whitelist.com',
      );
      expect(removedUser).toBeUndefined();
    });

    describe('register email validation', () => {
      it('accepts valid emails and separates invalid ones', async () => {
        await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({
          where: { email: 'valid@validation-test.com' },
        });
        const ctx: MockCtx = {
          request: { body: { email: ['valid@validation-test.com', 'bad-email', 'also bad'] } },
          status: 200,
        };
        await whitelistController.register(ctx);
        const body = ctx.body as RegisterBody;
        expect(ctx.status).toBe(200);
        expect(body.acceptedCount).toBe(1);
        expect(body.rejectedEmails).toEqual(expect.arrayContaining(['bad-email', 'also bad']));
        await strapi.db
          .query('plugin::strapi-plugin-oidc.whitelists')
          .deleteMany({ where: { email: 'valid@validation-test.com' } });
      });
    });

    describe('importUsers', () => {
      const fixtureEmails = whitelistFixture.map((u) => u.email);

      afterAll(async () => {
        await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({
          where: { email: { $in: fixtureEmails } },
        });
      });

      it('should import all fixture entries and skip duplicates', async () => {
        // Pre-insert one fixture entry so it counts as a duplicate
        const [duplicate] = whitelistFixture;
        await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').create({
          data: { email: duplicate.email },
        });

        const ctx: MockCtx = { request: { body: { users: whitelistFixture } }, status: 200 };
        await whitelistController.importUsers(ctx);

        // All fixture entries minus the one pre-inserted duplicate
        expect((ctx.body as ImportBody).importedCount).toBe(whitelistFixture.length - 1);
      });

      it('should return 400 for non-array body', async () => {
        const ctx: MockCtx = { request: { body: { users: 'not-an-array' } }, status: 200 };
        await whitelistController.importUsers(ctx);
        expect(ctx.status).toBe(400);
      });

      it('should skip entries without an email field', async () => {
        const ctx: MockCtx = {
          request: {
            body: {
              users: [
                { email: '' },
                {}, // no email
                { email: null },
              ],
            },
          },
          status: 200,
        };

        await whitelistController.importUsers(ctx);

        expect((ctx.body as ImportBody).importedCount).toBe(0);
      });
    });

    it('should sync users successfully', async () => {
      // Create some initial users
      await strapi.plugin('strapi-plugin-oidc').service('whitelist').registerUser('sync1@test.com');

      const ctxSync: MockCtx = {
        request: { body: { users: [{ email: 'sync2@test.com' }, { email: 'sync3@test.com' }] } },
      };

      await whitelistController.syncUsers(ctxSync);
      // syncUsers returns an empty object — just verify it doesn't throw
      expect(ctxSync.body).toBeDefined();

      // sync1 should be deleted, sync2 and sync3 should be added
      const ctxInfo: MockCtx = {};
      await whitelistController.info(ctxInfo);

      const userEmails = (ctxInfo.body as WhitelistInfoBody).whitelistUsers.map((u) => u.email);
      expect(userEmails).not.toContain('sync1@test.com');
      expect(userEmails).toContain('sync2@test.com');
      expect(userEmails).toContain('sync3@test.com');
    });

    it('should delete all whitelist entries', async () => {
      // Seed a couple of entries
      await strapi
        .plugin('strapi-plugin-oidc')
        .service('whitelist')
        .registerUser('deleteall1@test.com');
      await strapi
        .plugin('strapi-plugin-oidc')
        .service('whitelist')
        .registerUser('deleteall2@test.com');

      const ctxDeleteAll: MockCtx = {};
      await whitelistController.deleteAll(ctxDeleteAll);
      expect(ctxDeleteAll.body).toEqual({});

      const ctxInfo: MockCtx = {};
      await whitelistController.info(ctxInfo);
      expect((ctxInfo.body as WhitelistInfoBody).whitelistUsers).toHaveLength(0);
    });
  });

  describe('Role Controller', () => {
    it('should find roles', async () => {
      const ctxFind: MockCtx = {
        send(data: unknown) {
          this.body = data;
        },
      };
      await roleController.find(ctxFind);

      const roles = ctxFind.body as OidcRole[];
      expect(Array.isArray(roles)).toBe(true);
      expect(roles.length).toBeGreaterThan(0);
    });

    it('should update roles', async () => {
      // 1. Fetch original roles to restore later
      const ctxFindOriginal: MockCtx = {
        send(data: unknown) {
          this.body = data;
        },
      };
      await roleController.find(ctxFindOriginal);
      const originalRoles = ctxFindOriginal.body as OidcRole[];
      const originalRole4 = originalRoles.find((r) => r.oauth_type === '4')?.role ?? [];

      const ctxUpdate: MockCtx = {
        request: { body: { roles: [{ oauth_type: '4', role: [1, 2] }] } },
        send(data: unknown, status?: number) {
          this.body = { data, status };
        },
      };

      await roleController.update(ctxUpdate);
      expect(ctxUpdate.body).toMatchObject({ data: {}, status: 204 });

      const ctxFind: MockCtx = {
        send(data: unknown) {
          this.body = data;
        },
      };
      await roleController.find(ctxFind);

      const updatedRole = (ctxFind.body as OidcRole[]).find((r) => r.oauth_type === '4');
      expect(updatedRole?.role).toEqual(expect.arrayContaining([1, 2]));

      // Restore the original roles
      const ctxRestore: MockCtx = {
        request: { body: { roles: [{ oauth_type: '4', role: originalRole4 }] } },
        send(data: unknown, status?: number) {
          this.body = { data, status };
        },
      };
      await roleController.update(ctxRestore);
    });
  });

  describe('OIDC Controller (Logout)', () => {
    let savedAdminUrl: unknown;

    beforeEach(() => {
      resetOidcConfig();
      strapi.config.set('plugin::strapi-plugin-oidc', MOCK_OIDC_CONFIG);
      savedAdminUrl = strapi.config.get('admin.url');
    });

    afterEach(() => {
      strapi.config.set('admin.url', savedAdminUrl);
    });

    it('should redirect to OIDC end session URL for OIDC sessions', async () => {
      const res = await request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/logout')
        .set('Cookie', 'oidc_id_token=mock-id-token')
        .redirects(0);

      expectOidcSessionLogout(res);
    });

    it('should redirect to Strapi login when no OIDC session (no id_token cookie)', async () => {
      strapi.config.set('admin.url', '/admin');
      await setSettings(strapi, false, true, false);

      const res = await request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/logout')
        .redirects(0);

      expectNonOidcLogoutRedirect(res, '/admin/auth/login');
    });

    it('should redirect to OIDC sign-in when skipLoginPage is enabled and no OIDC session', async () => {
      strapi.config.set('admin.url', '/admin');
      await setSettings(strapi, false, true, true);

      const res = await request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/logout')
        .redirects(0);

      expectNonOidcLogoutRedirect(res, '/strapi-plugin-oidc/oidc');
    });

    it('should redirect OIDC session to end session URL with id_token_hint', async () => {
      const res = await request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/logout')
        .set('Cookie', 'oidc_id_token=mock-id-token')
        .redirects(0);

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('https://mock-oidc.com/logout');
      expect(res.headers.location).toContain('id_token_hint=');
    });
  });
});
