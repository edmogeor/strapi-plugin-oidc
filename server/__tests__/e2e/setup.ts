import { createStrapi } from '@strapi/strapi';
import path from 'path';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import dotenv from 'dotenv';
import { beforeAll, afterEach, afterAll } from 'vitest';

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
  })
);

let instance: any;

export async function setupStrapi() {
  if (!instance) {
    const appDir = path.resolve(__dirname, '../../../test-app');
    
    // We need to require dotenv to ensure Strapi test-app env vars are loaded
    dotenv.config({ path: path.join(appDir, '.env') });
    
    instance = createStrapi({
      appDir: appDir,
      distDir: path.join(appDir, 'dist'),
    });

    await instance.load();
    await instance.server.mount();
  }
  return instance;
}

beforeAll(async () => {
  oidcServer.listen({ onUnhandledRequest: 'bypass' });
  (global as any).strapiInstance = await setupStrapi();
});

afterEach(() => {
  oidcServer.resetHandlers();
});

afterAll(async () => {
  oidcServer.close();
  const instance = (global as any).strapiInstance;
  if (instance) {
    if (instance.server && instance.server.httpServer) {
      instance.server.httpServer.close();
    }
    // Let the process exit naturally instead of explicitly destroying the database connection
    // as it was causing better-sqlite3 EPIPE / segfaults during worker teardown
  }
});
