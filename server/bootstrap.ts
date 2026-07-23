import type { Core } from '@strapi/types';
import type { Context, Next } from 'koa';
import { errorMessages } from './error-strings';
import { toMessage } from '../shared/utils';
import {
  getEnforceOIDCConfig,
  resolveEnforceOIDC,
  getSkipLoginPageConfig,
  resolveSkipLoginPage,
} from './utils/configFlag';
import { getRetentionDays, getPluginConfig } from './utils/pluginConfig';
import { getWhitelistService, getAuditLogService } from './utils/services';
import { resetOidcConfig } from './utils/oidc-client';
import { pruneStoredJtis } from './controllers/oidc/backchannelLogout';
import {
  CONTENT_TYPES as CT,
  PERMISSIONS,
  AUTH_ROUTES,
  OIDC_SIGN_IN_PATH,
} from '../shared/constants';
import { COOKIE_NAMES, readCookie } from './utils/cookies';

const STATIC_EXTENSIONS = ['.js', '.css', '.png', '.svg', '.ico', '.woff2', '.json', '.map'];

export default async function bootstrap({ strapi }: { strapi: Core.Strapi }) {
  resetOidcConfig();

  if (getPluginConfig(strapi).OIDC_FORCE_SECURE_COOKIES === true) {
    strapi.log.warn(
      '[strapi-plugin-oidc] OIDC_FORCE_SECURE_COOKIES is enabled. Cookies will be marked Secure; ensure Strapi is served over HTTPS or __Host- cookies will be rejected by browsers.',
    );
  }

  try {
    await strapi.db.connection.raw('ALTER TABLE admin_users ADD COLUMN oidc_sub TEXT');
  } catch (err) {
    const msg = toMessage(err);
    if (!msg.includes('Duplicate column') && !msg.includes('already exists')) {
      strapi.log.warn('[strapi-plugin-oidc] Failed to add oidc_sub column:', msg);
    }
  }

  try {
    await strapi.db.connection.raw('ALTER TABLE admin_users ADD COLUMN oidc_sid TEXT');
  } catch (err) {
    const msg = toMessage(err);
    if (!msg.includes('Duplicate column') && !msg.includes('already exists')) {
      strapi.log.warn('[strapi-plugin-oidc] Failed to add oidc_sid column:', msg);
    }
  }
  const rawAdminUrl = strapi.config.get('admin.url');
  const adminUrl =
    typeof rawAdminUrl === 'string' && rawAdminUrl.length > 0 ? rawAdminUrl : '/admin';
  const adminPath = (() => {
    try {
      return new URL(adminUrl).pathname.replace(/\/$/, '');
    } catch {
      return adminUrl.startsWith('/') ? adminUrl : `/${adminUrl}`;
    }
  })();
  const tokenRefreshPath = `${adminPath}/token/refresh`;

  const EXCLUDED_ADMIN_PATHS = [
    `${adminPath}/login`,
    `${adminPath}/access-token`,
    `${adminPath}/logout`,
    `${adminPath}/init`,
    `${adminPath}/register`,
    `${adminPath}/register-admin`,
    `${adminPath}/forgot-password`,
    `${adminPath}/reset-password`,
  ];

  const enforceOidcMiddleware = async (ctx: Context, next: Next) => {
    const path = ctx.request.path;
    const isPost = ctx.request.method === 'POST';
    const isAuthRoute = AUTH_ROUTES.some((r) => path.includes(r));
    const isTokenRefresh = path === tokenRefreshPath;
    const isGet = ctx.request.method === 'GET';
    const isAdminPath = path === adminPath || path.startsWith(`${adminPath}/`);
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

  if (strapi.server.app && Array.isArray(strapi.server.app.middleware)) {
    strapi.server.app.middleware.unshift(enforceOidcMiddleware);
  } else {
    strapi.server.use(enforceOidcMiddleware);
  }

  const applyOidcCsp = async (ctx: Context, next: Next) => {
    await next();
    if (ctx.state.oidcCsp) {
      ctx.set('Content-Security-Policy', ctx.state.oidcCsp);
    }
  };
  strapi.server.use(applyOidcCsp);

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
    strapi.log.warn(errorMessages.DEFAULT_ROLE_INIT_ERROR, toMessage(err));
  }

  strapi.cron.add({
    'strapi-plugin-oidc-audit-log-cleanup': {
      task: async () => {
        try {
          const retentionDays = getRetentionDays(strapi);
          await getAuditLogService().cleanup(retentionDays);
          await pruneStoredJtis();
        } catch (err) {
          strapi.log.warn(errorMessages.AUDIT_LOG_CLEANUP_ERROR, toMessage(err));
        }
      },
      options: { rule: '0 0 * * *' },
    },
  });
}
