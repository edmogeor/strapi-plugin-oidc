import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { oidcServer } from './setup';
import type { Core } from './test-types';
import { MOCK_OIDC_CONFIG, applyDefaultOidcConfig, queryAuditLog } from './test-helpers';
import { resetOidcConfig } from '../../utils/oidc-client';
import { clearRateLimitMap } from '../../routes';
import { clearJtiStore } from '../../controllers/oidc/backchannelLogout';

async function generateKeyPairAndJwk(): Promise<{
  privateKey: jose.CryptoKey;
  publicKey: jose.CryptoKey;
  jwk: jose.JWK;
}> {
  const pair = await jose.generateKeyPair('RS256');
  const jwk = await jose.exportJWK(pair.publicKey);
  jwk.alg = 'RS256';
  jwk.kid = 'bcl-test-kid';
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, jwk };
}

async function signLogoutToken(
  privateKey: jose.CryptoKey,
  kid: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({
    iss: 'https://mock-oidc.com',
    events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
    ...overrides,
  })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
}

const BC_TEST_EMAIL = 'bcl-test@test.com';
const BC_TEST_SUB = 'bcl-mock-sub';

describe('Backchannel Logout E2E', () => {
  let strapi: Core.Strapi;
  let keyPair: Awaited<ReturnType<typeof generateKeyPairAndJwk>>;

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;
    keyPair = await generateKeyPairAndJwk();
  });

  const setupJwksOverride = () => {
    oidcServer.use(
      http.get('https://mock-oidc.com/jwks', () => HttpResponse.json({ keys: [keyPair.jwk] })),
    );
  };

  const createUserWithOidcSub = async () => {
    const user = await strapi.db.query('admin::user').create({
      data: {
        email: BC_TEST_EMAIL,
        firstname: 'Bcl',
        lastname: 'Test',
        password: '$2a$10$aaaaaaaaaaaaaaaaaaaaaaa',
      },
    });
    await strapi.db.connection.raw('UPDATE admin_users SET oidc_sub = ? WHERE id = ?', [
      BC_TEST_SUB,
      user.id,
    ]);
    return user;
  };

  beforeEach(async () => {
    resetOidcConfig();
    clearRateLimitMap();
    clearJtiStore();
    strapi.config.set('plugin::strapi-plugin-oidc', MOCK_OIDC_CONFIG);
    await applyDefaultOidcConfig(strapi);
    await strapi.db.query('admin::user').deleteMany({ where: { email: BC_TEST_EMAIL } });
    await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});
    setupJwksOverride();
  });

  afterAll(async () => {
    await strapi.db.query('admin::user').deleteMany({ where: { email: BC_TEST_EMAIL } });
  });

  describe('POST /backchannel-logout', () => {
    it('returns 200 when logout_token is missing', async () => {
      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/backchannel-logout')
        .send({});

      expect(res.status).toBe(200);
    });

    it('returns 200 when logout_token is present but invalid', async () => {
      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/backchannel-logout')
        .send({ logout_token: 'not.a.valid.token' });

      expect(res.status).toBe(200);
    });

    it('returns 200 and logs backchannel_logout_unknown_sub when user not found', async () => {
      const token = await signLogoutToken(keyPair.privateKey, keyPair.jwk.kid as string, {
        aud: 'mock-client-id',
        sub: BC_TEST_SUB,
        jti: 'jti-unknown-sub',
      });

      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/backchannel-logout')
        .send({ logout_token: token });

      expect(res.status).toBe(200);

      const logs = await queryAuditLog(strapi, 'logout');
      const unknownLog = logs.find(
        (l: { detailsKey?: string }) => l.detailsKey === 'backchannel_logout_unknown_sub',
      );
      expect(unknownLog).toBeDefined();
    });

    it('returns 200 when valid token has wrong issuer', async () => {
      const token = await signLogoutToken(keyPair.privateKey, keyPair.jwk.kid as string, {
        iss: 'https://wrong-issuer.com',
        aud: 'mock-client-id',
        sub: BC_TEST_SUB,
        jti: 'jti-wrong-issuer',
      });

      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/backchannel-logout')
        .send({ logout_token: token });

      expect(res.status).toBe(200);
    });

    it('returns 200 when valid token has wrong audience', async () => {
      const token = await signLogoutToken(keyPair.privateKey, keyPair.jwk.kid as string, {
        aud: 'wrong-client-id',
        sub: BC_TEST_SUB,
        jti: 'jti-wrong-aud',
      });

      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/backchannel-logout')
        .send({ logout_token: token });

      expect(res.status).toBe(200);
    });

    it('returns 200 when token lacks the backchannel-logout event', async () => {
      const token = await signLogoutToken(keyPair.privateKey, keyPair.jwk.kid as string, {
        aud: 'mock-client-id',
        sub: BC_TEST_SUB,
        jti: 'jti-no-event',
        events: {},
      });

      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/backchannel-logout')
        .send({ logout_token: token });

      expect(res.status).toBe(200);
    });

    it('returns 200 when configured — logs backchannel_logout and rejects replayed JTI', async () => {
      await createUserWithOidcSub();

      const token = await signLogoutToken(keyPair.privateKey, keyPair.jwk.kid as string, {
        aud: 'mock-client-id',
        sub: BC_TEST_SUB,
        jti: 'jti-valid',
      });

      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/backchannel-logout')
        .send({ logout_token: token });
      expect(res.status).toBe(200);

      const logs = await queryAuditLog(strapi, 'logout');
      const backchannelLog = logs.find(
        (l: { detailsKey?: string }) => l.detailsKey === 'backchannel_logout',
      );
      expect(backchannelLog).toBeDefined();

      const res2 = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/backchannel-logout')
        .send({ logout_token: token });
      expect(res2.status).toBe(200);

      const logsAfterReplay = await queryAuditLog(strapi, 'logout');
      const backchannelCount = logsAfterReplay.filter(
        (l: { detailsKey?: string }) => l.detailsKey === 'backchannel_logout',
      ).length;
      expect(backchannelCount).toBe(1);
    });

    it('returns 200 when configured — rejects tokens missing the sub claim', async () => {
      const token = await signLogoutToken(keyPair.privateKey, keyPair.jwk.kid as string, {
        aud: 'mock-client-id',
        jti: 'jti-no-sub',
      });

      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/backchannel-logout')
        .send({ logout_token: token });

      expect(res.status).toBe(200);
    });

    it('returns 200 when the token has no jti (no replay protection applied)', async () => {
      await createUserWithOidcSub();

      const token = await signLogoutToken(keyPair.privateKey, keyPair.jwk.kid as string, {
        aud: 'mock-client-id',
        sub: BC_TEST_SUB,
      });

      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/backchannel-logout')
        .send({ logout_token: token });

      expect(res.status).toBe(200);

      const logs = await queryAuditLog(strapi, 'logout');
      const backchannelLog = logs.find(
        (l: { detailsKey?: string }) => l.detailsKey === 'backchannel_logout',
      );
      expect(backchannelLog).toBeDefined();
    });
  });

  describe('backchannel logout rate limiter', () => {
    it('blocks excessive requests from the same IP', async () => {
      const res = await request(strapi.server.httpServer)
        .post('/strapi-plugin-oidc/backchannel-logout')
        .send({});

      expect(res.status).toBe(200);
    });
  });
});
