import * as jose from 'jose';
import { getOidcConfig } from '../../utils/oidc-client';
import { getAuditLogService } from '../../utils/services';
import { getClientIp } from '../../utils/ip';
import type { StrapiContext } from '../../types';

const seenJtis = new Map<string, number>();
const JTI_TTL_MS = 5 * 60 * 1000;

function pruneJtis(): void {
  const cutoff = Date.now() - JTI_TTL_MS;
  for (const [jti, timestamp] of seenJtis) {
    if (timestamp < cutoff) {
      seenJtis.delete(jti);
    }
  }
}

async function validateLogoutToken(
  jwksUri: string,
  issuer: string,
  clientId: string,
  token: string,
): Promise<{ sub: string } | null> {
  try {
    const jwks = jose.createRemoteJWKSet(new URL(jwksUri));
    const { payload } = await jose.jwtVerify(token, jwks, {
      issuer,
      audience: clientId,
    });

    const events = payload.events as unknown;
    if (
      !events ||
      typeof events !== 'object' ||
      !(events as Record<string, unknown>)['http://schemas.openid.net/event/backchannel-logout']
    ) {
      return null;
    }

    const sub = payload.sub;
    if (!sub || typeof sub !== 'string') {
      return null;
    }

    return { sub };
  } catch {
    return null;
  }
}

export async function backchannelLogout(ctx: StrapiContext) {
  const auditLog = getAuditLogService();
  const ip = getClientIp(ctx);

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
    pruneJtis();
    if (seenJtis.has(jti)) {
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
      seenJtis.set(jti, Date.now());
    }

    const user = await strapi.db.query('admin::user').findOne({
      where: { oidc_sub: result.sub },
      select: ['id'],
    });

    if (!user) {
      await auditLog.log({ action: 'logout', ip, detailsKey: 'backchannel_logout_unknown_sub' });
      ctx.status = 200;
      return;
    }

    const sessionManager = (strapi as { sessionManager?: (...args: unknown[]) => unknown })
      .sessionManager;

    if (sessionManager) {
      const origin = sessionManager as unknown as { hasOrigin(origin: string): boolean };
      const sm = sessionManager as unknown as (origin: string) => {
        invalidateRefreshToken(id: string): Promise<void>;
      };
      if (origin.hasOrigin('admin')) {
        await sm('admin').invalidateRefreshToken(String(user.id));
      }
    }

    await auditLog.log({ action: 'logout', ip, detailsKey: 'backchannel_logout' });
  } catch (err) {
    strapi.log.error('[strapi-plugin-oidc] Back-channel logout error:', err);
  }

  ctx.status = 200;
}
