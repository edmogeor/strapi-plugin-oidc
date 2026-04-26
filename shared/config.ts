import { z } from 'zod';
import type { GroupRoleMap } from './constants';

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
  OIDC_DISCOVERY_URL: z.string().default(''),
  OIDC_REDIRECT_URI: z.string().default(''),
  OIDC_CLIENT_ID: z.string().default(''),
  OIDC_CLIENT_SECRET: z.string().default(''),
  OIDC_SCOPE: z.string().default('openid profile email'),
  OIDC_AUTHORIZATION_ENDPOINT: z.string().default(''),
  OIDC_TOKEN_ENDPOINT: z.string().default(''),
  OIDC_USERINFO_ENDPOINT: z.string().default(''),
  OIDC_FAMILY_NAME_FIELD: z.string().default('family_name'),
  OIDC_GIVEN_NAME_FIELD: z.string().default('given_name'),
  OIDC_END_SESSION_ENDPOINT: z.string().default(''),
  OIDC_SSO_BUTTON_TEXT: z.string().default('Sign in with OIDC'),
  OIDC_ENFORCE: coerceBoolNullable,
  AUDIT_LOG_RETENTION_DAYS: z.number().default(90),
  OIDC_GROUP_FIELD: z.string().default('groups'),
  OIDC_GROUP_ROLE_MAP: z
    .union([z.string(), z.record(z.string(), z.array(z.string()))])
    .default('{}'),
  OIDC_REQUIRE_EMAIL_VERIFIED: coerceBool(true),
  OIDC_TRUSTED_IP_HEADER: z.string().default(''),
  OIDC_JWKS_URI: z.string().default(''),
  OIDC_ISSUER: z.string().default(''),
  OIDC_FORCE_SECURE_COOKIES: coerceBool(false),
});

export type PluginConfig = z.infer<typeof pluginConfigSchema>;

export function parseGroupRoleMap(raw: unknown): GroupRoleMap {
  if (typeof raw !== 'string') {
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as GroupRoleMap;
    }
    return {};
  }
  try {
    return JSON.parse(raw) as GroupRoleMap;
  } catch {
    return {};
  }
}
