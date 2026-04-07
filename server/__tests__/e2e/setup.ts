import { createStrapi } from '@strapi/strapi';
import path from 'path';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import dotenv from 'dotenv';
import { beforeAll, afterEach, afterAll } from 'vitest';
import type { Core } from './test-types';

// Mock OIDC Provider
export const oidcServer = setupServer(
  http.get('https://mock-oidc.com/authorize', () => {
    return HttpResponse.text('Mock Authorize');
  }),
  http.post('https://mock-oidc.com/token', () => {
    return HttpResponse.json({ access_token: 'fake-jwt-token' });
  }),
  http.get('https://mock-oidc.com/userinfo', () => {
    return HttpResponse.json({
      email: 'test@company.com',
      family_name: 'Doe',
      given_name: 'John',
    });
  }),
);

let instance: Core.Strapi | undefined;

export async function setupStrapi(): Promise<Core.Strapi> {
  if (!instance) {
    const appDir = path.resolve(__dirname, '../../../test-app');

    // We need to require dotenv to ensure Strapi test-app env vars are loaded
    dotenv.config({ path: path.join(appDir, '.env') });

    instance = createStrapi({
      appDir: appDir,
      distDir: path.join(appDir, 'dist'),
    }) as unknown as Core.Strapi;

    await instance.load();
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

afterAll(async () => {
  oidcServer.close();
  if (globalThis.strapiInstance?.server?.httpServer) {
    globalThis.strapiInstance.server.httpServer.close();
  }
  // Let the process exit naturally instead of explicitly destroying the database connection
  // as it was causing better-sqlite3 EPIPE / segfaults during worker teardown
});
