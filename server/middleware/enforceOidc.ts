import type { Context, Next } from 'koa';
import type { Core } from '@strapi/types';
import { errorMessages } from '../error-strings';
import { getWhitelistService } from '../utils/services';
import { resolveEnforceOIDC, resolveSkipLoginPage } from '../utils/configFlag';
import { readCookie, COOKIE_NAMES } from '../utils/cookies';
import { AUTH_ROUTES, OIDC_SIGN_IN_PATH } from '../../shared/constants';

const STATIC_EXTENSIONS = ['.js', '.css', '.png', '.svg', '.ico', '.woff2', '.json', '.map'];

export function createEnforceOidcMiddleware(strapi: Core.Strapi, adminPath: string) {
  const tokenRefreshPath = `${adminPath}/token/refresh`;
  const excludedPaths = [
    `${adminPath}/login`,
    `${adminPath}/access-token`,
    `${adminPath}/logout`,
    `${adminPath}/init`,
    `${adminPath}/register`,
    `${adminPath}/register-admin`,
    `${adminPath}/forgot-password`,
    `${adminPath}/reset-password`,
  ];

  return async function enforceOidcMiddleware(ctx: Context, next: Next) {
    const path = ctx.request.path;
    const isPost = ctx.request.method === 'POST';
    const isAuthRoute = AUTH_ROUTES.some((r: string) => path.includes(r));
    const isTokenRefresh = path === tokenRefreshPath;
    const isGet = ctx.request.method === 'GET';
    const isAdminPath = path === adminPath || path.startsWith(`${adminPath}/`);
    const isExcluded = excludedPaths.includes(path);
    const isStatic = STATIC_EXTENSIONS.some((ext) => path.endsWith(ext));
    const isAuthenticated = !!ctx.cookies.get(COOKIE_NAMES.adminRefresh);

    if (isGet && isAdminPath && !isExcluded && !isStatic && !isAuthenticated) {
      try {
        const whitelistService = getWhitelistService();
        const settings = await whitelistService.getSettings();
        if (resolveSkipLoginPage(strapi, settings?.skipLoginPage)) {
          ctx.redirect(OIDC_SIGN_IN_PATH);
          return;
        }
      } catch (err) {
        strapi.log.error(errorMessages.ENFORCE_MIDDLEWARE_ERROR, err);
      }
    }

    if ((isAuthRoute && isPost) || isTokenRefresh) {
      try {
        const whitelistService = getWhitelistService();
        const settings = await whitelistService.getSettings();
        const enforceOIDC = resolveEnforceOIDC(strapi, settings?.enforceOIDC);

        if (enforceOIDC && isAuthRoute && isPost) {
          ctx.status = 403;
          ctx.body = {
            data: null,
            error: {
              status: 403,
              name: 'ForbiddenError',
              message: 'Local login is disabled. Please use OIDC.',
              details: {},
            },
          };
          return;
        }

        if (enforceOIDC && isTokenRefresh && !readCookie(ctx, COOKIE_NAMES.idToken)) {
          ctx.status = 401;
          ctx.body = {
            data: null,
            error: {
              status: 401,
              name: 'UnauthorizedError',
              message: 'Session was not created via OIDC. Please log in again.',
              details: {},
            },
          };
          return;
        }
      } catch (err) {
        strapi.log.error(errorMessages.ENFORCE_MIDDLEWARE_ERROR, err);
      }
    }

    await next();
  };
}

export function registerEnforceOidcMiddleware(strapi: Core.Strapi, adminPath: string): void {
  const middleware = createEnforceOidcMiddleware(strapi, adminPath);
  if (strapi.server.app && Array.isArray(strapi.server.app.middleware)) {
    strapi.server.app.middleware.unshift(middleware);
  } else {
    strapi.server.use(middleware);
  }
}
