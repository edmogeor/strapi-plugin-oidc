import { createHash } from 'node:crypto';
import type { Next } from 'koa';
import type { StrapiContext } from '../types';
import { getClientIp } from '../utils/ip';

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000;
const MAX_REQUESTS = 1_000;
const MAX_MAP_SIZE = 10_000;
const PRUNE_THRESHOLD = 1_000;

export const clearRateLimitMap = (): void => rateLimitMap.clear();

export const getRateLimitMapSize = (): number => rateLimitMap.size;

function pruneExpiredEntries(now: number): void {
  const windowStart = now - RATE_LIMIT_WINDOW;
  for (const [key, stamps] of rateLimitMap) {
    if (stamps.length === 0 || stamps[stamps.length - 1] <= windowStart) {
      rateLimitMap.delete(key);
    }
  }
}

function evictOldestEntry(): void {
  const oldest = rateLimitMap.keys().next().value;
  if (oldest !== undefined) {
    rateLimitMap.delete(oldest);
  }
}

function getRateLimitKey(ctx: StrapiContext): string {
  const ip = getClientIp(ctx);
  const ua = ctx.request.header['user-agent'] ?? '';
  const uaHash = createHash('sha256').update(ua).digest('hex').slice(0, 16);
  return `${ip}:${uaHash}`;
}

function rateLimitMiddleware(ctx: StrapiContext, next: Next): unknown {
  const key = getRateLimitKey(ctx);
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  if (rateLimitMap.size > PRUNE_THRESHOLD) {
    pruneExpiredEntries(now);
  }

  const requestStamps = (rateLimitMap.get(key) ?? []).filter((ts) => ts > windowStart);

  if (requestStamps.length >= MAX_REQUESTS) {
    ctx.status = 429;
    ctx.body = 'Too Many Requests';
    return;
  }

  requestStamps.push(now);

  if (!rateLimitMap.has(key) && rateLimitMap.size >= MAX_MAP_SIZE) {
    evictOldestEntry();
  }
  rateLimitMap.set(key, requestStamps);

  return next();
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
        method: 'POST',
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
        config: { policies: ['admin::isAuthenticatedAdmin'] },
      },
      {
        method: 'GET',
        path: '/audit-logs/export',
        handler: 'auditLog.export',
        config: { policies: ['admin::isAuthenticatedAdmin'] },
      },
      {
        method: 'DELETE',
        path: '/audit-logs',
        handler: 'auditLog.clearAll',
        config: { policies: ['admin::isAuthenticatedAdmin'] },
      },
    ],
  },

  // API-token-authenticated routes for programmatic whitelist management.
  // Accessible at /strapi-plugin-oidc/... using a Strapi API token
  // (full-access or custom) in the Authorization: Bearer <token> header.
  // Custom tokens must be granted one or more of the semantic scopes below.
  'content-api': {
    type: 'content-api',
    routes: [
      {
        method: 'GET',
        path: '/whitelist',
        handler: 'whitelist.info',
        config: { auth: { scope: ['plugin::strapi-plugin-oidc.whitelist.read'] } },
      },
      {
        method: 'POST',
        path: '/whitelist',
        handler: 'whitelist.register',
        config: { auth: { scope: ['plugin::strapi-plugin-oidc.whitelist.write'] } },
      },
      {
        method: 'POST',
        path: '/whitelist/import',
        handler: 'whitelist.importUsers',
        config: { auth: { scope: ['plugin::strapi-plugin-oidc.whitelist.write'] } },
      },
      {
        method: 'DELETE',
        path: '/whitelist/:email',
        handler: 'whitelist.removeEmail',
        config: { auth: { scope: ['plugin::strapi-plugin-oidc.whitelist.delete'] } },
      },
      {
        method: 'DELETE',
        path: '/whitelist',
        handler: 'whitelist.deleteAll',
        config: { auth: { scope: ['plugin::strapi-plugin-oidc.whitelist.delete'] } },
      },
      {
        method: 'GET',
        path: '/whitelist/export',
        handler: 'whitelist.exportWhitelist',
        config: { auth: { scope: ['plugin::strapi-plugin-oidc.whitelist.read'] } },
      },
      {
        method: 'GET',
        path: '/audit-logs',
        handler: 'auditLog.find',
        config: { auth: { scope: ['plugin::strapi-plugin-oidc.audit.read'] } },
      },
      {
        method: 'GET',
        path: '/audit-logs/export',
        handler: 'auditLog.export',
        config: { auth: { scope: ['plugin::strapi-plugin-oidc.audit.read'] } },
      },
      {
        method: 'DELETE',
        path: '/audit-logs',
        handler: 'auditLog.clearAll',
        config: { auth: { scope: ['plugin::strapi-plugin-oidc.audit.delete'] } },
      },
    ],
  },
};
