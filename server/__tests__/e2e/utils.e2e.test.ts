import { describe, it, expect, afterEach } from 'vitest';
import { clearRateLimitMap, getRateLimitMapSize } from './test-helpers';

describe('rate-limit map bounding and pruning', () => {
  afterEach(() => {
    clearRateLimitMap();
  });

  it('clearRateLimitMap empties the map', async () => {
    const request = (await import('supertest')).default;
    const strapi = globalThis.strapiInstance;
    for (let i = 0; i < 3; i++) {
      await request(strapi.server.httpServer)
        .get('/strapi-plugin-oidc/oidc')
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .redirects(0);
    }
    clearRateLimitMap();
    expect(getRateLimitMapSize()).toBe(0);
  });
});
