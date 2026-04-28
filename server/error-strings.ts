export const errorCodes = {
  TOKEN_EXCHANGE_FAILED: 'TOKEN_EXCHANGE_FAILED',
  USERINFO_FETCH_FAILED: 'USERINFO_FETCH_FAILED',
  ID_TOKEN_PARSE_FAILED: 'ID_TOKEN_PARSE_FAILED',
  NONCE_MISMATCH: 'NONCE_MISMATCH',
  ROLE_RESOLUTION_FAILED: 'ROLE_RESOLUTION_FAILED',
  ROLE_UPDATE_FAILED: 'ROLE_UPDATE_FAILED',
  USER_CREATION_FAILED: 'USER_CREATION_FAILED',
  JWT_GENERATION_FAILED: 'JWT_GENERATION_FAILED',
  WHITELIST_CHECK_FAILED: 'WHITELIST_CHECK_FAILED',
  STATE_MISMATCH: 'STATE_MISMATCH',
  MISSING_CODE: 'MISSING_CODE',
  INVALID_EMAIL: 'INVALID_EMAIL',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  ID_TOKEN_INVALID: 'ID_TOKEN_INVALID',
  WHITELIST_NOT_PRESENT: 'WHITELIST_NOT_PRESENT',
  SESSION_MANAGER_UNSUPPORTED: 'SESSION_MANAGER_UNSUPPORTED',
  PROVIDER_RESPONSE_INVALID: 'PROVIDER_RESPONSE_INVALID',
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

const ERROR_DETAIL_TEMPLATES: Record<string, string> = {
  token_exchange_failed: 'Token exchange failed with HTTP status {status}',
  userinfo_fetch_failed: 'UserInfo endpoint returned HTTP {status}',
  role_update_failed: 'Role update failed for user {userId}: {error}',
  user_creation_failed: 'User creation failed for {email}: {error}',
  id_token_parse_failed: 'ID token parse failed: {error}',
  sign_in_unknown: 'Unknown sign-in error: {error}',
  invalid_email: 'Invalid email address received from OIDC provider',
  email_not_verified: 'Email address has not been verified by the OIDC provider',
  id_token_invalid: 'ID token verification failed: {error}',
  whitelist_not_present: 'Email not present in whitelist',
  provider_response_invalid: 'Provider returned an unexpected response: {error}',
  session_manager_unsupported:
    'sessionManager is not supported. Please upgrade to Strapi v5.24.1 or later.',
};

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

export function getErrorDetail(
  key: string,
  params?: Record<string, string | number>,
): string | undefined {
  const template = ERROR_DETAIL_TEMPLATES[key];
  if (!template) return undefined;
  return interpolate(template, params);
}

export const errorMessages = {
  TOKEN_EXCHANGE_FAILED: 'Token exchange failed',
  USERINFO_FETCH_FAILED: 'Failed to fetch user info',
  ID_TOKEN_PARSE_FAILED: 'Failed to parse ID token',
  NONCE_MISMATCH: 'Nonce mismatch',
  INVALID_EMAIL: 'Invalid email address received from OIDC provider',
  EMAIL_NOT_VERIFIED: 'Email address has not been verified by the OIDC provider',
  ID_TOKEN_INVALID: 'ID token verification failed',
  WHITELIST_NOT_PRESENT: 'Not present in whitelist',
  PROVIDER_RESPONSE_INVALID: 'Unexpected response from OIDC provider',
  SESSION_MANAGER_UNSUPPORTED:
    'sessionManager is not supported. Please upgrade to Strapi v5.24.1 or later.',
  OIDC_ISSUER_NOT_CONFIGURED:
    '[strapi-plugin-oidc] OIDC_ISSUER is not configured — discovery skipped. OIDC sign-in will fail until OIDC_ISSUER is set in your plugin config.',
  JWKS_URI_NOT_CONFIGURED:
    "[strapi-plugin-oidc] OIDC_JWKS_URI is not configured — ID token signature verification is disabled. Set OIDC_JWKS_URI and OIDC_ISSUER from your provider's discovery document.",
  ENFORCE_MIDDLEWARE_ERROR: 'Error checking OIDC enforcement in middleware:',
  ENFORCE_SYNC_ERROR: '[strapi-plugin-oidc] Failed to sync OIDC_ENFORCE to database:',
  DEFAULT_ROLE_INIT_ERROR: 'Could not initialize default OIDC role:',
  AUDIT_LOG_CLEANUP_ERROR: '[strapi-plugin-oidc] Audit log cleanup failed:',
  AUDIT_LOG_EXPORT_ERROR: 'NDJSON export stream failed',
  DISCOVERY_FETCH_ERROR: (url: string, reason: string) =>
    `[strapi-plugin-oidc] Failed to fetch OIDC discovery document from ${url}: ${reason}`,
  MISSING_CONFIG: (keys: string) => `Missing required config keys: ${keys}`,
  WHITELIST_INVALID_EMAIL: 'Please enter a valid email address',
  WHITELIST_INVALID_REQUEST: 'Invalid request body',
  WHITELIST_IMPORT_INVALID: 'Expected { users: [{email}] }',
} as const;
