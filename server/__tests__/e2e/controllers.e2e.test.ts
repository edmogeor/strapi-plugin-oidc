import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Controllers E2E', () => {
  let strapi: any;
  let whitelistController: any;
  let roleController: any;
  let oidcController: any;

  beforeAll(() => {
    strapi = (global as any).strapiInstance;
    whitelistController = strapi.plugin('strapi-plugin-oidc').controller('whitelist');
    roleController = strapi.plugin('strapi-plugin-oidc').controller('role');
    oidcController = strapi.plugin('strapi-plugin-oidc').controller('oidc');
  });

  describe('Whitelist Controller', () => {
    afterAll(async () => {
      await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({
        where: { email: { $in: ['sync1@test.com', 'sync2@test.com', 'sync3@test.com'] } },
      });
    });

    it('should get and update settings via controller', async () => {
      const ctxUpdate = {
        request: {
          body: { useWhitelist: false, enforceOIDC: true },
        },
        body: null,
      };

      await whitelistController.updateSettings(ctxUpdate);
      expect(ctxUpdate.body).toEqual({ useWhitelist: false, enforceOIDC: true });

      const ctxInfo = { body: null };
      await whitelistController.info(ctxInfo);

      expect(ctxInfo.body).toMatchObject({
        useWhitelist: false,
        enforceOIDC: true,
      });
      // @ts-ignore
      expect(Array.isArray(ctxInfo.body.whitelistUsers)).toBe(true);
    });

    it('should force enforceOIDC to false if whitelist is enabled but empty', async () => {
      // Ensure the whitelist is empty
      await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({});

      const ctxUpdate = {
        request: {
          body: { useWhitelist: true, enforceOIDC: true },
        },
        body: null as any,
      };

      await whitelistController.updateSettings(ctxUpdate);

      // enforceOIDC should be forced to false
      expect(ctxUpdate.body).toEqual({ useWhitelist: true, enforceOIDC: false });

      // Restore settings for the next test
      await whitelistController.updateSettings({
        request: { body: { useWhitelist: false, enforceOIDC: true } },
        body: null as any,
      });
    });

    it('should return public settings', async () => {
      const ctxPublic = { body: null };
      await whitelistController.publicSettings(ctxPublic);
      expect(ctxPublic.body).toMatchObject({ enforceOIDC: true });
      expect(ctxPublic.body).toHaveProperty('ssoButtonText');
    });

    it('should register and remove whitelist users via controller', async () => {
      const ctxRegister = {
        request: {
          body: { email: 'controller-test@whitelist.com', roles: [1] },
        },
        body: null as any,
      };

      await whitelistController.register(ctxRegister);
      expect(ctxRegister.body.matchedExistingUsersCount).toBeGreaterThanOrEqual(0);

      // Verify it fails without an email
      const ctxRegisterFail = {
        request: {
          body: { email: '', roles: [1] },
        },
        body: null as any,
      };
      await whitelistController.register(ctxRegisterFail);
      expect(ctxRegisterFail.body.message).toBe('Please enter a valid email address');

      // Verify it's added
      const ctxInfo = { body: null as any };
      await whitelistController.info(ctxInfo);
      const addedUser = ctxInfo.body.whitelistUsers.find(
        (u: any) => u.email === 'controller-test@whitelist.com',
      );
      expect(addedUser).toBeDefined();

      // Remove it
      const ctxRemove = {
        params: { id: addedUser.id },
        body: null,
      };
      await whitelistController.removeEmail(ctxRemove);

      // Verify it's removed
      await whitelistController.info(ctxInfo);
      const removedUser = ctxInfo.body.whitelistUsers.find(
        (u: any) => u.email === 'controller-test@whitelist.com',
      );
      expect(removedUser).toBeUndefined();
    });

    it('should sync users successfully', async () => {
      // Create some initial users
      await strapi
        .plugin('strapi-plugin-oidc')
        .service('whitelist')
        .registerUser('sync1@test.com', [1]);

      const ctxSync = {
        request: {
          body: {
            users: [
              { email: 'sync2@test.com', roles: [2] },
              { email: 'sync3@test.com', roles: [1, 2] },
            ],
          },
        },
        body: null as any,
      };

      await whitelistController.syncUsers(ctxSync);
      expect(ctxSync.body.matchedExistingUsersCount).toBeGreaterThanOrEqual(0);

      // sync1 should be deleted, sync2 and sync3 should be added
      const ctxInfo = { body: null as any };
      await whitelistController.info(ctxInfo);

      const userEmails = ctxInfo.body.whitelistUsers.map((u: any) => u.email);
      expect(userEmails).not.toContain('sync1@test.com');
      expect(userEmails).toContain('sync2@test.com');
      expect(userEmails).toContain('sync3@test.com');
    });
  });

  describe('Role Controller', () => {
    it('should find roles', async () => {
      const ctxFind = {
        body: null as any,
        send: function (data: any) {
          this.body = data;
        },
      };
      await roleController.find(ctxFind);

      expect(Array.isArray(ctxFind.body)).toBe(true);
      expect(ctxFind.body.length).toBeGreaterThan(0);
    });

    it('should update roles', async () => {
      // 1. Fetch original roles to restore later
      const ctxFindOriginal = {
        body: null as any,
        send: function (data: any) {
          this.body = data;
        },
      };
      await roleController.find(ctxFindOriginal);
      const originalRoles = ctxFindOriginal.body;
      const originalRole4 = originalRoles.find((r: any) => r.oauth_type === '4')?.role || [];

      const ctxUpdate = {
        request: {
          body: {
            roles: [{ oauth_type: '4', role: [1, 2] }],
          },
        },
        body: null,
        send: function (data: any, status: number) {
          this.body = { data, status };
        },
      };

      await roleController.update(ctxUpdate);
      expect(ctxUpdate.body).toMatchObject({ data: {}, status: 204 });

      const ctxFind = {
        body: null as any,
        send: function (data: any) {
          this.body = data;
        },
      };
      await roleController.find(ctxFind);

      const updatedRole = ctxFind.body.find((r: any) => r.oauth_type === '4');
      expect(updatedRole.role).toEqual(expect.arrayContaining([1, 2]));

      // Restore the original roles
      const ctxRestore = {
        request: {
          body: {
            roles: [{ oauth_type: '4', role: originalRole4 }],
          },
        },
        body: null,
        send: function (data: any, status: number) {
          this.body = { data, status };
        },
      };
      await roleController.update(ctxRestore);
    });
  });

  describe('OIDC Controller (Logout)', () => {
    const makeLogoutCtx = (initialCookies: Record<string, string> = {}) => {
      const cookieCalls: Array<{ name: string; value: string; opts?: any }> = [];
      return {
        request: { secure: false },
        cookies: {
          get(name: string) {
            return initialCookies[name];
          },
          set(name: string, value: string, opts?: any) {
            cookieCalls.push({ name, value, opts });
          },
          calls: cookieCalls,
        },
        redirect(url: string) {
          (this as any).redirectedTo = url;
        },
      };
    };

    it('should redirect to OIDC provider logout URL for OIDC sessions', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        OIDC_LOGOUT_URL: 'https://mock-oidc.com/logout',
      });

      const ctxLogout = makeLogoutCtx({ oidc_authenticated: '1' });
      await oidcController.logout(ctxLogout);

      expect((ctxLogout as any).redirectedTo).toBe('https://mock-oidc.com/logout');
      expect(
        ctxLogout.cookies.calls.some(
          (c) => c.name === 'strapi_admin_refresh' && c.opts?.maxAge === 0,
        ),
      ).toBe(true);
      expect(
        ctxLogout.cookies.calls.some(
          (c) => c.name === 'oidc_authenticated' && c.opts?.maxAge === 0,
        ),
      ).toBe(true);
    });

    it('should redirect to admin login for non-OIDC sessions even if OIDC logout URL is configured', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', {
        OIDC_LOGOUT_URL: 'https://mock-oidc.com/logout',
      });
      strapi.config.set('admin.url', '/admin');

      const ctxLogout = makeLogoutCtx(); // no oidc_authenticated cookie
      await oidcController.logout(ctxLogout);

      expect((ctxLogout as any).redirectedTo).toBe('/admin/auth/login');
      expect(
        ctxLogout.cookies.calls.some(
          (c) => c.name === 'strapi_admin_refresh' && c.opts?.maxAge === 0,
        ),
      ).toBe(true);
    });

    it('should fallback to Strapi admin auth login if OIDC logout not configured', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_LOGOUT_URL: undefined });
      strapi.config.set('admin.url', '/custom-admin');

      const ctxLogout = makeLogoutCtx({ oidc_authenticated: '1' });
      await oidcController.logout(ctxLogout);

      expect((ctxLogout as any).redirectedTo).toBe('/custom-admin/auth/login');
      expect(
        ctxLogout.cookies.calls.some(
          (c) => c.name === 'strapi_admin_refresh' && c.opts?.maxAge === 0,
        ),
      ).toBe(true);
      expect(
        ctxLogout.cookies.calls.some(
          (c) => c.name === 'oidc_authenticated' && c.opts?.maxAge === 0,
        ),
      ).toBe(true);
    });
  });
});
