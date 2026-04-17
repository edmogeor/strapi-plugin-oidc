import type { Core } from '@strapi/types';
import type { StrapiContext } from '../types';

function getExpiredCookieOptions(strapi: Core.Strapi, ctx: StrapiContext) {
  const isProduction = strapi.config.get('environment') === 'production';
  return {
    httpOnly: true,
    secure: isProduction && ctx.request.secure,
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
  // Cookies set with path '/' must be cleared with the same path
  const rootPathOptions = { ...options, path: '/' };
  for (const name of ['oidc_authenticated', 'oidc_access_token', 'oidc_user_email']) {
    ctx.cookies.set(name, '', rootPathOptions);
  }
}
