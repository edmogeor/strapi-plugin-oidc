import type { StrapiContext } from '../types';

export function getClientIp(ctx: StrapiContext): string {
  const cfConnectingIp = ctx.get('CF-Connecting-IP');
  if (cfConnectingIp) {
    return cfConnectingIp.split(',')[0].trim();
  }

  const forwardedFor = ctx.get('X-Forwarded-For');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = ctx.get('X-Real-IP');
  if (realIp) {
    return realIp.trim();
  }

  return ctx.ip;
}
