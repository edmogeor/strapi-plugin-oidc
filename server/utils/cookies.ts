import type { Core } from '@strapi/types';
import type { StrapiContext, PluginConfig } from '../types';

export function shouldMarkSecure(strapi: Core.Strapi, ctx: StrapiContext): boolean {
  const isProduction = strapi.config.get('environment') === 'production';
  if (!isProduction) return false;

  const config = (strapi.config.get('plugin::strapi-plugin-oidc') ?? {}) as Partial<PluginConfig>;
  if (config.OIDC_FORCE_SECURE_COOKIES === true) return true;

  if (ctx.request.secure) return true;

  const proxyTrusted = ctx.app?.proxy === true;
  if (proxyTrusted && typeof ctx.get === 'function' && ctx.get('x-forwarded-proto') === 'https')
    return true;

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
  ctx.cookies.set('strapi_admin_refresh', '', options);
  const rootPathOptions = { ...options, path: '/' };
  for (const name of ['oidc_authenticated', 'oidc_access_token', 'oidc_user_email']) {
    ctx.cookies.set(name, '', rootPathOptions);
  }
}
