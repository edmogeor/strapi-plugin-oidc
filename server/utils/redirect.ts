import type { StrapiConfig } from '../types';

export function resolveAdminRedirect(strapi: StrapiConfig, value?: unknown): string {
  const configured = strapi.config.get('admin.url');
  const adminUrl = typeof configured === 'string' && configured ? configured : '/admin';
  const base = new URL(adminUrl, 'https://oidc.invalid');
  const adminPath = base.pathname.replace(/\/+$/, '');
  const adminPrefix = `${adminPath}/`;
  const origin = /^https?:\/\//.test(adminUrl) ? base.origin : '';
  const fallback = `${origin}${adminPath || '/'}`;

  if (typeof value === 'string' && origin && value.startsWith(`${origin}/`)) {
    value = value.slice(origin.length);
  }

  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return fallback;
  }

  const pathname = value.split(/[?#]/, 1)[0];
  const path =
    pathname === adminPath || pathname.startsWith(adminPrefix) ? value : `${adminPath}${value}`;
  const destination = new URL(path, base);
  if (
    destination.origin !== base.origin ||
    destination.pathname.startsWith('//') ||
    (destination.pathname !== adminPath && !destination.pathname.startsWith(adminPrefix))
  ) {
    return fallback;
  }

  try {
    const relativePath = decodeURIComponent(destination.pathname.slice(adminPath.length));
    if (
      /[\\\u0000-\u001f\u007f]/.test(relativePath) ||
      /^\/(?:auth|logout|strapi-plugin-oidc)(?:\/|$)/.test(relativePath)
    ) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  const redirect = `${origin}${destination.pathname}${destination.search}${destination.hash}`;
  return encodeURIComponent(redirect).length <= 3000 ? redirect : fallback;
}

export function readLoginRedirect(cookie: string | undefined, state: string): string | undefined {
  const prefix = `${state}:`;
  if (!cookie?.startsWith(prefix)) return;
  try {
    return decodeURIComponent(cookie.slice(prefix.length));
  } catch {
    return;
  }
}
