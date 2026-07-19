import type { Core } from '@strapi/types';
import type { Context, Next } from 'koa';
import { errorMessages } from './error-strings';
import { getEnforceOIDCConfig, resolveEnforceOIDC } from './utils/enforceOIDC';
import { getSkipLoginPageConfig, resolveSkipLoginPage } from './utils/skipLoginPage';
import { getRetentionDays } from './utils/pluginConfig';
import { getWhitelistService, getAuditLogService } from './utils/services';
import { resetOidcConfig } from './utils/oidc-client';
import {
  CONTENT_TYPES as CT,
  PERMISSIONS,
  AUTH_ROUTES,
  OIDC_SIGN_IN_PATH,
} from '../shared/constants';
import { COOKIE_NAMES } from './utils/cookies';

const STATIC_EXTENSIONS = ['.js', '.css', '.png', '.svg', '.ico', '.woff2', '.json', '.map'];

export default async function bootstrap({ strapi }: { strapi: Core.Strapi }) {
  resetOidcConfig();
  const rawAdminUrl = strapi.config.get('admin.url');
  const adminUrl =
    typeof rawAdminUrl === 'string' && rawAdminUrl.length > 0 ? rawAdminUrl : '/admin';
  const tokenRefreshPath = `${adminUrl}/token/refresh`;

  const EXCLUDED_ADMIN_PATHS = [
    `${adminUrl}/login`,
    `${adminUrl}/access-token`,
    `${adminUrl}/logout`,
    `${adminUrl}/init`,
    `${adminUrl}/register`,
    `${adminUrl}/register-admin`,
    `${adminUrl}/forgot-password`,
    `${adminUrl}/reset-password`,
  ];

  const enforceOidcMiddleware = async (ctx: Context, next: Next) => {
    const path = ctx.request.path;
    const isPost = ctx.request.method === 'POST';
    const isAuthRoute = AUTH_ROUTES.some((r) => path.includes(r));
    const isTokenRefresh = path === tokenRefreshPath;
    const isGet = ctx.request.method === 'GET';
    const isAdminPath = path === adminUrl || path.startsWith(`${adminUrl}/`);
    const isExcluded = EXCLUDED_ADMIN_PATHS.includes(path);
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

        if (enforceOIDC && isTokenRefresh && !ctx.cookies.get(COOKIE_NAMES.idToken)) {
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

  if (strapi.server.app && Array.isArray(strapi.server.app.middleware)) {
    strapi.server.app.middleware.unshift(enforceOidcMiddleware);
  } else {
    strapi.server.use(enforceOidcMiddleware);
  }

  const actions = [
    { section: 'plugins', displayName: 'Read', uid: 'read', pluginName: 'strapi-plugin-oidc' },
    { section: 'plugins', displayName: 'Update', uid: 'update', pluginName: 'strapi-plugin-oidc' },
  ];

  await strapi.admin.services.permission.actionProvider.registerMany(actions);

  const contentApiScopeUids = [
    PERMISSIONS.WHITELIST_READ,
    PERMISSIONS.WHITELIST_WRITE,
    PERMISSIONS.WHITELIST_DELETE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_DELETE,
  ];
  for (const uid of contentApiScopeUids) {
    strapi.contentAPI.permissions.providers.action.register(uid, { uid });
  }

  const configSyncJobs = [
    { key: 'OIDC_ENFORCE', getter: getEnforceOIDCConfig, dbField: 'enforceOIDC' as const },
    {
      key: 'OIDC_SKIP_LOGIN_PAGE',
      getter: getSkipLoginPageConfig,
      dbField: 'skipLoginPage' as const,
    },
  ];

  for (const { key, getter, dbField } of configSyncJobs) {
    const configValue = getter(strapi);
    if (configValue !== null) {
      try {
        const whitelistService = getWhitelistService();
        const settings = await whitelistService.getSettings();
        if (settings[dbField] !== configValue) {
          await whitelistService.setSettings({ ...settings, [dbField]: configValue });
          strapi.log.info(
            `[strapi-plugin-oidc] ${key}=${configValue} written to database settings`,
          );
        }
      } catch (err) {
        strapi.log.error(errorMessages.ENFORCE_SYNC_ERROR, err);
      }
    }
  }

  try {
    const oidcRoleCount = await strapi.query(CT.ROLES).count({ where: { oauth_type: '4' } });

    if (oidcRoleCount === 0) {
      const defaultRole =
        (await strapi.query('admin::role').findOne({ where: { code: 'strapi-editor' } })) ??
        (await strapi.query('admin::role').findOne({}));

      if (defaultRole) {
        await strapi.query(CT.ROLES).create({
          data: { oauth_type: '4', roles: [String(defaultRole.id)] },
        });
      }
    }
  } catch (err) {
    strapi.log.warn(errorMessages.DEFAULT_ROLE_INIT_ERROR, (err as Error).message);
  }

  strapi.cron.add({
    'strapi-plugin-oidc-audit-log-cleanup': {
      task: async () => {
        try {
          const retentionDays = getRetentionDays();
          await getAuditLogService().cleanup(retentionDays);
        } catch (err) {
          strapi.log.warn(errorMessages.AUDIT_LOG_CLEANUP_ERROR, (err as Error).message);
        }
      },
      options: { rule: '0 0 * * *' },
    },
  });
}
