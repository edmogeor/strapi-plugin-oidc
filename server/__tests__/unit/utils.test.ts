import { describe, it, expect, beforeEach } from 'vitest';
import type { Core } from '@strapi/types';
import { createMockStrapi } from './mock-strapi';
import { getRetentionDays, isAuditLogEnabled, getPluginConfig } from '../../utils/pluginConfig';
import {
  getEnforceOIDCConfig,
  resolveEnforceOIDC,
  getSkipLoginPageConfig,
  resolveSkipLoginPage,
} from '../../utils/configFlag';
import { getClientIp } from '../../utils/ip';
import {
  shouldMarkSecure,
  clearAuthCookies,
  COOKIE_NAMES,
  reconcileCookieName,
} from '../../utils/cookies';

/* ------------------------------------------------------------------ */
/*  pluginConfig                                                       */
/* ------------------------------------------------------------------ */

describe('pluginConfig', () => {
  let strapi: Core.Strapi;

  beforeEach(() => {
    strapi = createMockStrapi();
  });

  describe('getRetentionDays', () => {
    it('returns the configured AUDIT_LOG_RETENTION_DAYS', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { AUDIT_LOG_RETENTION_DAYS: 30 });
      expect(getRetentionDays(strapi)).toBe(30);
    });

    it('defaults to 90 when not configured', () => {
      expect(getRetentionDays(strapi)).toBe(90);
    });

    it('throws for non-numeric string values (Zod rejects before Number() coercion)', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { AUDIT_LOG_RETENTION_DAYS: 'not-a-number' });
      expect(() => getRetentionDays(strapi)).toThrow();
    });
  });

  describe('OIDC_SKIP_LOGIN_PAGE', () => {
    it('returns null by default (deferring to DB)', () => {
      expect(getPluginConfig(strapi).OIDC_SKIP_LOGIN_PAGE).toBeNull();
    });

    it('returns true when configured', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_SKIP_LOGIN_PAGE: true });
      expect(getPluginConfig(strapi).OIDC_SKIP_LOGIN_PAGE).toBe(true);
    });

    it('coerces string "true" to true', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_SKIP_LOGIN_PAGE: 'true' });
      expect(getPluginConfig(strapi).OIDC_SKIP_LOGIN_PAGE).toBe(true);
    });

    it('returns null for invalid string values', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_SKIP_LOGIN_PAGE: 'yes' });
      expect(getPluginConfig(strapi).OIDC_SKIP_LOGIN_PAGE).toBeNull();
    });
  });

  describe('isAuditLogEnabled', () => {
    it('returns true when retention days is positive', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { AUDIT_LOG_RETENTION_DAYS: 30 });
      expect(isAuditLogEnabled(strapi)).toBe(true);
    });

    it('returns true when retention days is 90 (default)', () => {
      expect(isAuditLogEnabled(strapi)).toBe(true);
    });

    it('returns false when retention days is 0', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { AUDIT_LOG_RETENTION_DAYS: 0 });
      expect(isAuditLogEnabled(strapi)).toBe(false);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  configFlag (enforceOIDC + skipLoginPage)                           */
/* ------------------------------------------------------------------ */

describe('configFlag', () => {
  let strapi: Core.Strapi;

  beforeEach(() => {
    strapi = createMockStrapi();
  });

  describe('getEnforceOIDCConfig', () => {
    it('returns null when OIDC_ENFORCE is not set', () => {
      expect(getEnforceOIDCConfig(strapi)).toBeNull();
    });

    it('returns the boolean value when OIDC_ENFORCE is a boolean', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: true });
      expect(getEnforceOIDCConfig(strapi)).toBe(true);
    });

    it('parses string "true" as boolean true', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: 'true' });
      expect(getEnforceOIDCConfig(strapi)).toBe(true);
    });

    it('parses string "false" as boolean false', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: 'false' });
      expect(getEnforceOIDCConfig(strapi)).toBe(false);
    });

    it('returns null for invalid string values', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: 'yes' });
      expect(getEnforceOIDCConfig(strapi)).toBeNull();
    });
  });

  describe('resolveEnforceOIDC', () => {
    it('prefers config value when set to true', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: true });
      expect(resolveEnforceOIDC(strapi, false)).toBe(true);
    });

    it('prefers config value when set to false', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_ENFORCE: false });
      expect(resolveEnforceOIDC(strapi, true)).toBe(false);
    });

    it('falls back to dbValue when config is null', () => {
      expect(resolveEnforceOIDC(strapi, true)).toBe(true);
      expect(resolveEnforceOIDC(strapi, false)).toBe(false);
    });

    it('falls back to false when both config and dbValue are missing', () => {
      expect(resolveEnforceOIDC(strapi, undefined)).toBe(false);
    });
  });

  describe('getSkipLoginPageConfig', () => {
    it('returns null when OIDC_SKIP_LOGIN_PAGE is not set', () => {
      expect(getSkipLoginPageConfig(strapi)).toBeNull();
    });

    it('returns the boolean value when OIDC_SKIP_LOGIN_PAGE is a boolean', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_SKIP_LOGIN_PAGE: true });
      expect(getSkipLoginPageConfig(strapi)).toBe(true);
    });

    it('parses string "true" as boolean true', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_SKIP_LOGIN_PAGE: 'true' });
      expect(getSkipLoginPageConfig(strapi)).toBe(true);
    });

    it('parses string "false" as boolean false', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_SKIP_LOGIN_PAGE: 'false' });
      expect(getSkipLoginPageConfig(strapi)).toBe(false);
    });

    it('returns null for invalid string values', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_SKIP_LOGIN_PAGE: 'yes' });
      expect(getSkipLoginPageConfig(strapi)).toBeNull();
    });
  });

  describe('resolveSkipLoginPage', () => {
    it('prefers config value when set to true', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_SKIP_LOGIN_PAGE: true });
      expect(resolveSkipLoginPage(strapi, false)).toBe(true);
    });

    it('prefers config value when set to false', () => {
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_SKIP_LOGIN_PAGE: false });
      expect(resolveSkipLoginPage(strapi, true)).toBe(false);
    });

    it('falls back to dbValue when config is null', () => {
      expect(resolveSkipLoginPage(strapi, true)).toBe(true);
      expect(resolveSkipLoginPage(strapi, false)).toBe(false);
    });

    it('falls back to false when both config and dbValue are missing', () => {
      expect(resolveSkipLoginPage(strapi, undefined)).toBe(false);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  getClientIp                                                        */
/* ------------------------------------------------------------------ */

describe('getClientIp', () => {
  let strapi: Core.Strapi;

  beforeEach(() => {
    strapi = createMockStrapi();
  });

  const makeCtx = (
    opts: {
      ip?: string;
      proxy?: boolean;
      ips?: string[];
      headers?: Record<string, string>;
    } = {},
  ) => {
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
    expect(getClientIp(strapi, ctx as never)).toBe('10.0.0.1');
  });

  it('returns ctx.request.ips[0] when app.proxy is true and XFF is set', () => {
    const ctx = makeCtx({
      ip: '10.0.0.1',
      proxy: true,
      ips: ['1.2.3.4', '5.6.7.8'],
    });
    expect(getClientIp(strapi, ctx as never)).toBe('1.2.3.4');
  });

  it('falls back to ctx.ip when app.proxy is true but no forwarded IPs are present', () => {
    const ctx = makeCtx({ ip: '10.0.0.1', proxy: true, ips: [] });
    expect(getClientIp(strapi, ctx as never)).toBe('10.0.0.1');
  });

  it('ignores CF-Connecting-IP when OIDC_TRUSTED_IP_HEADER is unset', () => {
    const ctx = makeCtx({
      ip: '10.0.0.1',
      proxy: true,
      ips: ['1.2.3.4'],
      headers: { 'CF-Connecting-IP': '9.9.9.9' },
    });
    expect(getClientIp(strapi, ctx as never)).toBe('1.2.3.4');
  });

  it.each([
    ['cf-connecting-ip', 'CF-Connecting-IP'],
    ['true-client-ip', 'True-Client-IP'],
    ['x-real-ip', 'X-Real-IP'],
    ['fastly-client-ip', 'Fastly-Client-IP'],
  ])('reads %s when allow-listed and app.proxy is true', (headerConfig, headerName) => {
    strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_TRUSTED_IP_HEADER: headerConfig });
    const ctx = makeCtx({
      ip: '10.0.0.1',
      proxy: true,
      ips: ['1.2.3.4'],
      headers: { [headerName]: '9.9.9.9' },
    });
    expect(getClientIp(strapi, ctx as never)).toBe('9.9.9.9');
  });

  it('ignores trusted header when app.proxy is false', () => {
    strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_TRUSTED_IP_HEADER: 'cf-connecting-ip' });
    const ctx = makeCtx({
      ip: '10.0.0.1',
      proxy: false,
      headers: { 'CF-Connecting-IP': '9.9.9.9' },
    });
    expect(getClientIp(strapi, ctx as never)).toBe('10.0.0.1');
  });

  it('rejects unknown header names in OIDC_TRUSTED_IP_HEADER', () => {
    strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_TRUSTED_IP_HEADER: 'x-forwarded-for' });
    const ctx = makeCtx({
      ip: '10.0.0.1',
      proxy: true,
      ips: ['1.2.3.4'],
      headers: { 'X-Forwarded-For': '1.2.3.4' },
    });
    expect(getClientIp(strapi, ctx as never)).toBe('1.2.3.4');
  });
});

/* ------------------------------------------------------------------ */
/*  shouldMarkSecure                                                   */
/* ------------------------------------------------------------------ */

describe('shouldMarkSecure', () => {
  let strapi: Core.Strapi;

  beforeEach(() => {
    strapi = createMockStrapi();
  });

  const makeCtx = (opts: { secure?: boolean; proxy?: boolean; xfp?: string } = {}) => ({
    request: { secure: opts.secure ?? false },
    app: { proxy: opts.proxy ?? false },
    get(name: string) {
      if (name === 'x-forwarded-proto' && opts.xfp) return opts.xfp;
      return '';
    },
  });

  it('returns false in development regardless', () => {
    strapi.config.set('environment', 'development');
    expect(shouldMarkSecure(strapi, makeCtx({ secure: true }) as never)).toBe(false);
  });

  it('returns true in production when request is secure', () => {
    strapi.config.set('environment', 'production');
    strapi.config.set('plugin::strapi-plugin-oidc', {});
    expect(shouldMarkSecure(strapi, makeCtx({ secure: true }) as never)).toBe(true);
  });

  it('returns false in production when request is not secure and proxy is off', () => {
    strapi.config.set('environment', 'production');
    strapi.config.set('plugin::strapi-plugin-oidc', {});
    expect(shouldMarkSecure(strapi, makeCtx({ secure: false }) as never)).toBe(false);
  });

  it('returns true when proxy is trusted and x-forwarded-proto is https', () => {
    strapi.config.set('environment', 'production');
    strapi.config.set('plugin::strapi-plugin-oidc', {});
    expect(shouldMarkSecure(strapi, makeCtx({ proxy: true, xfp: 'https' }) as never)).toBe(true);
  });

  it('returns false when proxy is trusted but x-forwarded-proto is http', () => {
    strapi.config.set('environment', 'production');
    strapi.config.set('plugin::strapi-plugin-oidc', {});
    expect(shouldMarkSecure(strapi, makeCtx({ proxy: true, xfp: 'http' }) as never)).toBe(false);
  });

  it('returns true when OIDC_FORCE_SECURE_COOKIES is set', () => {
    strapi.config.set('environment', 'production');
    strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_FORCE_SECURE_COOKIES: true });
    expect(shouldMarkSecure(strapi, makeCtx() as never)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  cookies utils                                                      */
/* ------------------------------------------------------------------ */

describe('cookies utils', () => {
  let strapi: Core.Strapi;

  beforeEach(() => {
    strapi = createMockStrapi();
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

  const makeCtx = (opts: { secure?: boolean; xfp?: string } = {}) => {
    const calls: CookieCallArray = [];
    return {
      request: { secure: opts.secure ?? false },
      app: { proxy: false },
      cookies: {
        set(name: string, value: string, cookieOpts: Record<string, unknown>) {
          calls.push({ name, value, opts: cookieOpts });
        },
        calls,
      },
      get(name: string) {
        if (name === 'x-forwarded-proto' && opts.xfp) return opts.xfp;
        return '';
      },
    };
  };

  it('clearAuthCookies clears admin and OIDC cookies', () => {
    const ctx = makeCtx() as never;
    clearAuthCookies(strapi, ctx);
    const ctxCookies = (ctx as unknown as { cookies: { calls: CookieCallArray } }).cookies;
    expect(
      ctxCookies.calls.some(
        (c: CookieCall) => c.name === 'strapi_admin_refresh' && c.opts?.maxAge === 0,
      ),
    ).toBe(true);
    expect(
      ctxCookies.calls.some(
        (c: CookieCall) =>
          c.name === reconcileCookieName(COOKIE_NAMES.idToken, false) && c.opts?.path === '/',
      ),
    ).toBe(true);
    expect(
      ctxCookies.calls.some(
        (c: CookieCall) =>
          c.name === reconcileCookieName(COOKIE_NAMES.userEmail, false) && c.opts?.path === '/',
      ),
    ).toBe(true);
    expect(
      ctxCookies.calls.some(
        (c: CookieCall) =>
          c.name === reconcileCookieName(COOKIE_NAMES.state, false) &&
          c.opts?.path === '/' &&
          c.opts?.maxAge === 0,
      ),
    ).toBe(true);
    expect(
      ctxCookies.calls.some(
        (c: CookieCall) =>
          c.name === reconcileCookieName(COOKIE_NAMES.codeVerifier, false) &&
          c.opts?.path === '/' &&
          c.opts?.maxAge === 0,
      ),
    ).toBe(true);
    expect(
      ctxCookies.calls.some(
        (c: CookieCall) =>
          c.name === reconcileCookieName(COOKIE_NAMES.nonce, false) &&
          c.opts?.path === '/' &&
          c.opts?.maxAge === 0,
      ),
    ).toBe(true);
  });

  describe('in production with domain and strict sameSite', () => {
    beforeEach(() => {
      strapi.config.set('environment', 'production');
      strapi.config.set('admin.auth.cookie.domain', 'example.com');
      strapi.config.set('admin.auth.cookie.sameSite', 'strict');
      strapi.config.set('plugin::strapi-plugin-oidc', { OIDC_FORCE_SECURE_COOKIES: false });
    });

    const assertSecureCookie = (secure: boolean) => {
      const ctx = makeCtx({ secure }) as never;
      clearAuthCookies(strapi, ctx);
      const ctxCookies = (ctx as unknown as { cookies: { calls: CookieCallArray } }).cookies;
      const adminCall = ctxCookies.calls.find((c) => c.name === 'strapi_admin_refresh');
      expect(adminCall?.opts?.secure).toBe(secure);
      expect(adminCall?.opts?.domain).toBe('example.com');
    };

    it('clearAuthCookies uses secure cookie when request is secure', () => {
      assertSecureCookie(true);
    });

    it('clearAuthCookies does not set secure flag when request is not secure', () => {
      assertSecureCookie(false);
    });
  });
});
