export default [
  {
    method: 'GET',
    path: '/sso-roles',
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
    path: '/sso-roles',
    handler: 'role.update',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        { name: 'admin::hasPermissions', config: { actions: ['plugin::strapi-plugin-oidc.update'] } },
      ],
    },
  },
  {
    method: 'GET',
    path: '/oidc',
    handler: 'oidc.oidcSignIn',
    config: {
      auth: false,
    },
  },
  {
    method: 'GET',
    path: '/oidc/callback',
    handler: 'oidc.oidcSignInCallback',
    config: {
      auth: false,
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
        { name: 'admin::hasPermissions', config: { actions: ['plugin::strapi-plugin-oidc.update'] } },
      ],
    },
  },
  {
    method: 'PUT',
    path: '/whitelist/sync',
    handler: 'whitelist.syncUsers',
    config: {
      policies: [
        'admin::isAuthenticatedAdmin',
        { name: 'admin::hasPermissions', config: { actions: ['plugin::strapi-plugin-oidc.update'] } },
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
        { name: 'admin::hasPermissions', config: { actions: ['plugin::strapi-plugin-oidc.update'] } },
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
        { name: 'admin::hasPermissions', config: { actions: ['plugin::strapi-plugin-oidc.update'] } },
      ],
    },
  }
];
