import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type {
  Core,
  OidcRole,
  WhitelistController,
  RoleController,
  OidcController,
  MockCtx,
  WhitelistInfoBody,
  RegisterBody,
  ImportBody,
} from './test-types';
import { makeLogoutCtx, expectCookieCleared } from './test-helpers';

const whitelistFixture: { email: string }[] = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/whitelist-import.json'), 'utf-8'),
);

describe('Controllers E2E', () => {
  let strapi: Core.Strapi;
  let whitelistController: WhitelistController;
  let roleController: RoleController;
  let oidcController: OidcController;

  beforeAll(() => {
    strapi = globalThis.strapiInstance;
    whitelistController = strapi.plugin('strapi-plugin-oidc').controller('whitelist');
    roleController = strapi.plugin('strapi-plugin-oidc').controller('role');
    oidcController = strapi.plugin('strapi-plugin-oidc').controller('oidc');
  });

  describe('Whitelist Controller', () => {
    beforeAll(() => {
      // Ensure OIDC_ENFORCE config override is absent so DB values are used
      strapi.config.set('plugin::strapi-plugin-oidc', {
        ...strapi.config.get('plugin::strapi-plugin-oidc'),
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
        request: { body: { useWhitelist: false, enforceOIDC: true } },
      };

      await whitelistController.updateSettings(ctxUpdate);
      expect(ctxUpdate.body).toEqual({ useWhitelist: false, enforceOIDC: true });

      const ctxInfo: MockCtx = {};
      await whitelistController.info(ctxInfo);

      expect(ctxInfo.body).toMatchObject({ useWhitelist: false, enforceOIDC: true });
      expect(Array.isArray((ctxInfo.body as WhitelistInfoBody).whitelistUsers)).toBe(true);
    });

    it('should force enforceOIDC to false if whitelist is enabled but empty', async () => {
      // Ensure the whitelist is empty
      await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({});

      const ctxUpdate: MockCtx = {
        request: { body: { useWhitelist: true, enforceOIDC: true } },
      };

      await whitelistController.updateSettings(ctxUpdate);

      // enforceOIDC should be forced to false
      expect(ctxUpdate.body).toEqual({ useWhitelist: true, enforceOIDC: false });

      // Restore settings for the next test
      await whitelistController.updateSettings({
        request: { body: { useWhitelist: false, enforceOIDC: true } },
      });
    });

    it('should return public settings', async () => {
      const ctxPublic = { body: null };
      await whitelistController.publicSettings(ctxPublic);
      expect(ctxPublic.body).toMatchObject({ enforceOIDC: true });
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
    it('should redirect to OIDC provider logout URL for OIDC sessions', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        OIDC_END_SESSION_ENDPOINT: 'https://mock-oidc.com/logout',
        OIDC_USERINFO_ENDPOINT: 'https://mock-oidc.com/userinfo',
      });

      const ctxLogout = makeLogoutCtx({ oidc_authenticated: '1' });
      await oidcController.logout(ctxLogout);

      expect(ctxLogout.redirectedTo).toBe('https://mock-oidc.com/logout');
      expectCookieCleared(ctxLogout, 'strapi_admin_refresh');
      expectCookieCleared(ctxLogout, 'oidc_authenticated');
    });

    it('should redirect to OIDC end-session when access token is valid', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        OIDC_END_SESSION_ENDPOINT: 'https://mock-oidc.com/logout',
        OIDC_USERINFO_ENDPOINT: 'https://mock-oidc.com/userinfo',
      });

      const ctxLogout = makeLogoutCtx({
        oidc_authenticated: '1',
        oidc_access_token: 'valid-token',
      });
      await oidcController.logout(ctxLogout);

      expect(ctxLogout.redirectedTo).toBe('https://mock-oidc.com/logout');
    });

    it('should redirect to Strapi login when provider explicitly rejects the token (401)', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        OIDC_END_SESSION_ENDPOINT: 'https://mock-oidc.com/logout',
        // mock-oidc.com/userinfo is intercepted by MSW; 'expired-token' returns 401
        OIDC_USERINFO_ENDPOINT: 'https://mock-oidc.com/userinfo',
      });
      strapi.config.set('admin.url', '/admin');

      const ctxLogout = makeLogoutCtx({
        oidc_authenticated: '1',
        oidc_access_token: 'expired-token',
      });
      await oidcController.logout(ctxLogout);

      expect(ctxLogout.redirectedTo).toBe('/admin/auth/login');
    });

    it('should still redirect to OIDC provider when userinfo endpoint is unreachable', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        OIDC_END_SESSION_ENDPOINT: 'https://mock-oidc.com/logout',
        // .invalid TLD is guaranteed to fail DNS — network error should not block provider logout
        OIDC_USERINFO_ENDPOINT: 'https://provider.invalid/userinfo',
      });
      strapi.config.set('admin.url', '/admin');

      const ctxLogout = makeLogoutCtx({
        oidc_authenticated: '1',
        oidc_access_token: 'some-token',
      });
      await oidcController.logout(ctxLogout);

      expect(ctxLogout.redirectedTo).toBe('https://mock-oidc.com/logout');
    });

    it('should redirect to admin login for non-OIDC sessions even if OIDC logout URL is configured', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        OIDC_END_SESSION_ENDPOINT: 'https://mock-oidc.com/logout',
      });
      strapi.config.set('admin.url', '/admin');

      const ctxLogout = makeLogoutCtx(); // no oidc_authenticated cookie
      await oidcController.logout(ctxLogout);

      expect(ctxLogout.redirectedTo).toBe('/admin/auth/login');
      expectCookieCleared(ctxLogout, 'strapi_admin_refresh');
    });

    it('should fallback to Strapi admin auth login if OIDC logout not configured', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_END_SESSION_ENDPOINT: undefined });
      strapi.config.set('admin.url', '/custom-admin');

      const ctxLogout = makeLogoutCtx({ oidc_authenticated: '1' });
      await oidcController.logout(ctxLogout);

      expect(ctxLogout.redirectedTo).toBe('/custom-admin/auth/login');
      expectCookieCleared(ctxLogout, 'strapi_admin_refresh');
      expectCookieCleared(ctxLogout, 'oidc_authenticated');
    });
  });
});
