export default async function bootstrap({ strapi }) {
  strapi.server.use(async (ctx, next) => {
    const adminUrl = strapi.config.get('admin.url', '/admin');

    const authRoutes = [
      `${adminUrl}/login`,
      `${adminUrl}/register`,
      `${adminUrl}/forgot-password`,
      `${adminUrl}/reset-password`,
    ];

    const isPostAuth = authRoutes.includes(ctx.request.path) && ctx.request.method === 'POST';
    const isHtmlRequest = ctx.request.accepts('html') && !ctx.request.path.match(/\.[a-zA-Z0-9]+$/);
    const isGetAdminHtml =
      ctx.request.method === 'GET' && ctx.request.path.startsWith(adminUrl) && isHtmlRequest;

    if (isPostAuth || isGetAdminHtml) {
      try {
        const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
        const settings = await whitelistService.getSettings();

        if (settings?.enforceOIDC) {
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

          if (isGetAdminHtml) {
            const hasRefreshCookie = ctx.cookies.get('strapi_admin_refresh');
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
  });

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
