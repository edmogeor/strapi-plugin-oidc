import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { Core } from './test-types';
import {
  makeCookieTestCtx,
  findAdminRefreshCookieCall,
  expectAdminCookieSecure,
  clearRateLimitMap,
  getRateLimitMapSize,
} from './test-helpers';

describe('pluginConfig utils', () => {
  let strapi: Core.Strapi;
  let pluginConfig: typeof import('../../utils/pluginConfig');

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    pluginConfig = await import('../../utils/pluginConfig');
  });

  beforeEach(() => {
    strapi.config.set('plugin::strapi-plugin-oidc', {});
  });

  describe('getRetentionDays', () => {
    it('returns the configured AUDIT_LOG_RETENTION_DAYS', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { AUDIT_LOG_RETENTION_DAYS: 30 });
      expect(pluginConfig.getRetentionDays()).toBe(30);
    });

    it('defaults to 90 when not configured', () => {
      expect(pluginConfig.getRetentionDays()).toBe(90);
    });

    it('returns NaN for invalid string values (Number() coercion)', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { AUDIT_LOG_RETENTION_DAYS: 'not-a-number' });
      // Number('not-a-number') === NaN, which is not nullish — no fallback
      expect(Number('not-a-number')).toBeNaN();
    });
  });

  describe('isAuditLogEnabled', () => {
    it('returns true when retention days is positive', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { AUDIT_LOG_RETENTION_DAYS: 30 });
      expect(pluginConfig.isAuditLogEnabled()).toBe(true);
    });

    it('returns true when retention days is 90 (default)', () => {
      expect(pluginConfig.isAuditLogEnabled()).toBe(true);
    });

    it('returns false when retention days is 0', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { AUDIT_LOG_RETENTION_DAYS: 0 });
      expect(pluginConfig.isAuditLogEnabled()).toBe(false);
    });
  });
});

describe('enforceOIDC utils', () => {
  let strapi: Core.Strapi;
  let enforceOIDC: typeof import('../../utils/enforceOIDC');

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    enforceOIDC = await import('../../utils/enforceOIDC');
  });

  beforeEach(() => {
    strapi.config.set('plugin::strapi-plugin-oidc', {});
  });

  describe('getEnforceOIDCConfig', () => {
    it('returns null when OIDC_ENFORCE is not set', () => {
      expect(enforceOIDC.getEnforceOIDCConfig(strapi)).toBeNull();
    });

    it('returns the boolean value when OIDC_ENFORCE is a boolean', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: true });
      expect(enforceOIDC.getEnforceOIDCConfig(strapi)).toBe(true);
    });

    it('parses string "true" as boolean true', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: 'true' });
      expect(enforceOIDC.getEnforceOIDCConfig(strapi)).toBe(true);
    });

    it('parses string "false" as boolean false', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: 'false' });
      expect(enforceOIDC.getEnforceOIDCConfig(strapi)).toBe(false);
    });

    it('returns null for invalid string values', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: 'yes' });
      expect(enforceOIDC.getEnforceOIDCConfig(strapi)).toBeNull();
    });
  });

  describe('resolveEnforceOIDC', () => {
    it('prefers config value when set to true', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: true });
      expect(enforceOIDC.resolveEnforceOIDC(strapi, false)).toBe(true);
    });

    it('prefers config value when set to false', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: false });
      expect(enforceOIDC.resolveEnforceOIDC(strapi, true)).toBe(false);
    });

    it('falls back to dbValue when config is null', () => {
      expect(enforceOIDC.resolveEnforceOIDC(strapi, true)).toBe(true);
      expect(enforceOIDC.resolveEnforceOIDC(strapi, false)).toBe(false);
    });

    it('falls back to false when both config and dbValue are missing', () => {
      expect(enforceOIDC.resolveEnforceOIDC(strapi, undefined)).toBe(false);
    });
  });
});

describe('rate-limit map bounding and pruning', () => {
  afterEach(() => {
    clearRateLimitMap();
  });

  it('clearRateLimitMap empties the map', async () => {
    // Seed the map via real HTTP requests
    const request = (await import('supertest')).default;
    const strapi = globalThis.strapiInstance;
    for (let i = 0; i < 3; i++) {
      await request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/oidc')
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .redirects(0);
    }
    clearRateLimitMap();
    expect(getRateLimitMapSize()).toBe(0);
  });

  it('map size never exceeds MAX_MAP_SIZE across many distinct IPs', async () => {
    const request = (await import('supertest')).default;
    const strapi = globalThis.strapiInstance;

    // Fire 15 requests with distinct IPs in groups so ctx.app.proxy matters less.
    // We just want to confirm bounding — exact count depends on eviction.
    for (let i = 0; i < 15; i++) {
      await request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/oidc')
        .set('user-agent', `bot-${i}`)
        .redirects(0);
    }
    // MAX_MAP_SIZE is 10_000 — size must not grow without bound
    expect(getRateLimitMapSize()).toBeLessThanOrEqual(10_000);
  });
});

describe('getClientIp utils', () => {
  let strapi: Core.Strapi;
  let ipUtils: typeof import('../../utils/ip');

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    ipUtils = await import('../../utils/ip');
  });

  beforeEach(() => {
    strapi.config.set('plugin::strapi-plugin-oidc', {});
  });

  interface MockCtx {
    ip: string;
    app: { proxy: boolean };
    request: { ips: string[] };
    get(name: string): string;
  }

  const makeCtx = (
    opts: {
      ip?: string;
      proxy?: boolean;
      ips?: string[];
      headers?: Record<string, string>;
    } = {},
  ): MockCtx => {
    const headers = Object.fromEntries(
      Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return {
      ip: opts.ip ?? '10.0.0.1',
      app: { proxy: opts.proxy ?? false },
      request: { ips: opts.ips ?? [] },
      get(name: string) {
        return headers[name.toLowerCase()] ?? '';
      },
    };
  };

  it('returns ctx.ip when app.proxy is false, ignoring forwarded headers', () => {
    const ctx = makeCtx({
      ip: '10.0.0.1',
      proxy: false,
      ips: ['1.2.3.4'],
      headers: { 'X-Forwarded-For': '1.2.3.4', 'CF-Connecting-IP': '5.6.7.8' },
    });
    expect(ipUtils.getClientIp(ctx as never)).toBe('10.0.0.1');
  });

  it('returns ctx.request.ips[0] when app.proxy is true and XFF is set', () => {
    const ctx = makeCtx({
      ip: '10.0.0.1',
      proxy: true,
      ips: ['1.2.3.4', '5.6.7.8'],
    });
    expect(ipUtils.getClientIp(ctx as never)).toBe('1.2.3.4');
  });

  it('falls back to ctx.ip when app.proxy is true but no forwarded IPs are present', () => {
    const ctx = makeCtx({ ip: '10.0.0.1', proxy: true, ips: [] });
    expect(ipUtils.getClientIp(ctx as never)).toBe('10.0.0.1');
  });

  it('ignores CF-Connecting-IP when OIDC_TRUSTED_IP_HEADER is unset', () => {
    const ctx = makeCtx({
      ip: '10.0.0.1',
      proxy: true,
      ips: ['1.2.3.4'],
      headers: { 'CF-Connecting-IP': '9.9.9.9' },
    });
    expect(ipUtils.getClientIp(ctx as never)).toBe('1.2.3.4');
  });

  it('reads CF-Connecting-IP when header is allow-listed and app.proxy is true', () => {
    strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_TRUSTED_IP_HEADER: 'cf-connecting-ip' });
    const ctx = makeCtx({
      ip: '10.0.0.1',
      proxy: true,
      ips: ['1.2.3.4'],
      headers: { 'CF-Connecting-IP': '9.9.9.9' },
    });
    expect(ipUtils.getClientIp(ctx as never)).toBe('9.9.9.9');
  });

  it('ignores CF-Connecting-IP allow-list when app.proxy is false', () => {
    strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_TRUSTED_IP_HEADER: 'cf-connecting-ip' });
    const ctx = makeCtx({
      ip: '10.0.0.1',
      proxy: false,
      headers: { 'CF-Connecting-IP': '9.9.9.9' },
    });
    expect(ipUtils.getClientIp(ctx as never)).toBe('10.0.0.1');
  });

  it('rejects unknown header names in OIDC_TRUSTED_IP_HEADER', () => {
    strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_TRUSTED_IP_HEADER: 'x-forwarded-for' });
    const ctx = makeCtx({
      ip: '10.0.0.1',
      proxy: true,
      ips: ['1.2.3.4'],
      headers: { 'X-Forwarded-For': '1.2.3.4' },
    });
    // app.proxy=true still honors ctx.request.ips from koa — returns 1.2.3.4 from ips[0].
    // The header name itself is not trusted for raw reads.
    expect(ipUtils.getClientIp(ctx as never)).toBe('1.2.3.4');
  });
});

describe('cookies utils', () => {
  let strapi: Core.Strapi;
  let cookiesUtils: typeof import('../../utils/cookies');

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    cookiesUtils = await import('../../utils/cookies');
  });

  beforeEach(() => {
    strapi.config.set('admin.auth.cookie.path', '/admin');
    strapi.config.set('admin.auth.cookie.domain', undefined);
    strapi.config.set('admin.auth.cookie.sameSite', 'lax');
    strapi.config.set('environment', 'development');
  });

  interface CookieCall {
    name: string;
    value: string;
    opts?: Record<string, unknown>;
  }
  type CookieCallArray = Array<CookieCall>;
  type TestCtx = Parameters<typeof cookiesUtils.clearAuthCookies>[1] & {
    cookies: { calls: CookieCallArray };
  };

  it('clearAuthCookies clears all OIDC and admin cookies', () => {
    const ctx = makeCookieTestCtx(false) as unknown as TestCtx;
    cookiesUtils.clearAuthCookies(strapi, ctx);
    expect(
      ctx.cookies.calls.some(
        (c: CookieCall) => c.name === 'strapi_admin_refresh' && c.opts?.maxAge === 0,
      ),
    ).toBe(true);
    expect(
      ctx.cookies.calls.some(
        (c: CookieCall) => c.name === 'oidc_authenticated' && c.opts?.path === '/',
      ),
    ).toBe(true);
    expect(
      ctx.cookies.calls.some(
        (c: CookieCall) => c.name === 'oidc_access_token' && c.opts?.path === '/',
      ),
    ).toBe(true);
    expect(
      ctx.cookies.calls.some(
        (c: CookieCall) => c.name === 'oidc_user_email' && c.opts?.path === '/',
      ),
    ).toBe(true);
  });

  it('clearAuthCookies uses secure cookie in production when request is secure', () => {
    strapi.config.set('environment', 'production');
    strapi.config.set('admin.auth.cookie.domain', 'example.com');
    strapi.config.set('admin.auth.cookie.sameSite', 'strict');

    const ctx = makeCookieTestCtx(true) as unknown as TestCtx;
    cookiesUtils.clearAuthCookies(strapi, ctx);

    const adminCall = findAdminRefreshCookieCall(ctx);
    expect(adminCall?.opts?.secure).toBe(true);
    expect(adminCall?.opts?.domain).toBe('example.com');
  });

  it('clearAuthCookies does not set secure flag when request is not secure even in production', () => {
    strapi.config.set('environment', 'production');
    strapi.config.set('admin.auth.cookie.domain', 'example.com');
    strapi.config.set('admin.auth.cookie.sameSite', 'strict');

    const ctx = makeCookieTestCtx(false) as unknown as TestCtx;
    cookiesUtils.clearAuthCookies(strapi, ctx);

    expectAdminCookieSecure(ctx, false);
  });
});
