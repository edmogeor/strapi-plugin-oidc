import type { StrapiContext, PluginConfig } from '../types';

const TRUSTED_HEADER_WHITELIST = new Set(['cf-connecting-ip']);

function getTrustedHeaderName(): string | undefined {
  const config = (strapi.config.get('plugin::strapi-plugin-oidc') ?? {}) as Partial<PluginConfig>;
  const raw = config.OIDC_TRUSTED_IP_HEADER;
  if (typeof raw !== 'string' || !raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  return TRUSTED_HEADER_WHITELIST.has(normalized) ? normalized : undefined;
}

export function getClientIp(ctx: StrapiContext): string {
  const proxyTrusted = ctx.app?.proxy === true;

  if (proxyTrusted) {
    const trustedHeader = getTrustedHeaderName();
    if (trustedHeader) {
      const value = ctx.get(trustedHeader);
      if (value) return value.split(',')[0].trim();
    }

    const forwarded = ctx.request.ips;
    if (forwarded && forwarded.length > 0) {
      return forwarded[0];
    }
  }

  return ctx.ip;
}
