import { describe, it, expect } from 'vitest';
import type { Core } from '@strapi/types';
import { resolveAdminPath } from '../../bootstrap';
import { createMockStrapi } from './mock-strapi';

describe('resolveAdminPath', () => {
  const makeStrapi = (adminUrl: unknown) => {
    const strapi = createMockStrapi();
    strapi.config.set('admin.url', adminUrl);
    return strapi as unknown as Core.Strapi;
  };

  it('returns /admin by default', () => {
    expect(resolveAdminPath(makeStrapi(undefined))).toBe('/admin');
  });

  it('returns the configured absolute path', () => {
    expect(resolveAdminPath(makeStrapi('/admin'))).toBe('/admin');
  });

  it('returns the pathname from a full URL', () => {
    expect(resolveAdminPath(makeStrapi('https://example.com/admin'))).toBe('/admin');
  });

  it('strips a trailing slash from the URL pathname', () => {
    expect(resolveAdminPath(makeStrapi('https://example.com/admin/'))).toBe('/admin');
  });

  it('prefixes a relative path without a leading slash', () => {
    expect(resolveAdminPath(makeStrapi('dashboard'))).toBe('/dashboard');
  });

  it('falls back to /admin for an empty config value', () => {
    expect(resolveAdminPath(makeStrapi(''))).toBe('/admin');
  });
});
