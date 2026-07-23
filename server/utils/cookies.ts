import { getPluginConfig } from './pluginConfig';
import { OIDC_COOKIE_PATH } from '../../shared/constants';
import type { StrapiConfigLogger, StrapiContext, SecureContext, CookieContext } from '../types';

export const COOKIE_NAMES = {
  state: '__Host-oidc_state',
  codeVerifier: '__Host-oidc_code_verifier',
  nonce: '__Host-oidc_nonce',
  idToken: '__Host-oidc_id_token',
  userEmail: '__Host-oidc_user_email',
  adminRefresh: 'strapi_admin_refresh',
} as const;

export function reconcileCookieName(name: string, secure: boolean): string {
  if (!secure && name.startsWith('__Host-')) {
    return name.slice(7);
  }
  return name;
}

export function readCookie(ctx: StrapiContext, name: string): string | undefined {
  const value = ctx.cookies.get(name);
  if (value !== undefined) return value;
  if (name.startsWith('__Host-')) {
    return ctx.cookies.get(name.slice(7));
  }
  return undefined;
}

export function shouldMarkSecure(strapi: StrapiConfigLogger, ctx: SecureContext): boolean {
  const config = getPluginConfig(strapi);
  if (config.OIDC_FORCE_SECURE_COOKIES === true) return true;

  const isProduction = strapi.config.get('environment') === 'production';
  if (!isProduction) return false;

  if (ctx.request.secure) return true;

  if (ctx.get('x-forwarded-proto') === 'https') return true;

  return false;
}

function parseSameSite(value: unknown): 'lax' | 'strict' | 'none' {
  const str = String(value);
  return str === 'lax' || str === 'strict' || str === 'none' ? str : 'lax';
}

function getExpiredCookieOptions(strapi: StrapiConfigLogger, ctx: SecureContext) {
  return {
    httpOnly: true,
    secure: shouldMarkSecure(strapi, ctx),
    path: String(strapi.config.get('admin.auth.cookie.path', '/admin')),
    domain:
      String(
        strapi.config.get('admin.auth.cookie.domain') ||
          strapi.config.get('admin.auth.domain') ||
          '',
      ) || undefined,
    sameSite: parseSameSite(strapi.config.get('admin.auth.cookie.sameSite', 'lax')),
    maxAge: 0,
    expires: new Date(0),
  };
}

export function clearAuthCookies(strapi: StrapiConfigLogger, ctx: CookieContext) {
  const options = getExpiredCookieOptions(strapi, ctx);
  const secureFlag = shouldMarkSecure(strapi, ctx);

  const pkceCookieOptions = {
    httpOnly: true,
    secure: secureFlag,
    sameSite: 'lax' as const,
    path: OIDC_COOKIE_PATH,
    maxAge: 0,
    expires: new Date(0),
  };

  ctx.cookies.set(COOKIE_NAMES.adminRefresh, '', options);
  ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.idToken, secureFlag), '', {
    httpOnly: true,
    secure: secureFlag,
    path: OIDC_COOKIE_PATH,
    sameSite: 'lax' as const,
    maxAge: 0,
    expires: new Date(0),
  });
  ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.userEmail, secureFlag), '', {
    httpOnly: true,
    secure: secureFlag,
    path: OIDC_COOKIE_PATH,
    sameSite: 'lax' as const,
    maxAge: 0,
    expires: new Date(0),
  });
  ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.state, secureFlag), '', pkceCookieOptions);
  ctx.cookies.set(
    reconcileCookieName(COOKIE_NAMES.codeVerifier, secureFlag),
    '',
    pkceCookieOptions,
  );
  ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.nonce, secureFlag), '', pkceCookieOptions);
}
