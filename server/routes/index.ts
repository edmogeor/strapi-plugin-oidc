import { createHash } from 'node:crypto';
import type { Next } from 'koa';
import type { StrapiContext } from '../types';
import { getClientIp } from '../utils/ip';
import { PERMISSIONS, RATE_LIMIT } from '../../shared/constants';

const rateLimitMap = new Map<string, number[]>();

export const clearRateLimitMap = (): void => rateLimitMap.clear();

export const getRateLimitMapSize = (): number => rateLimitMap.size;

function pruneExpiredEntries(now: number): void {
  const windowStart = now - RATE_LIMIT.WINDOW_MS;
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
  const windowStart = now - RATE_LIMIT.WINDOW_MS;

  if (rateLimitMap.size > RATE_LIMIT.PRUNE_THRESHOLD) {
    pruneExpiredEntries(now);
  }

  const requestStamps = (rateLimitMap.get(key) ?? []).filter((ts) => ts > windowStart);

  if (requestStamps.length >= RATE_LIMIT.MAX_REQUESTS) {
    ctx.status = 429;
    ctx.body = 'Too Many Requests';
    return;
  }

  requestStamps.push(now);

  if (!rateLimitMap.has(key) && rateLimitMap.size >= RATE_LIMIT.MAX_MAP_SIZE) {
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
        method: 'GET',
        path: '/logout',
        handler: 'oidc.logout',
        config: { auth: false },
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
