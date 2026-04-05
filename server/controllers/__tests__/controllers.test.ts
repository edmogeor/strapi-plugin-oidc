import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import oidcController from '../oidc';
import roleController from '../role';
import whitelistController from '../whitelist';

vi.mock('axios');
vi.mock('pkce-challenge', () => ({
  default: vi.fn().mockResolvedValue({
    code_verifier: 'mock-verifier',
    code_challenge: 'mock-challenge',
  }),
}));

const mockConfig = {
  OIDC_CLIENT_ID: 'client_id',
  OIDC_CLIENT_SECRET: 'client_secret',
  OIDC_REDIRECT_URI: 'http://localhost/callback',
  OIDC_SCOPES: 'openid email',
  OIDC_TOKEN_ENDPOINT: 'http://token.endpoint',
  OIDC_USER_INFO_ENDPOINT: 'http://userinfo.endpoint',
  OIDC_GRANT_TYPE: 'authorization_code',
  OIDC_FAMILY_NAME_FIELD: 'family_name',
  OIDC_GIVEN_NAME_FIELD: 'given_name',
  OIDC_AUTHORIZATION_ENDPOINT: 'http://auth.endpoint',
};

describe('Controllers', () => {
  let strapi: any;
  let ctx: any;

  beforeEach(() => {
    strapi = {
      config: {
        get: vi.fn().mockReturnValue(mockConfig),
      },
      plugin: vi.fn().mockReturnValue({
        service: vi.fn().mockReturnValue({}),
      }),
      service: vi.fn().mockReturnValue({}),
      query: vi.fn().mockReturnValue({}),
    };
    global.strapi = strapi;

    ctx = {
      query: {},
      session: {},
      set: vi.fn(),
      send: vi.fn(),
      redirect: vi.fn(),
      request: {
        body: {},
        headers: {},
      },
      params: {},
    };
  });

  describe('OIDC Controller', () => {
    it('oidcSignIn should redirect to authorization endpoint', async () => {
      await oidcController.oidcSignIn(ctx);
      
      expect(ctx.set).toHaveBeenCalledWith(
        'Location',
        expect.stringContaining('http://auth.endpoint')
      );
      expect(ctx.set).toHaveBeenCalledWith(
        'Location',
        expect.stringContaining('response_type=code')
      );
      expect(ctx.set).toHaveBeenCalledWith(
        'Location',
        expect.stringContaining('code_challenge=mock-challenge')
      );
      expect(ctx.session.codeVerifier).toBe('mock-verifier');
      expect(ctx.send).toHaveBeenCalledWith({}, 302);
    });

    it('oidcSignInCallback should handle missing code', async () => {
      const mockOauthService = {
        renderSignUpError: vi.fn().mockReturnValue('Error: code Not Found'),
      };
      strapi.plugin.mockImplementation((name: string) => ({
        service: (serviceName: string) => serviceName === 'oauth' ? mockOauthService : {},
      }));

      await oidcController.oidcSignInCallback(ctx);
      
      expect(ctx.send).toHaveBeenCalledWith('Error: code Not Found');
    });

    it('logout should redirect to OIDC_LOGOUT_URL if configured', async () => {
      strapi.config.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'plugin::strapi-plugin-oidc') {
          return { OIDC_LOGOUT_URL: 'http://logout.url' };
        }
        return defaultValue;
      });

      await oidcController.logout(ctx);
      
      expect(ctx.redirect).toHaveBeenCalledWith('http://logout.url');
    });

    it('logout should redirect to admin panel if OIDC_LOGOUT_URL is not configured', async () => {
      strapi.config.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'plugin::strapi-plugin-oidc') {
          return {};
        }
        if (key === 'admin.url') {
          return '/custom-admin';
        }
        return defaultValue;
      });

      await oidcController.logout(ctx);
      
      expect(ctx.redirect).toHaveBeenCalledWith('/custom-admin/auth/login');
    });
  });

  describe('Role Controller', () => {
    it('find should return roles', async () => {
      const mockRoleService = {
        find: vi.fn().mockResolvedValue([{ oauth_type: '4', roles: [1, 2] }]),
        ssoRoles: vi.fn().mockReturnValue([{ oauth_type: '4', name: 'OIDC' }]),
      };
      strapi.plugin.mockReturnValue({ service: () => mockRoleService });

      await roleController.find(ctx);
      
      expect(ctx.send).toHaveBeenCalledWith([{ oauth_type: '4', name: 'OIDC', role: [1, 2] }]);
    });

    it('update should update roles', async () => {
      const mockRoleService = { update: vi.fn().mockResolvedValue(true) };
      strapi.plugin.mockReturnValue({ service: () => mockRoleService });
      ctx.request.body = { roles: [{ oauth_type: '4', role: [3] }] };

      await roleController.update(ctx);
      
      expect(mockRoleService.update).toHaveBeenCalledWith([{ oauth_type: '4', role: [3] }]);
      expect(ctx.send).toHaveBeenCalledWith({}, 204);
    });
  });

  describe('Whitelist Controller', () => {
    let mockWhitelistService: any;

    beforeEach(() => {
      mockWhitelistService = {
        getSettings: vi.fn().mockResolvedValue({ useWhitelist: true, enforceOIDC: false }),
        setSettings: vi.fn(),
        getUsers: vi.fn().mockResolvedValue([{ id: 1, email: 'test@example.com' }]),
        registerUser: vi.fn(),
        removeUser: vi.fn(),
      };
      strapi.plugin.mockReturnValue({ service: () => mockWhitelistService });
    });

    it('info should return settings and users', async () => {
      await whitelistController.info(ctx);
      
      expect(ctx.body).toEqual({
        useWhitelist: true,
        enforceOIDC: false,
        whitelistUsers: [{ id: 1, email: 'test@example.com' }],
      });
    });

    it('updateSettings should save settings', async () => {
      ctx.request.body = { useWhitelist: false, enforceOIDC: true };
      await whitelistController.updateSettings(ctx);
      
      expect(mockWhitelistService.setSettings).toHaveBeenCalledWith({ useWhitelist: false, enforceOIDC: true });
      expect(ctx.body).toEqual({ useWhitelist: false, enforceOIDC: true });
    });

    it('publicSettings should return enforceOIDC', async () => {
      await whitelistController.publicSettings(ctx);
      expect(ctx.body).toEqual({ enforceOIDC: false });
    });

    it('register should register users by email', async () => {
      ctx.request.body = { email: 'new@example.com', roles: [1] };
      const mockQuery = {
        findMany: vi.fn().mockResolvedValue([]),
        findOne: vi.fn().mockResolvedValue(null),
      };
      strapi.query.mockReturnValue(mockQuery);

      await whitelistController.register(ctx);
      
      expect(mockWhitelistService.registerUser).toHaveBeenCalledWith('new@example.com', [1]);
      expect(ctx.body).toEqual({ matchedExistingUsersCount: 0 });
    });

    it('removeEmail should remove user by id', async () => {
      ctx.params = { id: '1' };
      await whitelistController.removeEmail(ctx);
      
      expect(mockWhitelistService.removeUser).toHaveBeenCalledWith('1');
      expect(ctx.body).toEqual({});
    });
  });
});