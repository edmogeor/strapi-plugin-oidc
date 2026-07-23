import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { COOKIE_NAMES } from '../../../../utils/cookies';
import type { StrapiContext } from '../../../../types';

const sendErrorResponse = vi.fn();
const handleCallbackError = vi.fn();
const auditLogLog = vi.fn();

vi.mock('../../../../utils/oidc-client', () => ({
  getOidcConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../../utils/cookies', async () => {
  const actual = await vi.importActual<typeof import('../../../../utils/cookies')>(
    '../../../../utils/cookies',
  );
  return {
    ...actual,
    shouldMarkSecure: vi.fn().mockReturnValue(false),
    readCookie: vi.fn().mockReturnValue(undefined),
  };
});

vi.mock('../../../../utils/services', () => ({
  getOauthService: vi.fn().mockReturnValue({ renderSignUpSuccess: vi.fn().mockReturnValue({}) }),
  getRoleService: vi.fn(),
  getWhitelistService: vi.fn(),
  getAuditLogService: vi.fn().mockReturnValue({ log: auditLogLog }),
  getAdminUserService: vi.fn(),
}));

vi.mock('../../../../utils/ip', () => ({
  getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('../../../../i18n', () => ({
  getLocaleFromContext: vi.fn().mockReturnValue('en'),
  t: vi.fn().mockImplementation((locale: string, key: string) => key),
}));

vi.mock('../../../../controllers/oidc/shared', () => ({
  configValidation: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../../controllers/oidc/errors', () => ({
  sendErrorResponse,
  handleCallbackError,
}));

vi.mock('../../../../controllers/oidc/userAuth', () => ({
  handleUserAuthentication: vi.fn(),
}));

const { oidcSignInCallback } = await import('../../../../controllers/oidc/callback');
const { readCookie } = await import('../../../../utils/cookies');

interface TestContext extends StrapiContext {
  query: Record<string, unknown>;
  request: StrapiContext['request'] & { href: string };
  cookies: StrapiContext['cookies'] & {
    calls: Array<{ name: string; value: string | null; opts?: Record<string, unknown> }>;
  };
  sentBody?: unknown;
}

const makeCtx = (
  opts: { query?: Record<string, unknown>; cookies?: Record<string, string> } = {},
): TestContext => {
  const calls: Array<{ name: string; value: string | null; opts?: Record<string, unknown> }> = [];
  const ctx = {
    query: opts.query ?? {},
    request: { href: 'https://example.com/strapi-plugin-oidc/oidc/callback?code=abc&state=xyz' },
    cookies: {
      get(name: string) {
        return opts.cookies?.[name];
      },
      set(name: string, value: string | null, cookieOpts?: Record<string, unknown>) {
        calls.push({ name, value, opts: cookieOpts });
      },
      calls,
    },
    state: {},
    send(body: unknown) {
      ctx.sentBody = body;
    },
  } as TestContext;
  return ctx;
};

describe('oidcSignInCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as unknown as { strapi?: unknown }).strapi = {
      log: { error: vi.fn() },
      config: { get: () => undefined, set: () => undefined },
      db: { connection: { raw: vi.fn() } },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { strapi?: unknown }).strapi;
  });

  it('returns an error when the authorization code is missing', async () => {
    const ctx = makeCtx({ query: {} });

    await oidcSignInCallback(ctx);

    expect(auditLogLog).toHaveBeenCalledWith({ action: 'missing_code', ip: '127.0.0.1' });
    expect(sendErrorResponse).toHaveBeenCalledWith(
      ctx,
      expect.anything(),
      'user.missing_code',
      'en',
    );
  });

  it('returns an error when the state does not match the cookie', async () => {
    vi.mocked(readCookie).mockImplementation((_, name) =>
      name === COOKIE_NAMES.state ? 'expected-state' : undefined,
    );
    const ctx = makeCtx({ query: { code: 'abc', state: 'wrong-state' } });

    await oidcSignInCallback(ctx);

    expect(auditLogLog).toHaveBeenCalledWith({ action: 'state_mismatch', ip: '127.0.0.1' });
    expect(sendErrorResponse).toHaveBeenCalledWith(
      ctx,
      expect.anything(),
      'user.invalid_state',
      'en',
    );
  });

  it('clears PKCE cookies before processing the callback', async () => {
    vi.mocked(readCookie).mockImplementation((_, name) => {
      if (name === COOKIE_NAMES.state) return 'expected-state';
      if (name === COOKIE_NAMES.codeVerifier) return 'verifier';
      if (name === COOKIE_NAMES.nonce) return 'nonce';
      return undefined;
    });
    const ctx = makeCtx({ query: { code: 'abc', state: 'expected-state' } });

    await oidcSignInCallback(ctx);

    const clearedNames = ctx.cookies.calls.filter((c) => c.value === null).map((c) => c.name);
    expect(clearedNames).toContain(COOKIE_NAMES.state);
    expect(clearedNames).toContain(COOKIE_NAMES.codeVerifier);
    expect(clearedNames).toContain(COOKIE_NAMES.nonce);
  });
});
