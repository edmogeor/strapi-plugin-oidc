export const AUDIT_ACTIONS = [
  'login_success',
  'login_failure',
  'missing_code',
  'state_mismatch',
  'nonce_mismatch',
  'token_exchange_failed',
  'whitelist_rejected',
  'email_not_verified',
  'id_token_invalid',
  'logout',
  'session_expired',
  'user_created',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
