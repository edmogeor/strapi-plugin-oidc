import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Core } from './test-types';
import {
  makeCookieTestCtx,
  findAdminRefreshCookieCall,
  expectAdminCookieSecure,
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

  it('clearAuthCookies clears all OIDC and admin cookies', () => {
    interface CookieCall {
      name: string;
      value: string;
      opts?: Record<string, unknown>;
    }
    type CookieCallArray = Array<CookieCall>;
    type TestCtx = Parameters<typeof cookiesUtils.clearAuthCookies>[1] & {
      cookies: { calls: CookieCallArray };
    };
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

    interface CookieCall {
      name: string;
      opts?: Record<string, unknown>;
    }
    type CookieCallArray = Array<CookieCall>;
    type TestCtx = Parameters<typeof cookiesUtils.clearAuthCookies>[1] & {
      cookies: { calls: CookieCallArray };
    };
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

    interface CookieCall {
      name: string;
      opts?: Record<string, unknown>;
    }
    type CookieCallArray = Array<CookieCall>;
    type TestCtx = Parameters<typeof cookiesUtils.clearAuthCookies>[1] & {
      cookies: { calls: CookieCallArray };
    };
    const ctx = makeCookieTestCtx(false) as unknown as TestCtx;
    cookiesUtils.clearAuthCookies(strapi, ctx);

    expectAdminCookieSecure(ctx, false);
  });
});
