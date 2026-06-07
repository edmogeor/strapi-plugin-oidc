import { describe, it, expect } from 'vitest';
import { shouldRedirectToOidc } from '../../../admin/src/utils/shouldRedirect';

describe('shouldRedirectToOidc', () => {
  it('returns true when unauthenticated with no bounce', () => {
    expect(
      shouldRedirectToOidc({
        pathname: '/admin',
        search: '',
        localStorage: { getItem: () => null },
        cookies: '',
      }),
    ).toBe(true);
  });

  it('returns false when server bounce query param is present', () => {
    expect(
      shouldRedirectToOidc({
        pathname: '/admin/auth/login',
        search: '?oidc_redirect=1',
        localStorage: { getItem: () => null },
        cookies: '',
      }),
    ).toBe(false);
  });

  it('returns false when token exists in localStorage', () => {
    expect(
      shouldRedirectToOidc({
        pathname: '/admin',
        search: '',
        localStorage: { getItem: (_key: string) => 'mock-token' },
        cookies: '',
      }),
    ).toBe(false);
  });

  it('returns false when token exists in cookie', () => {
    expect(
      shouldRedirectToOidc({
        pathname: '/admin',
        search: '',
        localStorage: { getItem: () => null },
        cookies: 'jwtToken=mock-cookie-token; other=value',
      }),
    ).toBe(false);
  });

  it('returns true when search has unrelated query params', () => {
    expect(
      shouldRedirectToOidc({
        pathname: '/admin',
        search: '?other=value',
        localStorage: { getItem: () => null },
        cookies: '',
      }),
    ).toBe(true);
  });

  it('returns false when bounce param appears among multiple query params', () => {
    expect(
      shouldRedirectToOidc({
        pathname: '/admin/auth/login',
        search: '?redirectTo=%2Fadmin&oidc_redirect=1',
        localStorage: { getItem: () => null },
        cookies: '',
      }),
    ).toBe(false);
  });
});
