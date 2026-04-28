import type { StrapiContext } from '../types';
import type { PluginConfig } from '../../shared/config';

// Headers that CDN/proxy vendors guarantee to strip from client requests,
// so only the infrastructure itself can set them.
// cf-connecting-ip / true-client-ip: Cloudflare (+ Akamai for the latter)
// x-real-ip: nginx proxy_set_header X-Real-IP $remote_addr
// fastly-client-ip: Fastly CDN
// fly-client-ip: Fly.io (reflects the IP Fly Proxy accepted the connection from)
// x-nf-client-connection-ip: Netlify
const TRUSTED_IP_HEADERS = new Set([
  'cf-connecting-ip',
  'true-client-ip',
  'x-real-ip',
  'fastly-client-ip',
  'fly-client-ip',
  'x-nf-client-connection-ip',
]);

function getTrustedHeaderName(): string | undefined {
  const config = (strapi.config.get('plugin::strapi-plugin-oidc') ?? {}) as Partial<PluginConfig>;
  const raw = config.OIDC_TRUSTED_IP_HEADER;
  if (typeof raw !== 'string' || !raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  return TRUSTED_IP_HEADERS.has(normalized) ? normalized : undefined;
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
