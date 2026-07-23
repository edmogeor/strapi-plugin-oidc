import * as jose from 'jose';
import { getOidcConfig } from '../../utils/oidc-client';
import { getAuditLogService } from '../../utils/services';
import { getClientIp } from '../../utils/ip';
import { getSessionManager } from '../../utils/strapi-extensions';
import type { StrapiContext } from '../../types';

const seenJtis = new Map<string, number>();
const JTI_TTL_MS = 5 * 60 * 1000;
const JTI_STORE_KEY = 'backchannel_jtis';

function getJtiStore() {
  return strapi.store({ environment: '', type: 'plugin', name: 'strapi-plugin-oidc' });
}

function pruneJtis(): void {
  const cutoff = Date.now() - JTI_TTL_MS;
  for (const [jti, timestamp] of seenJtis) {
    if (timestamp < cutoff) {
      seenJtis.delete(jti);
    }
  }
}

async function isJtiReplayed(jti: string): Promise<boolean> {
  pruneJtis();
  if (seenJtis.has(jti)) return true;

  try {
    const store = getJtiStore();
    const stored = (await store.get({ key: JTI_STORE_KEY })) as Record<string, number> | null;
    const cutoff = Date.now() - JTI_TTL_MS;
    if (stored && stored[jti] && stored[jti] > cutoff) return true;
  } catch {
    // Fall through — if the store is unavailable, rely on in-memory Map only
  }

  return false;
}

async function persistJti(jti: string): Promise<void> {
  seenJtis.set(jti, Date.now());
  try {
    const store = getJtiStore();
    let stored = (await store.get({ key: JTI_STORE_KEY })) as Record<string, number> | null;
    if (!stored) stored = {};
    const cutoff = Date.now() - JTI_TTL_MS;
    for (const key of Object.keys(stored)) {
      if (stored[key] < cutoff) delete stored[key];
    }
    stored[jti] = Date.now();
    await store.set({ key: JTI_STORE_KEY, value: stored });
  } catch {
    // Accept in-memory-only persistence when the store is unavailable
  }
}

export async function pruneStoredJtis(): Promise<void> {
  pruneJtis();

  try {
    const store = getJtiStore();
    const stored = (await store.get({ key: JTI_STORE_KEY })) as Record<string, number> | null;
    if (!stored) return;
    const cutoff = Date.now() - JTI_TTL_MS;
    for (const key of Object.keys(stored)) {
      if (stored[key] < cutoff) delete stored[key];
    }
    if (Object.keys(stored).length === 0) {
      await store.delete({ key: JTI_STORE_KEY });
    } else {
      await store.set({ key: JTI_STORE_KEY, value: stored });
    }
  } catch {
    // Nothing to clean up if the store is unavailable
  }
}

export function clearJtiStore(): void {
  seenJtis.clear();
  try {
    const store = getJtiStore();
    store.delete({ key: JTI_STORE_KEY }).catch(() => {});
  } catch {
    // ignore
  }
}

async function validateLogoutToken(
  jwksUri: string,
  issuer: string,
  clientId: string,
  token: string,
): Promise<{ sub?: string; sid?: string } | null> {
  try {
    const jwks = jose.createRemoteJWKSet(new URL(jwksUri));
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer,
      audience: clientId,
    });

    if (payload.nonce) {
      return null;
    }

    const events = payload.events as unknown;
    const eventsObj = events;
    if (
      typeof eventsObj !== 'object' ||
      eventsObj === null ||
      typeof (eventsObj as Record<string, unknown>)[
        'http://schemas.openid.net/event/backchannel-logout'
      ] !== 'object'
    ) {
      return null;
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
    const sid = typeof payload.sid === 'string' ? payload.sid : undefined;
    if (!sub && !sid) {
      return null;
    }

    return { sub, sid };
  } catch {
    return null;
  }
}

export async function backchannelLogout(ctx: StrapiContext) {
  const auditLog = getAuditLogService();
  const ip = getClientIp(strapi, ctx);

  const body = ctx.request.body as { logout_token?: string };
  const logoutToken = body?.logout_token;
  if (!logoutToken || typeof logoutToken !== 'string') {
    ctx.status = 200;
    return;
  }

  const jti = (() => {
    try {
      const parts = logoutToken.split('.');
      return parts.length === 3
        ? (JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { jti?: string }).jti
        : undefined;
    } catch {
      return undefined;
    }
  })();

  if (jti) {
    const replayed = await isJtiReplayed(jti);
    if (replayed) {
      ctx.status = 200;
      return;
    }
  }

  try {
    const oidcConfig = await getOidcConfig();
    const clientId = oidcConfig.clientMetadata().client_id;
    const { issuer, jwks_uri } = oidcConfig.serverMetadata();
    const jwksUri = typeof jwks_uri === 'string' ? jwks_uri : '';

    if (!issuer || !jwksUri) {
      await auditLog.log({
        action: 'logout',
        ip,
        detailsKey: 'backchannel_logout_config_error',
      });
      ctx.status = 200;
      return;
    }

    const result = await validateLogoutToken(jwksUri, issuer, clientId, logoutToken);
    if (!result) {
      ctx.status = 200;
      return;
    }

    if (jti) {
      await persistJti(jti);
    }

    let user: { id: number } | null = null;
    try {
      if (result.sub) {
        const raw = await strapi.db.connection.raw(
          'SELECT id FROM admin_users WHERE oidc_sub = ? LIMIT 1',
          [result.sub],
        );
        const rows = raw?.rows ?? raw;
        const firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (firstRow && typeof firstRow.id === 'number') {
          user = { id: firstRow.id };
        }
      } else if (result.sid) {
        const raw = await strapi.db.connection.raw(
          'SELECT id FROM admin_users WHERE oidc_sub = ? LIMIT 1',
          [result.sid],
        );
        const rows = raw?.rows ?? raw;
        const firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        if (firstRow && typeof firstRow.id === 'number') {
          user = { id: firstRow.id };
        }
      }
    } catch {
      user = null;
    }

    if (!user) {
      await auditLog.log({ action: 'logout', ip, detailsKey: 'backchannel_logout_unknown_sub' });
      ctx.status = 200;
      return;
    }

    const sessionManager = getSessionManager(strapi);
    if (sessionManager?.hasOrigin('admin')) {
      await sessionManager('admin').invalidateRefreshToken(String(user.id));
    }

    await auditLog.log({ action: 'logout', ip, detailsKey: 'backchannel_logout' });
  } catch (err) {
    strapi.log.error('[strapi-plugin-oidc] Back-channel logout error:', err);
  }

  ctx.status = 200;
}
