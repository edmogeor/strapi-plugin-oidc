import { describe, it, expect, vi, beforeEach } from 'vitest';
import oauthService from '../../services/oauth';
import roleService from '../../services/role';
import whitelistService from '../../services/whitelist';

describe('strapi-plugin-oidc core services', () => {
  let strapi: any;

  beforeEach(() => {
    strapi = {
      service: vi.fn(),
      serviceMap: {
        get: vi.fn(),
      },
      getModel: vi.fn(),
      config: {
        get: vi.fn(),
        admin: {
          url: 'http://localhost:1337/admin',
        },
      },
      query: vi.fn(),
      store: vi.fn(),
    };
  });

  describe('oauthService', () => {
    let oauth: ReturnType<typeof oauthService>;

    beforeEach(() => {
      oauth = oauthService({ strapi });
    });

    it('should convert email with uppercase to lowercase and find existing user', async () => {
      const userService = {
        findOneByEmail: vi.fn().mockResolvedValue({ id: 1, email: 'test@example.com' }),
      };
      strapi.service.mockReturnValue(userService);

      const user = await oauth.createUser('Test@Example.com', 'Doe', 'John', 'en');
      
      expect(userService.findOneByEmail).toHaveBeenCalledWith('test@example.com');
      expect(user).toEqual({ id: 1, email: 'test@example.com' });
    });

    it('should create and register a new user if not found', async () => {
      const userService = {
        findOneByEmail: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ registrationToken: 'token123' }),
        register: vi.fn().mockResolvedValue({ id: 2, email: 'new@example.com' }),
      };
      strapi.service.mockReturnValue(userService);

      const user = await oauth.createUser('new@example.com', 'Smith', 'Jane', 'en', [1]);
      
      expect(userService.create).toHaveBeenCalledWith({
        firstname: 'Jane',
        lastname: 'Smith',
        email: 'new@example.com',
        roles: [1],
        preferedLanguage: 'en',
      });
      expect(userService.register).toHaveBeenCalled();
      expect(user).toEqual({ id: 2, email: 'new@example.com' });
    });

    it('should add gmail alias correctly', () => {
      expect(oauth.addGmailAlias('test@gmail.com', 'alias')).toBe('test+alias@gmail.com');
      expect(oauth.addGmailAlias('test@gmail.com', null)).toBe('test@gmail.com');
    });

    it('should find locale by header', () => {
      expect(oauth.localeFindByHeader({ 'accept-language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7' })).toBe('ja');
      expect(oauth.localeFindByHeader({ 'accept-language': 'en-US,en;q=0.9' })).toBe('en');
      expect(oauth.localeFindByHeader({})).toBe('en');
    });

    it('should render sign up success correctly', () => {
      strapi.config.get.mockReturnValue({ REMEMBER_ME: true });
      const html = oauth.renderSignUpSuccess('fake-jwt-token', { id: 1 }, 'nonce-123');
      expect(html).toContain('<script nonce="nonce-123">');
      expect(html).toContain('localStorage.setItem(\'jwtToken\', \'"fake-jwt-token"\');');
    });
  });

  describe('roleService', () => {
    let role: ReturnType<typeof roleService>;

    beforeEach(() => {
      role = roleService({ strapi });
    });

    it('should return SSO roles', () => {
      expect(role.ssoRoles()).toEqual([{ oauth_type: '4', name: 'OIDC' }]);
    });

    it('should fetch oidcRoles', async () => {
      const findOne = vi.fn().mockResolvedValue({ roles: [1, 2] });
      strapi.query.mockReturnValue({ findOne });

      const result = await role.oidcRoles();
      expect(strapi.query).toHaveBeenCalledWith('plugin::strapi-plugin-oidc.roles');
      expect(findOne).toHaveBeenCalledWith({ where: { oauth_type: '4' } });
      expect(result).toEqual({ roles: [1, 2] });
    });

    it('should find all roles', async () => {
      const findMany = vi.fn().mockResolvedValue([{ roles: [1] }]);
      strapi.query.mockReturnValue({ findMany });

      const result = await role.find();
      expect(findMany).toHaveBeenCalled();
      expect(result).toEqual([{ roles: [1] }]);
    });
  });

  describe('whitelistService', () => {
    let whitelist: ReturnType<typeof whitelistService>;

    beforeEach(() => {
      whitelist = whitelistService({ strapi });
    });

    it('should get default settings if not exists', async () => {
      const pluginStore = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };
      strapi.store.mockReturnValue(pluginStore);

      const settings = await whitelist.getSettings();
      expect(pluginStore.get).toHaveBeenCalledWith({ key: 'settings' });
      expect(pluginStore.set).toHaveBeenCalledWith({
        key: 'settings',
        value: { useWhitelist: true, enforceOIDC: false },
      });
      expect(settings).toEqual({ useWhitelist: true, enforceOIDC: false });
    });

    it('should return existing settings', async () => {
      const pluginStore = {
        get: vi.fn().mockResolvedValue({ useWhitelist: false, enforceOIDC: true }),
      };
      strapi.store.mockReturnValue(pluginStore);

      const settings = await whitelist.getSettings();
      expect(settings).toEqual({ useWhitelist: false, enforceOIDC: true });
    });

    it('should register a user', async () => {
      const create = vi.fn().mockResolvedValue({});
      strapi.query.mockReturnValue({ create });

      await whitelist.registerUser('test@example.com', [1, 2]);
      expect(create).toHaveBeenCalledWith({
        data: { email: 'test@example.com', roles: [1, 2] },
      });
    });

    it('should check whitelist for email and skip if whitelist is disabled', async () => {
      const pluginStore = {
        get: vi.fn().mockResolvedValue({ useWhitelist: false, enforceOIDC: false }),
      };
      strapi.store.mockReturnValue(pluginStore);

      const result = await whitelist.checkWhitelistForEmail('any@example.com');
      expect(result).toBeNull();
    });

    it('should check whitelist for email and throw if not found', async () => {
      const pluginStore = {
        get: vi.fn().mockResolvedValue({ useWhitelist: true, enforceOIDC: false }),
      };
      strapi.store.mockReturnValue(pluginStore);
      const findOne = vi.fn().mockResolvedValue(null);
      strapi.query.mockReturnValue({ findOne });

      await expect(whitelist.checkWhitelistForEmail('notfound@example.com')).rejects.toThrow('Not present in whitelist');
    });

    it('should check whitelist for email and return result if found', async () => {
      const pluginStore = {
        get: vi.fn().mockResolvedValue({ useWhitelist: true, enforceOIDC: false }),
      };
      strapi.store.mockReturnValue(pluginStore);
      const findOne = vi.fn().mockResolvedValue({ id: 1, email: 'found@example.com' });
      strapi.query.mockReturnValue({ findOne });

      const result = await whitelist.checkWhitelistForEmail('found@example.com');
      expect(result).toEqual({ id: 1, email: 'found@example.com' });
    });
  });
});