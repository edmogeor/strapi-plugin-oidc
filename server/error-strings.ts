export const errorCodes = {
  SIGN_IN_ERROR: 'SIGN_IN_ERROR',
  ROLE_UPDATE_FAILED: 'ROLE_UPDATE_FAILED',
  USER_CREATION_FAILED: 'USER_CREATION_FAILED',
  WHITELIST_CHECK_FAILED: 'WHITELIST_CHECK_FAILED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

import { interpolate } from '../shared/utils';

const ERROR_DETAIL_TEMPLATES: Record<string, string> = {
  role_update_failed: 'Role update failed for user {userId}: {error}',
  user_creation_failed: 'User creation failed for {email}: {error}',
  sign_in_unknown: 'Unknown sign-in error: {error}',
  email_not_verified: 'Email address has not been verified by the OIDC provider',
  whitelist_rejected: 'Email not present in whitelist',
  session_manager_unsupported:
    'sessionManager is not supported. Please upgrade to Strapi v5.24.1 or later.',
};

export function getErrorDetail(
  key: string,
  params?: Record<string, string | number>,
): string | undefined {
  const template = ERROR_DETAIL_TEMPLATES[key];
  if (!template) return undefined;
  return interpolate(template, params);
}

export const errorMessages = {
  SIGN_IN_ERROR: 'Sign-in error',
  INVALID_EMAIL: 'Invalid email address received from OIDC provider',
  EMAIL_NOT_VERIFIED: 'Email address has not been verified by the OIDC provider',
  WHITELIST_NOT_PRESENT: 'Not present in whitelist',
  SESSION_MANAGER_UNSUPPORTED:
    'sessionManager is not supported. Please upgrade to Strapi v5.24.1 or later.',
  ENFORCE_MIDDLEWARE_ERROR: 'Error checking OIDC enforcement in middleware:',
  ENFORCE_SYNC_ERROR: '[strapi-plugin-oidc] Failed to sync OIDC_ENFORCE to database:',
  DEFAULT_ROLE_INIT_ERROR: 'Could not initialize default OIDC role:',
  AUDIT_LOG_CLEANUP_ERROR: '[strapi-plugin-oidc] Audit log cleanup failed:',
  AUDIT_LOG_EXPORT_ERROR: 'NDJSON export stream failed',
  MISSING_CONFIG: (keys: string) => `Missing required config keys: ${keys}`,
  WHITELIST_INVALID_EMAIL: 'Please enter a valid email address',
  WHITELIST_INVALID_REQUEST: 'Invalid request body',
  WHITELIST_IMPORT_INVALID: 'Expected { users: [{email}] }',
} as const;
