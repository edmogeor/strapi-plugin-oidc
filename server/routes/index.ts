const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 20;

const rateLimitMiddleware = async (ctx: any, next: () => Promise<any>) => {
  const ip = ctx.request.ip;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  let requestStamps = rateLimitMap.get(ip) || [];
  requestStamps = requestStamps.filter((timestamp) => timestamp > windowStart);

  if (requestStamps.length >= MAX_REQUESTS) {
    ctx.status = 429;
    ctx.body = 'Too Many Requests';
    return;
  }

  requestStamps.push(now);
  rateLimitMap.set(ip, requestStamps);

  await next();
};

export default [
  {
    method: 'GET',
    path: '/oidc-roles',
    handler: 'role.find',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        { name: 'admin::hasPermissions', config: { actions: ['plugin::strapi-plugin-oidc.read'] } },
      ],
    },
  },
  {
    method: 'PUT',
    path: '/oidc-roles',
    handler: 'role.update',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'admin::hasPermissions',
          config: { actions: ['plugin::strapi-plugin-oidc.update'] },
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/oidc',
    handler: 'oidc.oidcSignIn',
    config: {
      auth: false,
      middlewares: [rateLimitMiddleware],
    },
  },
  {
    method: 'GET',
    path: '/oidc/callback',
    handler: 'oidc.oidcSignInCallback',
    config: {
      auth: false,
      middlewares: [rateLimitMiddleware],
    },
  },
  {
    method: 'GET',
    path: '/logout',
    handler: 'oidc.logout',
    config: {
      auth: false,
    },
  },
  {
    method: 'GET',
    path: '/whitelist',
    handler: 'whitelist.info',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        { name: 'admin::hasPermissions', config: { actions: ['plugin::strapi-plugin-oidc.read'] } },
      ],
    },
  },
  {
    method: 'PUT',
    path: '/whitelist/settings',
    handler: 'whitelist.updateSettings',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'admin::hasPermissions',
          config: { actions: ['plugin::strapi-plugin-oidc.update'] },
        },
      ],
    },
  },
  {
    method: 'GET',
    path: '/settings/public',
    handler: 'whitelist.publicSettings',
    config: {
      auth: false,
    },
  },
  {
    method: 'PUT',
    path: '/whitelist/sync',
    handler: 'whitelist.syncUsers',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'admin::hasPermissions',
          config: { actions: ['plugin::strapi-plugin-oidc.update'] },
        },
      ],
    },
  },
  {
    method: 'POST',
    path: '/whitelist',
    handler: 'whitelist.register',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'admin::hasPermissions',
          config: { actions: ['plugin::strapi-plugin-oidc.update'] },
        },
      ],
    },
  },
  {
    method: 'DELETE',
    path: '/whitelist/:id',
    handler: 'whitelist.removeEmail',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        {
          name: 'admin::hasPermissions',
          config: { actions: ['plugin::strapi-plugin-oidc.update'] },
        },
      ],
    },
  },
];
