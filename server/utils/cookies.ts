import type { Core } from '@strapi/types';
import { getPluginConfig } from './pluginConfig';
import type { StrapiContext } from '../types';

export const COOKIE_NAMES = {
  state: 'oidc_state',
  codeVerifier: 'oidc_code_verifier',
  nonce: 'oidc_nonce',
  accessToken: 'oidc_access_token',
  userEmail: 'oidc_user_email',
  adminRefresh: 'strapi_admin_refresh',
  authenticated: 'oidc_authenticated',
} as const;

export function shouldMarkSecure(strapi: Core.Strapi, ctx: StrapiContext): boolean {
  const isProduction = strapi.config.get('environment') === 'production';
  if (!isProduction) return false;

  const config = getPluginConfig();
  if (config.OIDC_FORCE_SECURE_COOKIES === true) return true;

  if (ctx.request.secure) return true;

  const proxyTrusted = ctx.app?.proxy === true;
  if (proxyTrusted && ctx.get('x-forwarded-proto') === 'https') return true;

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
  ctx.cookies.set(COOKIE_NAMES.adminRefresh, '', options);
  const rootPathOptions = { ...options, path: '/' };
  ctx.cookies.set(COOKIE_NAMES.authenticated, '', rootPathOptions);
  ctx.cookies.set(COOKIE_NAMES.accessToken, '', rootPathOptions);
  ctx.cookies.set(COOKIE_NAMES.userEmail, '', rootPathOptions);
}
