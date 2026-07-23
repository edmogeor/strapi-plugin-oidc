import type { Core } from '@strapi/types';
import { getPluginConfig } from './pluginConfig';
import type { StrapiContext } from '../types';

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

export function shouldMarkSecure(strapi: Core.Strapi, ctx: StrapiContext): boolean {
  const config = getPluginConfig(strapi);
  if (config.OIDC_FORCE_SECURE_COOKIES === true) return true;

  const isProduction = strapi.config.get('environment') === 'production';
  if (!isProduction) return false;

  if (ctx.request.secure) return true;

  if (ctx.get('x-forwarded-proto') === 'https') return true;

  return false;
}

function getExpiredCookieOptions(strapi: Core.Strapi, ctx: StrapiContext) {
  return {
    httpOnly: true,
    secure: shouldMarkSecure(strapi, ctx),
    path: strapi.config.get('admin.auth.cookie.path', '/admin') as string,
    domain: (strapi.config.get('admin.auth.cookie.domain') ||
      strapi.config.get('admin.auth.domain')) as string | undefined,
    sameSite: strapi.config.get('admin.auth.cookie.sameSite', 'lax') as 'lax' | 'strict' | 'none',
    maxAge: 0,
    expires: new Date(0),
  };
}

export function clearAuthCookies(strapi: Core.Strapi, ctx: StrapiContext) {
  const options = getExpiredCookieOptions(strapi, ctx);
  const secureFlag = shouldMarkSecure(strapi, ctx);

  const pkceCookieOptions = {
    httpOnly: true,
    secure: secureFlag,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  };

  ctx.cookies.set(COOKIE_NAMES.adminRefresh, '', options);
  ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.idToken, secureFlag), '', {
    httpOnly: true,
    secure: secureFlag,
    path: '/',
    sameSite: 'lax' as const,
    maxAge: 0,
    expires: new Date(0),
  });
  ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.userEmail, secureFlag), '', {
    httpOnly: true,
    secure: secureFlag,
    path: '/',
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
