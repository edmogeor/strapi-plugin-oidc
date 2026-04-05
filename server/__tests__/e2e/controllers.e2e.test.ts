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
        where: { email: { $in: ['sync1@test.com', 'sync2@test.com', 'sync3@test.com'] } }
      });
    });

    it('should get and update settings via controller', async () => {
      const ctxUpdate = {
        request: {
          body: { useWhitelist: false, enforceOIDC: true }
        },
        body: null
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

    it('should return public settings', async () => {
      const ctxPublic = { body: null };
      await whitelistController.publicSettings(ctxPublic);
      expect(ctxPublic.body).toEqual({ enforceOIDC: true });
    });

    it('should register and remove whitelist users via controller', async () => {
      const ctxRegister = {
        request: {
          body: { email: 'controller-test@whitelist.com', roles: [1] }
        },
        body: null as any
      };

      await whitelistController.register(ctxRegister);
      expect(ctxRegister.body.matchedExistingUsersCount).toBeGreaterThanOrEqual(0);

      // Verify it fails without an email
      const ctxRegisterFail = {
        request: {
          body: { email: '', roles: [1] }
        },
        body: null as any
      };
      await whitelistController.register(ctxRegisterFail);
      expect(ctxRegisterFail.body.message).toBe('Please enter a valid email address');

      // Verify it's added
      const ctxInfo = { body: null as any };
      await whitelistController.info(ctxInfo);
      const addedUser = ctxInfo.body.whitelistUsers.find((u: any) => u.email === 'controller-test@whitelist.com');
      expect(addedUser).toBeDefined();

      // Remove it
      const ctxRemove = {
        params: { id: addedUser.id },
        body: null
      };
      await whitelistController.removeEmail(ctxRemove);

      // Verify it's removed
      await whitelistController.info(ctxInfo);
      const removedUser = ctxInfo.body.whitelistUsers.find((u: any) => u.email === 'controller-test@whitelist.com');
      expect(removedUser).toBeUndefined();
    });

    it('should sync users successfully', async () => {
      // Create some initial users
      await strapi.plugin('strapi-plugin-oidc').service('whitelist').registerUser('sync1@test.com', [1]);
      
      const ctxSync = {
        request: {
          body: {
            users: [
              { email: 'sync2@test.com', roles: [2] },
              { email: 'sync3@test.com', roles: [1, 2] }
            ]
          }
        },
        body: null as any
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
      const ctxFind = { body: null as any, send: function(data: any) { this.body = data; } };
      await roleController.find(ctxFind);
      
      expect(Array.isArray(ctxFind.body)).toBe(true);
      expect(ctxFind.body.length).toBeGreaterThan(0);
    });

    it('should update roles', async () => {
      const ctxUpdate = {
        request: {
          body: {
            roles: [{ oauth_type: '4', role: [1, 2] }]
          }
        },
        body: null,
        send: function(data: any, status: number) { this.body = { data, status }; }
      };

      await roleController.update(ctxUpdate);
      expect(ctxUpdate.body).toMatchObject({ data: {}, status: 204 });

      const ctxFind = { body: null as any, send: function(data: any) { this.body = data; } };
      await roleController.find(ctxFind);
      
      const updatedRole = ctxFind.body.find((r: any) => r.oauth_type === '4');
      expect(updatedRole.role).toEqual(expect.arrayContaining([1, 2]));
    });
  });

  describe('OIDC Controller (Logout)', () => {
    it('should redirect to OIDC provider logout URL if configured', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_LOGOUT_URL: 'https://mock-oidc.com/logout' });
      
      const ctxLogout = { redirect: (url: string) => { (ctxLogout as any).redirectedTo = url; } };
      await oidcController.logout(ctxLogout);
      
      expect((ctxLogout as any).redirectedTo).toBe('https://mock-oidc.com/logout');
    });

    it('should fallback to Strapi admin auth login if OIDC logout not configured', async () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_LOGOUT_URL: undefined });
      strapi.config.set('admin.url', '/custom-admin');
      
      const ctxLogout = { redirect: (url: string) => { (ctxLogout as any).redirectedTo = url; } };
      await oidcController.logout(ctxLogout);
      
      expect((ctxLogout as any).redirectedTo).toBe('/custom-admin/auth/login');
    });
  });
});
