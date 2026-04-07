export default async function bootstrap({ strapi }) {
  const enforceOidcMiddleware = async (ctx, next) => {
    const adminUrl = strapi.config.get('admin.url', '/admin');

    const authRoutes = [
      `${adminUrl}/login`,
      `${adminUrl}/register`,
      `${adminUrl}/forgot-password`,
      `${adminUrl}/reset-password`,
    ];

    const isPostAuth = authRoutes.includes(ctx.request.path) && ctx.request.method === 'POST';
    // Fix 4: also block token refresh for non-OIDC sessions
    const isTokenRefresh =
      ctx.request.path === `${adminUrl}/token/refresh` && ctx.request.method === 'POST';
    const isHtmlRequest =
      ctx.request.accepts('html', 'json') === 'html' && !ctx.request.path.match(/\.[a-zA-Z0-9]+$/);
    const isGetAdminHtml =
      ctx.request.method === 'GET' && ctx.request.path.startsWith(adminUrl) && isHtmlRequest;

    if (isPostAuth || isTokenRefresh || isGetAdminHtml) {
      try {
        const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
        const settings = await whitelistService.getSettings();

        if (settings?.enforceOIDC) {
          // Fix 2: block all local auth POST endpoints
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

          // Fix 4: block token refresh for sessions not created via OIDC
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

          if (isGetAdminHtml) {
            const hasRefreshCookie = !!ctx.cookies.get('strapi_admin_refresh');

            // Fix 1: pre-existing local session — has a refresh cookie but no OIDC marker.
            // Clear the stale cookie and redirect to OIDC so they must re-authenticate.
            if (hasRefreshCookie && !hasOidcSession) {
              const isProduction = strapi.config.get('environment') === 'production';
              const cookiePath = strapi.config.get('admin.auth.cookie.path', '/admin');
              const domain =
                strapi.config.get('admin.auth.cookie.domain') ||
                strapi.config.get('admin.auth.domain');
              const sameSite = strapi.config.get('admin.auth.cookie.sameSite', 'lax');
              const expiredOptions = {
                httpOnly: true,
                secure: isProduction && ctx.request.secure,
                path: cookiePath,
                domain,
                sameSite,
                maxAge: 0,
                expires: new Date(0),
              };
              ctx.cookies.set('strapi_admin_refresh', '', expiredOptions);
              ctx.cookies.set('oidc_authenticated', '', expiredOptions);
              ctx.redirect('/strapi-plugin-oidc/oidc');
              return;
            }

            if (!hasRefreshCookie) {
              ctx.redirect('/strapi-plugin-oidc/oidc');
              return;
            }
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

  strapi.db.lifecycles.subscribe({
    models: ['admin::user'],
    async afterUpdate(event) {
      const { result } = event;
      if (!result?.email) return;

      const query = strapi.query('plugin::strapi-plugin-oidc.whitelists');
      const whitelistEntry = await query.findOne({ where: { email: result.email } });
      if (!whitelistEntry) return;

      const userWithRoles = await strapi.query('admin::user').findOne({
        where: { id: result.id },
        populate: ['roles'],
      });

      if (userWithRoles?.roles) {
        const roleIds = userWithRoles.roles.map((r) => r.id.toString());
        await query.update({
          where: { id: whitelistEntry.id },
          data: { roles: roleIds },
        });
      }
    },
  });
}
