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

function isJtiMap(value: unknown): value is Record<string, number> {
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).every(([, v]) => typeof v === 'number');
}

function pruneJtis(): void {
  const cutoff = Date.now() - JTI_TTL_MS;
  for (const [jti, timestamp] of seenJtis) {
    if (timestamp < cutoff) {
      seenJtis.delete(jti);
    }
  }
}

async function loadStoredJtis(): Promise<Record<string, number> | null> {
  const store = getJtiStore();
  const value = await store.get({ key: JTI_STORE_KEY });
  return isJtiMap(value) ? value : null;
}

async function isJtiReplayed(jti: string): Promise<boolean> {
  pruneJtis();
  if (seenJtis.has(jti)) return true;

  const stored = await loadStoredJtis();
  const cutoff = Date.now() - JTI_TTL_MS;
  if (stored && stored[jti] && stored[jti] > cutoff) return true;

  return false;
}

async function persistJti(jti: string): Promise<void> {
  seenJtis.set(jti, Date.now());

  let stored = await loadStoredJtis();
  if (!stored) stored = {};
  const cutoff = Date.now() - JTI_TTL_MS;
  for (const key of Object.keys(stored)) {
    if (stored[key] < cutoff) delete stored[key];
  }
  stored[jti] = Date.now();
  const store = getJtiStore();
  await store.set({ key: JTI_STORE_KEY, value: stored });
}

export async function pruneStoredJtis(): Promise<void> {
  pruneJtis();

  try {
    let stored = await loadStoredJtis();
    if (!stored) return;
    const cutoff = Date.now() - JTI_TTL_MS;
    for (const key of Object.keys(stored)) {
      if (stored[key] < cutoff) delete stored[key];
    }
    const store = getJtiStore();
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

    const eventsObj = payload.events;
    if (
      typeof eventsObj !== 'object' ||
      eventsObj === null ||
      !Object.prototype.hasOwnProperty.call(
        eventsObj,
        'http://schemas.openid.net/event/backchannel-logout',
      )
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

async function lookupUserByOidcSub(
  strapi: StrapiContext['strapi'],
  oidcSub: string,
): Promise<{ id: number } | null> {
  const raw = await strapi.db.connection.raw(
    'SELECT id FROM admin_users WHERE oidc_sub = ? LIMIT 1',
    [oidcSub],
  );
  const rows = raw?.rows ?? raw;
  const firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (firstRow && typeof firstRow.id === 'number') {
    return { id: firstRow.id };
  }
  return null;
}

async function lookupUserByOidcSid(
  strapi: StrapiContext['strapi'],
  oidcSid: string,
): Promise<{ id: number } | null> {
  const raw = await strapi.db.connection.raw(
    'SELECT id FROM admin_users WHERE oidc_sid = ? LIMIT 1',
    [oidcSid],
  );
  const rows = raw?.rows ?? raw;
  const firstRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (firstRow && typeof firstRow.id === 'number') {
    return { id: firstRow.id };
  }
  return null;
}

export async function backchannelLogout(ctx: StrapiContext) {
  const auditLog = getAuditLogService();
  const ip = getClientIp(strapi, ctx);

  function hasLogoutToken(value: unknown): value is { logout_token: string } {
    if (typeof value !== 'object' || value === null) return false;
    return Object.entries(value).some(([k, v]) => k === 'logout_token' && typeof v === 'string');
  }

  const body = ctx.request.body;
  if (!hasLogoutToken(body)) {
    ctx.status = 200;
    return;
  }
  const logoutToken = body.logout_token;

  function hasJti(value: unknown): value is { jti: string } {
    if (typeof value !== 'object' || value === null) return false;
    return Object.entries(value).some(([k, v]) => k === 'jti' && typeof v === 'string');
  }

  const jti = (() => {
    try {
      const parts = logoutToken.split('.');
      if (parts.length !== 3) return undefined;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      return hasJti(payload) ? payload.jti : undefined;
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
        user = await lookupUserByOidcSub(strapi, result.sub);
      }
      if (!user && result.sid) {
        user = await lookupUserByOidcSid(strapi, result.sid);
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
