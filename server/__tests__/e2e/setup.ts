import path from 'path';
import fs from 'fs';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import dotenv from 'dotenv';
import { beforeAll, afterEach, afterAll } from 'vitest';
import * as jose from 'jose';
import type { Core } from './test-types';

let keyPair: { privateKey: jose.CryptoKey; publicKey: jose.CryptoKey; jwk: jose.JWK } | null = null;

async function getKeyPair() {
  if (!keyPair) {
    const pair = await jose.generateKeyPair('RS256');
    const jwk = await jose.exportJWK(pair.publicKey);
    jwk.alg = 'RS256';
    jwk.kid = 'mock-kid';
    keyPair = { privateKey: pair.privateKey, publicKey: pair.publicKey, jwk };
  }
  return keyPair;
}

async function signMockIdToken(overrides: Record<string, unknown> = {}) {
  const { privateKey, jwk } = await getKeyPair();
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    iss: 'https://mock-oidc.com',
    sub: 'mock-sub',
    aud: 'mock-client-id',
    email: 'test@company.com',
    email_verified: true,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
}

export const oidcServer = setupServer(
  http.get('https://mock-oidc.com/.well-known/openid-configuration', () => {
    return HttpResponse.json({
      issuer: 'https://mock-oidc.com',
      authorization_endpoint: 'https://mock-oidc.com/authorize',
      token_endpoint: 'https://mock-oidc.com/token',
      userinfo_endpoint: 'https://mock-oidc.com/userinfo',
      end_session_endpoint: 'https://mock-oidc.com/logout',
      jwks_uri: 'https://mock-oidc.com/jwks',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    });
  }),
  http.get('https://mock-oidc.com/jwks', async () => {
    const { jwk } = await getKeyPair();
    return HttpResponse.json({ keys: [jwk] });
  }),
  http.get('https://mock-oidc.com/authorize', () => {
    return HttpResponse.text('Mock Authorize');
  }),
  http.post('https://mock-oidc.com/token', async () => {
    const idToken = await signMockIdToken({ nonce: globalThis.__testOidcNonce });
    return HttpResponse.json({
      access_token: 'fake-jwt-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid profile email',
      id_token: idToken,
    });
  }),
  http.get('https://mock-oidc.com/userinfo', ({ request }) => {
    if (request.headers.get('authorization') === 'Bearer expired-token') {
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json({
      email: 'test@company.com',
      email_verified: true,
      family_name: 'Doe',
      given_name: 'John',
      sub: 'mock-sub',
    });
  }),
);

const workerId = process.env.VITEST_WORKER_ID ?? '0';
const dbFileName = `.tmp/test-${workerId}.db`;
let instance: Core.Strapi | undefined;

export async function setupStrapi(): Promise<Core.Strapi> {
  if (!instance) {
    const appDir = path.resolve(__dirname, '../../../test-app');

    process.env.PROXY = 'false';
    process.env.OIDC_FORCE_SECURE_COOKIES = 'false';

    dotenv.config({ path: path.join(appDir, '.env') });

    process.env.DATABASE_FILENAME = dbFileName;

    const { createStrapi } = await import('@strapi/strapi');
    instance = createStrapi({
      appDir: appDir,
      distDir: path.join(appDir, 'dist'),
    }) as unknown as Core.Strapi;
    await instance.load();

    const requestProto = Object.getPrototypeOf(instance.server.app.request);
    Object.defineProperty(requestProto, 'secure', {
      get() {
        return true;
      },
      configurable: true,
    });

    await instance.server.mount();
  }
  return instance;
}

beforeAll(async () => {
  oidcServer.listen({ onUnhandledRequest: 'bypass' });
  globalThis.strapiInstance = await setupStrapi();
});

afterEach(() => {
  oidcServer.resetHandlers();
});

const TEST_EMAIL_DOMAINS = [
  '@company.com',
  '@test.com',
  '@acme.com',
  '@other.com',
  '@b.com',
  '@whitelist.com',
];

async function deleteFixtureAdminUsers(strapi: Core.Strapi): Promise<void> {
  const query = strapi.db.query('admin::user');
  await Promise.all(
    TEST_EMAIL_DOMAINS.map((suffix) =>
      query.deleteMany({ where: { email: { $endsWith: suffix } } }),
    ),
  );
}

function cleanupDatabaseFiles() {
  const dbPath = path.resolve(__dirname, '../../../', dbFileName);
  for (const suffix of ['', '-wal', '-shm']) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        // Best effort cleanup
      }
    }
  }
}

afterAll(async () => {
  oidcServer.close();
  if (globalThis.strapiInstance) {
    try {
      await deleteFixtureAdminUsers(globalThis.strapiInstance);
    } catch (err) {
      console.warn('[e2e teardown] failed to clean up fixture admin users:', err);
    }
    try {
      const whitelistService = globalThis.strapiInstance
        .plugin('strapi-plugin-oidc')
        .service('whitelist');
      await whitelistService.setSettings({
        useWhitelist: false,
        enforceOIDC: false,
        skipLoginPage: false,
      });
    } catch (err) {
      console.warn('[e2e teardown] failed to reset OIDC settings:', err);
    }
  }
  if (globalThis.strapiInstance?.server?.httpServer) {
    globalThis.strapiInstance.server.httpServer.close();
  }
  cleanupDatabaseFiles();
});
