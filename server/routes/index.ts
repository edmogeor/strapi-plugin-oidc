const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 20;

import type { Next } from 'koa';
import type { StrapiContext } from '../types';

const rateLimitMiddleware = async (ctx: StrapiContext, next: Next) => {
  const ip = ctx.request.ip;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  const requestStamps = (rateLimitMap.get(ip) || []).filter((timestamp) => timestamp > windowStart);

  if (requestStamps.length >= MAX_REQUESTS) {
    ctx.status = 429;
    ctx.body = 'Too Many Requests';
    return;
  }

  requestStamps.push(now);
  rateLimitMap.set(ip, requestStamps);

  await next();
};

const adminPolicies = (action: 'read' | 'update') => ({
  policies: [
    'admin::isAuthenticatedAdmin',
    {
      name: 'admin::hasPermissions',
      config: { actions: [`plugin::strapi-plugin-oidc.${action}`] },
    },
  ],
});

export default {
  admin: {
    type: 'admin',
    routes: [
      {
        method: 'GET',
        path: '/oidc-roles',
        handler: 'role.find',
        config: adminPolicies('read'),
      },
      {
        method: 'PUT',
        path: '/oidc-roles',
        handler: 'role.update',
        config: adminPolicies('update'),
      },
      {
        method: 'GET',
        path: '/oidc',
        handler: 'oidc.oidcSignIn',
        config: { auth: false, middlewares: [rateLimitMiddleware] },
      },
      {
        method: 'GET',
        path: '/oidc/callback',
        handler: 'oidc.oidcSignInCallback',
        config: { auth: false, middlewares: [rateLimitMiddleware] },
      },
      {
        method: 'GET',
        path: '/logout',
        handler: 'oidc.logout',
        config: { auth: false },
      },
      {
        method: 'GET',
        path: '/whitelist',
        handler: 'whitelist.info',
        config: adminPolicies('read'),
      },
      {
        method: 'PUT',
        path: '/whitelist/settings',
        handler: 'whitelist.updateSettings',
        config: adminPolicies('update'),
      },
      {
        method: 'GET',
        path: '/settings/public',
        handler: 'whitelist.publicSettings',
        config: { auth: false },
      },
      {
        method: 'PUT',
        path: '/whitelist/sync',
        handler: 'whitelist.syncUsers',
        config: adminPolicies('update'),
      },
      {
        method: 'POST',
        path: '/whitelist/import',
        handler: 'whitelist.importUsers',
        config: adminPolicies('update'),
      },
      {
        method: 'POST',
        path: '/whitelist',
        handler: 'whitelist.register',
        config: adminPolicies('update'),
      },
      {
        method: 'DELETE',
        path: '/whitelist/:id',
        handler: 'whitelist.removeEmail',
        config: adminPolicies('update'),
      },
      {
        method: 'DELETE',
        path: '/whitelist',
        handler: 'whitelist.deleteAll',
        config: adminPolicies('update'),
      },
      {
        method: 'GET',
        path: '/audit-logs',
        handler: 'auditLog.find',
        config: { policies: ['admin::isAuthenticatedAdmin'] },
      },
      {
        method: 'GET',
        path: '/audit-logs/export',
        handler: 'auditLog.export',
        config: { policies: ['admin::isAuthenticatedAdmin'] },
      },
    ],
  },

  // API-token-authenticated routes for programmatic whitelist management.
  // Accessible at /strapi-plugin-oidc/... using a Strapi API token
  // (full-access or custom) in the Authorization: Bearer <token> header.
  'content-api': {
    type: 'content-api',
    routes: [
      {
        method: 'GET',
        path: '/whitelist',
        handler: 'whitelist.info',
      },
      {
        method: 'POST',
        path: '/whitelist',
        handler: 'whitelist.register',
      },
      {
        method: 'POST',
        path: '/whitelist/import',
        handler: 'whitelist.importUsers',
      },
      {
        method: 'DELETE',
        path: '/whitelist/:id',
        handler: 'whitelist.removeEmail',
      },
      {
        method: 'DELETE',
        path: '/whitelist',
        handler: 'whitelist.deleteAll',
      },
    ],
  },
};
