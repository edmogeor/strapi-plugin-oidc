function getExpiredCookieOptions(strapi: any, ctx: any) {
  const isProduction = strapi.config.get('environment') === 'production';
  return {
    httpOnly: true,
    secure: isProduction && ctx.request.secure,
    path: strapi.config.get('admin.auth.cookie.path', '/admin'),
    domain: strapi.config.get('admin.auth.cookie.domain') || strapi.config.get('admin.auth.domain'),
    sameSite: strapi.config.get('admin.auth.cookie.sameSite', 'lax'),
    maxAge: 0,
    expires: new Date(0),
  };
}

export function clearAuthCookies(strapi: any, ctx: any) {
  const options = getExpiredCookieOptions(strapi, ctx);
  ctx.cookies.set('strapi_admin_refresh', '', options);
  // oidc_authenticated is set with path '/' so it must be cleared with the same path
  ctx.cookies.set('oidc_authenticated', '', { ...options, path: '/' });
}
