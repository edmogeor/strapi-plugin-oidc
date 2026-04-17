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
      await whitelistService.setSettings({ useWhitelist: true, enforceOIDC: true });
      const settings = await whitelistService.getSettings();

      expect(settings).toEqual({ useWhitelist: true, enforceOIDC: true });
    });

    it('should register a new user in whitelist', async () => {
      await whitelistService.registerUser('e2e-test@whitelist.com');

      const user = await whitelistService.checkWhitelistForEmail('e2e-test@whitelist.com');
      expect(user).toBeDefined();
      expect(user!.email).toBe('e2e-test@whitelist.com');
    });

    it('should throw when user not in whitelist and whitelist is active', async () => {
      await whitelistService.setSettings({ useWhitelist: true, enforceOIDC: false });

      await expect(
        whitelistService.checkWhitelistForEmail('unknown@whitelist.com'),
      ).rejects.toThrow('Not present in whitelist');
    });

    it('should allow any user if whitelist is disabled', async () => {
      await whitelistService.setSettings({ useWhitelist: false, enforceOIDC: false });

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

    it('countAdminUsersByEmails returns correct count', async () => {
      const superAdmin = await strapi.db.query('admin::user').findOne({
        where: { email: 'admin@strapi.test' },
      });

      const countAll = await whitelistService.countAdminUsersByEmails([
        'admin@strapi.test',
        'nonexistent@test.com',
      ]);
      expect(countAll).toBe(superAdmin ? 1 : 0);

      const countNone = await whitelistService.countAdminUsersByEmails(['nonexistent@test.com']);
      expect(countNone).toBe(0);

      const countEmpty = await whitelistService.countAdminUsersByEmails([]);
      expect(countEmpty).toBe(0);
    });
  });

  describe('Role Service', () => {
    it('should list admin roles and default oidc roles', async () => {
      const oidcRoles = roleService.getOidcRoles();
      expect(oidcRoles).toHaveLength(1);
      expect(oidcRoles[0].name).toBe('OIDC');

      const allRoles = await roleService.find();
      expect(Array.isArray(allRoles)).toBe(true);
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

    it('should properly format Gmail aliases', () => {
      expect(oauthService.addGmailAlias('user@gmail.com', 'test')).toBe('user+test@gmail.com');
    });

    it('renderSignUpSuccess should set isLoggedIn flag in localStorage', () => {
      const html = oauthService.renderSignUpSuccess(
        'mock-jwt',
        { id: 1, email: 'test@test.com' },
        'mock-nonce',
      );
      expect(html).toContain("localStorage.setItem('isLoggedIn', 'true')");
    });
  });
});
