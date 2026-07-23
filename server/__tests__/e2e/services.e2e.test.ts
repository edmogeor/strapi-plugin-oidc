import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Core, WhitelistService, RoleService, OAuthService } from './test-types';

describe('OIDC Services E2E', () => {
  let strapi: Core.Strapi;
  let whitelistService: WhitelistService;
  let roleService: RoleService;
  let oauthService: OAuthService;

  beforeAll(() => {
    strapi = globalThis.strapiInstance;
    whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
    roleService = strapi.plugin('strapi-plugin-oidc').service('role');
    oauthService = strapi.plugin('strapi-plugin-oidc').service('oauth');
  });

  describe('Whitelist Service', () => {
    afterAll(async () => {
      await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({
        where: {
          email: {
            $in: ['e2e-test@whitelist.com', 'unknown@whitelist.com', 'admin-count@test.com'],
          },
        },
      });
    });

    it('should set and get settings from store', async () => {
      await whitelistService.setSettings({
        useWhitelist: true,
        enforceOIDC: true,
        skipLoginPage: false,
      });
      const settings = await whitelistService.getSettings();

      expect(settings).toEqual({ useWhitelist: true, enforceOIDC: true, skipLoginPage: false });
    });

    it('should register a new user in whitelist', async () => {
      await whitelistService.registerUser('e2e-test@whitelist.com');

      const user = await whitelistService.checkWhitelistForEmail('e2e-test@whitelist.com');
      expect(user).toBeDefined();
      expect(user!.email).toBe('e2e-test@whitelist.com');
    });

    it('should throw when user not in whitelist and whitelist is active', async () => {
      await whitelistService.setSettings({
        useWhitelist: true,
        enforceOIDC: false,
        skipLoginPage: false,
      });

      await expect(
        whitelistService.checkWhitelistForEmail('unknown@whitelist.com'),
      ).rejects.toThrow('Not present in whitelist');
    });

    it('should allow any user if whitelist is disabled', async () => {
      await whitelistService.setSettings({
        useWhitelist: false,
        enforceOIDC: false,
        skipLoginPage: false,
      });

      const result = await whitelistService.checkWhitelistForEmail('unknown@whitelist.com');
      expect(result).toBeNull();
    });

    it('hasUser returns true for registered email', async () => {
      await whitelistService.registerUser('e2e-test@whitelist.com');
      const result = await whitelistService.hasUser('e2e-test@whitelist.com');
      expect(result).toBe(true);
    });

    it('hasUser returns false for unregistered email', async () => {
      const result = await whitelistService.hasUser('notregistered@whitelist.com');
      expect(result).toBe(false);
    });

    it('deleteAllUsers empties the whitelist table', async () => {
      await whitelistService.registerUser('e2e-test@whitelist.com');
      await whitelistService.registerUser('unknown@whitelist.com');

      let users = await whitelistService.getUsers();
      expect(users.length).toBeGreaterThan(0);

      await whitelistService.deleteAllUsers();

      users = await whitelistService.getUsers();
      expect(users).toHaveLength(0);
    });
  });

  describe('Role Service', () => {
    it('should list OIDC roles', async () => {
      let allRoles = await roleService.find();
      if (allRoles.length === 0) {
        await strapi.query('plugin::strapi-plugin-oidc.roles').create({
          data: { oauth_type: '4', roles: [] },
        });
        allRoles = await roleService.find();
      }
      expect(Array.isArray(allRoles)).toBe(true);
      expect(allRoles.length).toBeGreaterThan(0);
    });
  });

  describe('OAuth Service', () => {
    it('should parse locale header', () => {
      const locale = oauthService.localeFindByHeader({
        'accept-language': 'ja-JP,ja;q=0.9,en;q=0.8',
      });
      expect(locale).toBe('ja');

      const defaultLocale = oauthService.localeFindByHeader({});
      expect(defaultLocale).toBe('en');
    });

    it('renderSignUpSuccess should set isLoggedIn flag in localStorage', () => {
      const html = oauthService.renderSignUpSuccess(
        'mock-jwt',
        { id: 1, email: 'test@test.com' },
        'mock-nonce',
        false,
      );
      expect(html).toContain("localStorage.setItem('isLoggedIn', 'true')");
    });
  });
});
