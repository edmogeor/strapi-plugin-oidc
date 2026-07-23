import { z } from 'zod';
import type { GroupRoleMap } from './constants';

const groupRoleMapSchema = z.record(z.string(), z.array(z.string()));

export const oidcUserInfoSchema = z
  .object({
    email: z.string().optional(),
    email_verified: z.union([z.boolean(), z.string()]).optional(),
    sub: z.string().optional(),
  })
  .passthrough();

export type OidcUserInfo = z.infer<typeof oidcUserInfoSchema>;

function toBoolCoerced(v: unknown): boolean | unknown {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return v;
}

const coerceBool = (defaultVal: boolean) =>
  z.preprocess(toBoolCoerced, z.boolean().default(defaultVal));

const coerceBoolNullable = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === 'null') return null;
    const coerced = toBoolCoerced(v);
    return typeof coerced === 'boolean' ? coerced : null;
  },
  z.union([z.boolean(), z.null()]).default(null),
);

export const pluginConfigSchema = z.object({
  REMEMBER_ME: coerceBool(false),
  OIDC_PUBLIC_URL: z.string().default(''),
  OIDC_CLIENT_ID: z.string().default(''),
  OIDC_CLIENT_SECRET: z.string().default(''),
  OIDC_SCOPE: z.string().default('openid profile email'),
  OIDC_FAMILY_NAME_FIELD: z.string().default('family_name'),
  OIDC_GIVEN_NAME_FIELD: z.string().default('given_name'),
  OIDC_SSO_BUTTON_TEXT: z.string().default('Login via SSO'),
  OIDC_ENFORCE: coerceBoolNullable,
  AUDIT_LOG_RETENTION_DAYS: z.number().default(90),
  OIDC_GROUP_FIELD: z.string().default('groups'),
  OIDC_GROUP_ROLE_MAP: z.preprocess((v) => {
    if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch {
        return {};
      }
    }
    return v;
  }, groupRoleMapSchema.default({})),
  OIDC_REQUIRE_EMAIL_VERIFIED: coerceBool(true),
  OIDC_TRUSTED_IP_HEADER: z.string().default(''),
  OIDC_ISSUER: z.string().default(''),
  OIDC_FORCE_SECURE_COOKIES: coerceBool(false),
  OIDC_SKIP_LOGIN_PAGE: coerceBoolNullable,
  OIDC_MAX_AGE: z.number().int().positive().optional(),
  OIDC_PROMPT: z.string().default(''),
  OIDC_CLIENT_ASSERTION: z
    .union([
      z.string(),
      z.object({
        privateKey: z.string(),
        keyId: z.string().optional(),
        algorithm: z.string().default('RS256'),
      }),
    ])
    .default(''),
});

export type PluginConfig = z.infer<typeof pluginConfigSchema>;

export type ClientAssertionConfig = {
  privateKey: string;
  keyId?: string;
  algorithm: string;
};

export function parseClientAssertion(raw: unknown): ClientAssertionConfig | null {
  if (typeof raw === 'string') {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ClientAssertionConfig;
    } catch {
      return null;
    }
  }
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.privateKey !== 'string' || !obj.privateKey) return null;
    return {
      privateKey: obj.privateKey as string,
      keyId: typeof obj.keyId === 'string' ? obj.keyId : undefined,
      algorithm: typeof obj.algorithm === 'string' ? obj.algorithm : 'RS256',
    };
  }
  return null;
}

export function parseGroupRoleMap(raw: unknown): GroupRoleMap {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as GroupRoleMap;
  }
  return {};
}
