import { createHash } from 'node:crypto';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import type { Next } from 'koa';
import type { Core } from '@strapi/types';
import type { StrapiContext } from '../types';
import { getClientIp } from '../utils/ip';
import { PERMISSIONS, RATE_LIMIT } from '../../shared/constants';

const rateLimiter = new RateLimiterMemory({
  points: RATE_LIMIT.MAX_REQUESTS,
  duration: Math.ceil(RATE_LIMIT.WINDOW_MS / 1000),
});

const backchannelLogoutLimiter = new RateLimiterMemory({
  keyPrefix: 'bc-logout',
  points: 30,
  duration: 60,
});

export const clearRateLimitMap = (): void => {
  (
    rateLimiter as { _memoryStorage?: { _storage?: Map<unknown, unknown> } }
  )._memoryStorage?._storage?.clear();
};

export const getRateLimitMapSize = (): number => {
  return (
    (rateLimiter as { _memoryStorage?: { _storage?: Map<unknown, unknown> } })._memoryStorage
      ?._storage?.size ?? 0
  );
};

function getRateLimitKey(strapi: Core.Strapi, ctx: StrapiContext): string {
  const ip = getClientIp(strapi, ctx);
  const ua = ctx.request.header['user-agent'] ?? '';
  const uaHash = createHash('sha256').update(ua).digest('hex').slice(0, 16);
  return `${ip}:${uaHash}`;
}

async function rateLimitMiddleware(ctx: StrapiContext, next: Next): Promise<void> {
  try {
    await rateLimiter.consume(getRateLimitKey(strapi, ctx));
  } catch {
    ctx.status = 429;
    ctx.body = 'Too Many Requests';
    return;
  }
  await next();
}

async function backchannelLogoutMiddleware(ctx: StrapiContext, next: Next): Promise<void> {
  try {
    await backchannelLogoutLimiter.consume(getClientIp(strapi, ctx));
  } catch {
    ctx.status = 429;
    ctx.body = 'Too Many Requests';
    return;
  }
  await next();
}

function adminPolicies(action: 'read' | 'update'): { policies: unknown[] } {
  return {
    policies: [
      'admin::isAuthenticatedAdmin',
      {
        name: 'admin::hasPermissions',
        config: { actions: [`plugin::strapi-plugin-oidc.${action}`] },
      },
    ],
  };
}

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
        config: { auth: false, middlewares: [rateLimitMiddleware] },
      },
      {
        method: 'POST',
        path: '/logout',
        handler: 'oidc.logout',
        config: { auth: false, middlewares: [rateLimitMiddleware] },
      },
      {
        method: 'POST',
        path: '/backchannel-logout',
        handler: 'oidc.backchannelLogout',
        config: { auth: false, middlewares: [backchannelLogoutMiddleware] },
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
        path: '/whitelist/:email',
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
        path: '/whitelist/export',
        handler: 'whitelist.exportWhitelist',
        config: adminPolicies('read'),
      },
      {
        method: 'GET',
        path: '/audit-logs',
        handler: 'auditLog.find',
        config: adminPolicies('read'),
      },
      {
        method: 'GET',
        path: '/audit-logs/export',
        handler: 'auditLog.export',
        config: adminPolicies('read'),
      },
      {
        method: 'DELETE',
        path: '/audit-logs',
        handler: 'auditLog.clearAll',
        config: adminPolicies('update'),
      },
    ],
  },

  'content-api': {
    type: 'content-api',
    routes: [
      {
        method: 'GET',
        path: '/whitelist',
        handler: 'whitelist.info',
        config: { auth: { scope: [PERMISSIONS.WHITELIST_READ] } },
      },
      {
        method: 'POST',
        path: '/whitelist',
        handler: 'whitelist.register',
        config: { auth: { scope: [PERMISSIONS.WHITELIST_WRITE] } },
      },
      {
        method: 'POST',
        path: '/whitelist/import',
        handler: 'whitelist.importUsers',
        config: { auth: { scope: [PERMISSIONS.WHITELIST_WRITE] } },
      },
      {
        method: 'DELETE',
        path: '/whitelist/:email',
        handler: 'whitelist.removeEmail',
        config: { auth: { scope: [PERMISSIONS.WHITELIST_DELETE] } },
      },
      {
        method: 'DELETE',
        path: '/whitelist',
        handler: 'whitelist.deleteAll',
        config: { auth: { scope: [PERMISSIONS.WHITELIST_DELETE] } },
      },
      {
        method: 'GET',
        path: '/whitelist/export',
        handler: 'whitelist.exportWhitelist',
        config: { auth: { scope: [PERMISSIONS.WHITELIST_READ] } },
      },
      {
        method: 'GET',
        path: '/audit-logs',
        handler: 'auditLog.find',
        config: { auth: { scope: [PERMISSIONS.AUDIT_READ] } },
      },
      {
        method: 'GET',
        path: '/audit-logs/export',
        handler: 'auditLog.export',
        config: { auth: { scope: [PERMISSIONS.AUDIT_READ] } },
      },
      {
        method: 'DELETE',
        path: '/audit-logs',
        handler: 'auditLog.clearAll',
        config: { auth: { scope: [PERMISSIONS.AUDIT_DELETE] } },
      },
    ],
  },
};
