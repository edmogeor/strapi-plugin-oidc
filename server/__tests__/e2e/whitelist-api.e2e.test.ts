import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Core, WhitelistEntry } from './test-types';

describe('Whitelist Content-API Routes', () => {
  let strapi: Core.Strapi;
  let apiToken: string;

  beforeAll(async () => {
    strapi = globalThis.strapiInstance;

    // Create a full-access API token for programmatic access tests
    const result = await strapi.service('admin::api-token').create({
      name: 'whitelist-api-test-token',
      description: 'Token used by whitelist API e2e tests',
      type: 'full-access',
      lifespan: null,
      permissions: [],
    });
    apiToken = result.accessKey;
  });

  afterAll(async () => {
    // Remove the test token and any leftover whitelist entries
    await strapi.db
      .query('admin::api-token')
      .deleteMany({ where: { name: 'whitelist-api-test-token' } });
    await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({
      where: {
        email: {
          $in: [
            'api-get@test.com',
            'api-register@test.com',
            'api-import1@test.com',
            'api-import2@test.com',
            'api-delete@test.com',
            'api-deleteall1@test.com',
            'api-deleteall2@test.com',
          ],
        },
      },
    });
  });

  it('should reject requests without an API token (401)', async () => {
    const res = await request(strapi.server.httpServer).get('/api/strapi-plugin-oidc/whitelist');
    expect(res.status).toBe(401);
  });

  it('GET /whitelist — returns whitelist entries', async () => {
    await strapi.plugin('strapi-plugin-oidc').service('whitelist').registerUser('api-get@test.com');

    const res = await request(strapi.server.httpServer)
      .get('/api/strapi-plugin-oidc/whitelist')
      .set('Authorization', `Bearer ${apiToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.whitelistUsers)).toBe(true);
    expect(
      res.body.whitelistUsers.some((u: WhitelistEntry) => u.email === 'api-get@test.com'),
    ).toBe(true);
  });

  it('POST /whitelist — registers a new email', async () => {
    const res = await request(strapi.server.httpServer)
      .post('/api/strapi-plugin-oidc/whitelist')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({ email: 'api-register@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.acceptedCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.rejectedEmails)).toBe(true);

    // Confirm it appears in the list
    const listRes = await request(strapi.server.httpServer)
      .get('/api/strapi-plugin-oidc/whitelist')
      .set('Authorization', `Bearer ${apiToken}`);
    expect(
      listRes.body.whitelistUsers.some((u: WhitelistEntry) => u.email === 'api-register@test.com'),
    ).toBe(true);
  });

  it('POST /whitelist/import — bulk-imports entries and skips duplicates', async () => {
    // Pre-insert one entry to be treated as a duplicate
    await strapi
      .plugin('strapi-plugin-oidc')
      .service('whitelist')
      .registerUser('api-import1@test.com');

    const res = await request(strapi.server.httpServer)
      .post('/api/strapi-plugin-oidc/whitelist/import')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({
        users: [
          { email: 'api-import1@test.com' }, // duplicate — skipped
          { email: 'api-import2@test.com' }, // new
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.importedCount).toBe(1);
  });

  it('POST /whitelist/import — returns 400 for non-array body', async () => {
    const res = await request(strapi.server.httpServer)
      .post('/api/strapi-plugin-oidc/whitelist/import')
      .set('Authorization', `Bearer ${apiToken}`)
      .send({ users: 'not-an-array' });

    expect(res.status).toBe(400);
  });

  it('DELETE /whitelist/:id — removes a single entry', async () => {
    await strapi
      .plugin('strapi-plugin-oidc')
      .service('whitelist')
      .registerUser('api-delete@test.com');

    const listRes = await request(strapi.server.httpServer)
      .get('/api/strapi-plugin-oidc/whitelist')
      .set('Authorization', `Bearer ${apiToken}`);
    const entry = listRes.body.whitelistUsers.find(
      (u: WhitelistEntry) => u.email === 'api-delete@test.com',
    );
    expect(entry).toBeDefined();

    const delRes = await request(strapi.server.httpServer)
      .delete(`/api/strapi-plugin-oidc/whitelist/${encodeURIComponent(entry.email)}`)
      .set('Authorization', `Bearer ${apiToken}`);
    expect(delRes.status).toBe(200);

    // Confirm removal
    const afterRes = await request(strapi.server.httpServer)
      .get('/api/strapi-plugin-oidc/whitelist')
      .set('Authorization', `Bearer ${apiToken}`);
    expect(afterRes.body.whitelistUsers.some((u: WhitelistEntry) => u.email === entry.email)).toBe(
      false,
    );
  });

  it('DELETE /whitelist — removes all entries', async () => {
    await strapi
      .plugin('strapi-plugin-oidc')
      .service('whitelist')
      .registerUser('api-deleteall1@test.com');
    await strapi
      .plugin('strapi-plugin-oidc')
      .service('whitelist')
      .registerUser('api-deleteall2@test.com');

    const delRes = await request(strapi.server.httpServer)
      .delete('/api/strapi-plugin-oidc/whitelist')
      .set('Authorization', `Bearer ${apiToken}`);
    expect(delRes.status).toBe(200);

    const listRes = await request(strapi.server.httpServer)
      .get('/api/strapi-plugin-oidc/whitelist')
      .set('Authorization', `Bearer ${apiToken}`);
    expect(listRes.body.whitelistUsers).toHaveLength(0);
  });
});
