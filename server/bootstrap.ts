import type { Core } from '@strapi/types';
import type { Context, Next } from 'koa';
import { errorMessages } from './error-strings';
import { getEnforceOIDCConfig, resolveEnforceOIDC } from './utils/enforceOIDC';
import { getRetentionDays } from './utils/pluginConfig';
import { getWhitelistService, getAuditLogService } from './utils/services';
import { applyDiscovery } from './utils/discovery';
import { COOKIE_NAMES } from './utils/cookies';

const AUTH_ROUTES = ['login', 'register', 'register-admin', 'forgot-password', 'reset-password'];

export default async function bootstrap({ strapi }: { strapi: Core.Strapi }) {
  await applyDiscovery(strapi);
  const adminUrl = strapi.config.get('admin.url', '/admin') as string;
  const tokenRefreshPath = `${adminUrl}/token/refresh`;

  const enforceOidcMiddleware = async (ctx: Context, next: Next) => {
    const path = ctx.request.path;
    const isPost = ctx.request.method === 'POST';
    const isAuthRoute = AUTH_ROUTES.some((r) => path.includes(r));
    const isTokenRefresh = path === tokenRefreshPath;

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

        if (enforceOIDC && isTokenRefresh && !ctx.cookies.get(COOKIE_NAMES.authenticated)) {
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
    'plugin::strapi-plugin-oidc.whitelist.read',
    'plugin::strapi-plugin-oidc.whitelist.write',
    'plugin::strapi-plugin-oidc.whitelist.delete',
    'plugin::strapi-plugin-oidc.audit.read',
    'plugin::strapi-plugin-oidc.audit.delete',
  ];
  for (const uid of contentApiScopeUids) {
    strapi.contentAPI.permissions.providers.action.register(uid, { uid });
  }

  const enforceOIDCConfig = getEnforceOIDCConfig(strapi);
  if (enforceOIDCConfig !== null) {
    try {
      const whitelistService = getWhitelistService();
      const settings = await whitelistService.getSettings();
      if (settings.enforceOIDC !== enforceOIDCConfig) {
        await whitelistService.setSettings({ ...settings, enforceOIDC: enforceOIDCConfig });
        strapi.log.info(
          `[strapi-plugin-oidc] OIDC_ENFORCE=${enforceOIDCConfig} written to database settings`,
        );
      }
    } catch (err) {
      strapi.log.error(errorMessages.ENFORCE_SYNC_ERROR, err);
    }
  }

  try {
    const oidcRoleCount = await strapi
      .query('plugin::strapi-plugin-oidc.roles')
      .count({ where: { oauth_type: '4' } });

    if (oidcRoleCount === 0) {
      const defaultRole =
        (await strapi.query('admin::role').findOne({ where: { code: 'strapi-editor' } })) ??
        (await strapi.query('admin::role').findOne({}));

      if (defaultRole) {
        await strapi.query('plugin::strapi-plugin-oidc.roles').create({
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
