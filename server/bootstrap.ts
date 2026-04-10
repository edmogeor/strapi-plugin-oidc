import { getEnforceOIDCConfig, resolveEnforceOIDC } from './utils/enforceOIDC';
import { getRetentionDays } from './utils/pluginConfig';

export default async function bootstrap({ strapi }) {
  const adminUrl = strapi.config.get('admin.url', '/admin') as string;
  const authRoutes = [
    `${adminUrl}/login`,
    `${adminUrl}/register`,
    `${adminUrl}/register-admin`,
    `${adminUrl}/forgot-password`,
    `${adminUrl}/reset-password`,
  ];
  const tokenRefreshPath = `${adminUrl}/token/refresh`;

  const enforceOidcMiddleware = async (ctx, next) => {
    const isPostAuth = authRoutes.includes(ctx.request.path) && ctx.request.method === 'POST';
    const isTokenRefresh = ctx.request.path === tokenRefreshPath && ctx.request.method === 'POST';

    if (isPostAuth || isTokenRefresh) {
      try {
        const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
        const settings = await whitelistService.getSettings();

        const enforceOIDC = resolveEnforceOIDC(strapi, settings?.enforceOIDC);

        if (enforceOIDC) {
          if (isPostAuth) {
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

          const hasOidcSession = !!ctx.cookies.get('oidc_authenticated');

          if (isTokenRefresh && !hasOidcSession) {
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
        }
      } catch (err) {
        strapi.log.error('Error checking OIDC enforcement in middleware:', err);
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
    {
      section: 'plugins',
      displayName: 'Read',
      uid: 'read',
      pluginName: 'strapi-plugin-oidc',
    },
    {
      section: 'plugins',
      displayName: 'Update',
      uid: 'update',
      pluginName: 'strapi-plugin-oidc',
    },
  ];

  await strapi.admin.services.permission.actionProvider.registerMany(actions);

  // If OIDC_ENFORCE is set in config, write it through to the DB so the value
  // persists after the env var is removed.
  const enforceOIDCConfig = getEnforceOIDCConfig(strapi);
  if (enforceOIDCConfig !== null) {
    try {
      const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
      const settings = await whitelistService.getSettings();
      if (settings.enforceOIDC !== enforceOIDCConfig) {
        await whitelistService.setSettings({ ...settings, enforceOIDC: enforceOIDCConfig });
        strapi.log.info(
          `[strapi-plugin-oidc] OIDC_ENFORCE=${enforceOIDCConfig} written to database settings`,
        );
      }
    } catch (err) {
      strapi.log.error('[strapi-plugin-oidc] Failed to sync OIDC_ENFORCE to database:', err);
    }
  }

  try {
    const oidcRoleCount = await strapi.query('plugin::strapi-plugin-oidc.roles').count({
      where: { oauth_type: '4' },
    });

    if (oidcRoleCount === 0) {
      const editorRole = await strapi.query('admin::role').findOne({
        where: { code: 'strapi-editor' },
      });

      if (editorRole) {
        await strapi.query('plugin::strapi-plugin-oidc.roles').create({
          data: {
            oauth_type: '4',
            roles: [editorRole.id.toString()],
          },
        });
      }
    }
  } catch (err) {
    strapi.log.warn('Could not initialize default OIDC role:', err.message);
  }

  // Schedule daily audit log cleanup at midnight rather than running it once on startup,
  // so long-running servers stay clean without needing a restart.
  strapi.cron.add({
    'strapi-plugin-oidc-audit-log-cleanup': {
      task: async () => {
        try {
          const retentionDays = getRetentionDays();
          await strapi.plugin('strapi-plugin-oidc').service('auditLog').cleanup(retentionDays);
        } catch (err) {
          strapi.log.warn('[strapi-plugin-oidc] Audit log cleanup failed:', err.message);
        }
      },
      options: { rule: '0 0 * * *' }, // daily at midnight
    },
  });
}
