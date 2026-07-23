import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context, Next } from 'koa';
import type { Core } from '@strapi/types';
import type { WhitelistService } from '../../../types';
import { createEnforceOidcMiddleware } from '../../../middleware/enforceOidc';
import { COOKIE_NAMES } from '../../../utils/cookies';
import { OIDC_SIGN_IN_PATH } from '../../../../shared/constants';
import { createMockStrapi } from '../mock-strapi';

interface MockCookieCall {
  name: string;
  value: string | null;
  opts?: Record<string, unknown>;
}

interface TestContext extends Context {
  redirectedTo?: string;
  status: number;
  body: unknown;
  headers: Record<string, string>;
  cookies: Context['cookies'] & { calls: MockCookieCall[] };
}

const makeCtx = (opts: {
  path: string;
  method?: string;
  cookies?: Record<string, string>;
}): TestContext => {
  const calls: MockCookieCall[] = [];
  const ctx = {
    request: { path: opts.path, method: opts.method ?? 'GET' },
    cookies: {
      get(name: string) {
        return opts.cookies?.[name];
      },
      set(name: string, value: string | null, cookieOpts?: Record<string, unknown>) {
        calls.push({ name, value, opts: cookieOpts });
      },
      calls,
    },
    redirect(url: string) {
      ctx.redirectedTo = url;
    },
    status: 200,
    body: undefined,
    headers: {},
    set(name: string, value: string) {
      ctx.headers[name] = value;
    },
  } as TestContext;
  return ctx;
};

const next = vi.fn(async () => {});

const createMockWhitelistService = (
  settings: {
    enforceOIDC?: boolean;
    skipLoginPage?: boolean;
  } = {},
) =>
  ({
    getSettings: vi.fn().mockResolvedValue(settings),
    setSettings: vi.fn().mockResolvedValue(undefined),
  }) as unknown as WhitelistService;

vi.mock('../../../utils/services', () => ({
  getWhitelistService: vi.fn(),
}));

const { getWhitelistService } = await import('../../../utils/services');

describe('createEnforceOidcMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    next.mockClear();
  });

  describe('skip login page redirect', () => {
    it('redirects unauthenticated GET requests on admin paths when skipLoginPage is true', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ skipLoginPage: true }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin', method: 'GET' });

      await middleware(ctx, next as Next);

      expect(ctx.redirectedTo).toBe(OIDC_SIGN_IN_PATH);
      expect(next).not.toHaveBeenCalled();
    });

    it('does not redirect when skipLoginPage is false', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ skipLoginPage: false }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin/login', method: 'GET' });

      await middleware(ctx, next as Next);

      expect(ctx.redirectedTo).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('does not redirect when the user already has a refresh cookie', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ skipLoginPage: true }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({
        path: '/admin/login',
        method: 'GET',
        cookies: { [COOKIE_NAMES.adminRefresh]: 'present' },
      });

      await middleware(ctx, next as Next);

      expect(ctx.redirectedTo).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('does not redirect excluded paths', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ skipLoginPage: true }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin/register', method: 'GET' });

      await middleware(ctx, next as Next);

      expect(ctx.redirectedTo).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('does not redirect static assets', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ skipLoginPage: true }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin/runtime.js', method: 'GET' });

      await middleware(ctx, next as Next);

      expect(ctx.redirectedTo).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('does not redirect non-admin paths', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ skipLoginPage: true }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/api/content', method: 'GET' });

      await middleware(ctx, next as Next);

      expect(ctx.redirectedTo).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('does not redirect non-GET requests', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ skipLoginPage: true }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin/login', method: 'POST' });

      await middleware(ctx, next as Next);

      expect(ctx.redirectedTo).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });

  describe('enforce OIDC on auth routes', () => {
    it('returns 403 for POST auth routes when enforceOIDC is true', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ enforceOIDC: true }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin/login', method: 'POST' });

      await middleware(ctx, next as Next);

      expect(ctx.status).toBe(403);
      expect(ctx.body).toMatchObject({ error: { name: 'ForbiddenError' } });
      expect(next).not.toHaveBeenCalled();
    });

    it('allows POST auth routes when enforceOIDC is false', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ enforceOIDC: false }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin/login', method: 'POST' });

      await middleware(ctx, next as Next);

      expect(ctx.status).toBe(200);
      expect(next).toHaveBeenCalled();
    });

    it('does not block auth routes for GET requests', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ enforceOIDC: true }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin/login', method: 'GET' });

      await middleware(ctx, next as Next);

      expect(ctx.status).toBe(200);
      expect(next).toHaveBeenCalled();
    });

    it('returns 401 on token refresh without an OIDC id_token cookie when enforceOIDC is true', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ enforceOIDC: true }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin/token/refresh', method: 'POST' });

      await middleware(ctx, next as Next);

      expect(ctx.status).toBe(401);
      expect(ctx.body).toMatchObject({ error: { name: 'UnauthorizedError' } });
      expect(next).not.toHaveBeenCalled();
    });

    it('allows token refresh with an OIDC id_token cookie when enforceOIDC is true', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ enforceOIDC: true }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({
        path: '/admin/token/refresh',
        method: 'POST',
        cookies: { [COOKIE_NAMES.idToken]: 'present' },
      });

      await middleware(ctx, next as Next);

      expect(ctx.status).toBe(200);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('config precedence', () => {
    it('prefers env config over DB settings for enforceOIDC', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: true });
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ enforceOIDC: false }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin/login', method: 'POST' });

      await middleware(ctx, next as Next);

      expect(ctx.status).toBe(403);
    });

    it('prefers env config over DB settings for skipLoginPage', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_SKIP_LOGIN_PAGE: true });
      vi.mocked(getWhitelistService).mockReturnValue(
        createMockWhitelistService({ skipLoginPage: false }),
      );
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin/dashboard', method: 'GET' });

      await middleware(ctx, next as Next);

      expect(ctx.redirectedTo).toBe(OIDC_SIGN_IN_PATH);
    });
  });

  describe('error handling', () => {
    it('calls next when the whitelist service throws', async () => {
      const strapi = createMockStrapi() as unknown as Core.Strapi;
      vi.mocked(getWhitelistService).mockReturnValue({
        getSettings: vi.fn().mockRejectedValue(new Error('boom')),
        setSettings: vi.fn(),
      } as unknown as WhitelistService);
      const middleware = createEnforceOidcMiddleware(strapi, '/admin');
      const ctx = makeCtx({ path: '/admin/login', method: 'POST' });

      await middleware(ctx, next as Next);

      expect(ctx.status).toBe(200);
      expect(next).toHaveBeenCalled();
    });
  });
});
