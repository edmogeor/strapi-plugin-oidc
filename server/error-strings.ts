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
  WHITELIST_NOT_PRESENT: 'WHITELIST_NOT_PRESENT',
  SESSION_MANAGER_UNSUPPORTED: 'SESSION_MANAGER_UNSUPPORTED',
  MISSING_CONFIG: 'MISSING_CONFIG',
} as const;

const ERROR_DETAIL_TEMPLATES: Record<string, string> = {
  token_exchange_failed: 'Token exchange failed with HTTP status {status}',
  userinfo_fetch_failed: 'UserInfo endpoint returned HTTP {status}',
  role_update_failed: 'Role update failed for user {userId}: {error}',
  user_creation_failed: 'User creation failed for {email}: {error}',
  id_token_parse_failed: 'ID token parse failed: {error}',
  sign_in_unknown: 'Unknown sign-in error: {error}',
  invalid_email: 'Invalid email address received from OIDC provider',
  whitelist_not_present: 'Email not present in whitelist',
  session_manager_unsupported:
    'sessionManager is not supported. Please upgrade to Strapi v5.24.1 or later.',
  missing_config: 'Missing required config keys: {keys}',
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
  WHITELIST_NOT_PRESENT: 'Not present in whitelist',
  SESSION_MANAGER_UNSUPPORTED:
    'sessionManager is not supported. Please upgrade to Strapi v5.24.1 or later.',
  MISSING_CONFIG: (keys: string) => `Missing required config keys: ${keys}`,
} as const;
