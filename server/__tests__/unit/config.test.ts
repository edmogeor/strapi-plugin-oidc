import { describe, it, expect } from 'vitest';
import { pluginConfigSchema, parseGroupRoleMap } from '../../../shared/config';
import type { PluginConfig } from '../../../shared/config';

describe('pluginConfigSchema', () => {
  describe('OIDC_SKIP_LOGIN_PAGE', () => {
    it('defaults to null when not provided', () => {
      const result = pluginConfigSchema.parse({});
      expect(result.OIDC_SKIP_LOGIN_PAGE).toBeNull();
    });

    it('accepts boolean true', () => {
      const result = pluginConfigSchema.parse({ OIDC_SKIP_LOGIN_PAGE: true });
      expect(result.OIDC_SKIP_LOGIN_PAGE).toBe(true);
    });

    it('accepts boolean false', () => {
      const result = pluginConfigSchema.parse({ OIDC_SKIP_LOGIN_PAGE: false });
      expect(result.OIDC_SKIP_LOGIN_PAGE).toBe(false);
    });

    it('coerces string "true" to boolean true', () => {
      const result = pluginConfigSchema.parse({ OIDC_SKIP_LOGIN_PAGE: 'true' });
      expect(result.OIDC_SKIP_LOGIN_PAGE).toBe(true);
    });

    it('coerces string "false" to boolean false', () => {
      const result = pluginConfigSchema.parse({ OIDC_SKIP_LOGIN_PAGE: 'false' });
      expect(result.OIDC_SKIP_LOGIN_PAGE).toBe(false);
    });

    it('coerces string "1" to boolean true', () => {
      const result = pluginConfigSchema.parse({ OIDC_SKIP_LOGIN_PAGE: '1' });
      expect(result.OIDC_SKIP_LOGIN_PAGE).toBe(true);
    });

    it('coerces string "0" to boolean false', () => {
      const result = pluginConfigSchema.parse({ OIDC_SKIP_LOGIN_PAGE: '0' });
      expect(result.OIDC_SKIP_LOGIN_PAGE).toBe(false);
    });

    it('defaults to null for invalid string values', () => {
      const result = pluginConfigSchema.parse({ OIDC_SKIP_LOGIN_PAGE: 'yes' });
      expect(result.OIDC_SKIP_LOGIN_PAGE).toBeNull();
    });

    it('defaults to null for non-boolean non-string values', () => {
      const result = pluginConfigSchema.parse({ OIDC_SKIP_LOGIN_PAGE: 42 });
      expect(result.OIDC_SKIP_LOGIN_PAGE).toBeNull();
    });
  });

  describe('full schema defaults', () => {
    it('returns all expected default values for an empty config', () => {
      const result = pluginConfigSchema.parse({});
      const defaults: Partial<PluginConfig> = {
        REMEMBER_ME: false,
        OIDC_SCOPE: 'openid profile email',
        OIDC_FAMILY_NAME_FIELD: 'family_name',
        OIDC_GIVEN_NAME_FIELD: 'given_name',
        OIDC_SSO_BUTTON_TEXT: 'Login via SSO',
        OIDC_ENFORCE: null,
        AUDIT_LOG_RETENTION_DAYS: 90,
        OIDC_GROUP_FIELD: 'groups',
        OIDC_GROUP_ROLE_MAP: {},
        OIDC_REQUIRE_EMAIL_VERIFIED: true,
        OIDC_FORCE_SECURE_COOKIES: false,
        OIDC_SKIP_LOGIN_PAGE: null,
      };
      for (const [key, expected] of Object.entries(defaults)) {
        expect((result as Record<string, unknown>)[key]).toStrictEqual(expected);
      }
    });
  });
});

describe('parseGroupRoleMap', () => {
  it('returns the object if already an object', () => {
    const obj = { admin: ['1'] };
    expect(parseGroupRoleMap(obj)).toEqual(obj);
  });

  it('returns empty object for non-object values', () => {
    expect(parseGroupRoleMap(null)).toEqual({});
    expect(parseGroupRoleMap(42)).toEqual({});
    expect(parseGroupRoleMap('invalid')).toEqual({});
  });
});
