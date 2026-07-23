import { describe, it, expect, afterEach } from 'vitest';
import { resolveRedirectUri } from '../../controllers/oidc/shared';
import type { PluginConfig } from '../../../shared/config';

const baseConfig: PluginConfig = {
  OIDC_PUBLIC_URL: '',
  OIDC_CLIENT_ID: 'test-client',
  OIDC_CLIENT_SECRET: '',
  OIDC_ISSUER: 'https://issuer.example.com',
};

describe('resolveRedirectUri', () => {
  afterEach(() => {
    delete process.env.PUBLIC_URL;
    process.env.NODE_ENV = 'test';
  });

  it('uses OIDC_PUBLIC_URL from config when provided', () => {
    const uri = resolveRedirectUri({
      ...baseConfig,
      OIDC_PUBLIC_URL: 'https://myapp.com',
    });
    expect(uri).toBe('https://myapp.com/strapi-plugin-oidc/oidc/callback');
  });

  it('strips trailing slashes from OIDC_PUBLIC_URL', () => {
    const uri = resolveRedirectUri({
      ...baseConfig,
      OIDC_PUBLIC_URL: 'https://myapp.com/',
    });
    expect(uri).toBe('https://myapp.com/strapi-plugin-oidc/oidc/callback');
  });

  it('strips multiple trailing slashes from OIDC_PUBLIC_URL', () => {
    const uri = resolveRedirectUri({
      ...baseConfig,
      OIDC_PUBLIC_URL: 'https://myapp.com///',
    });
    expect(uri).toBe('https://myapp.com/strapi-plugin-oidc/oidc/callback');
  });

  it('falls back to PUBLIC_URL env var when OIDC_PUBLIC_URL is empty', () => {
    process.env.PUBLIC_URL = 'https://env-url.example.com';
    const uri = resolveRedirectUri({ ...baseConfig, OIDC_PUBLIC_URL: '' });
    expect(uri).toBe('https://env-url.example.com/strapi-plugin-oidc/oidc/callback');
  });

  it('falls back to localhost:1337 when neither config nor env are set (non-production)', () => {
    process.env.NODE_ENV = 'development';
    const uri = resolveRedirectUri({ ...baseConfig, OIDC_PUBLIC_URL: '' });
    expect(uri).toBe('http://localhost:1337/strapi-plugin-oidc/oidc/callback');
  });

  it('throws in production when no URL is configured', () => {
    process.env.NODE_ENV = 'production';
    expect(() => resolveRedirectUri({ ...baseConfig, OIDC_PUBLIC_URL: '' })).toThrow(
      'OIDC_PUBLIC_URL or PUBLIC_URL must be set in production.',
    );
  });

  it('uses PUBLIC_URL in production when OIDC_PUBLIC_URL is unset', () => {
    process.env.NODE_ENV = 'production';
    process.env.PUBLIC_URL = 'https://prod.example.com';
    const uri = resolveRedirectUri({ ...baseConfig, OIDC_PUBLIC_URL: '' });
    expect(uri).toBe('https://prod.example.com/strapi-plugin-oidc/oidc/callback');
  });
});
