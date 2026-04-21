import { errorCodes, type ErrorCode } from './error-strings';
import type { AuditAction } from './types';

type OidcErrorKind =
  | 'nonce_mismatch'
  | 'token_exchange_failed'
  | 'id_token_parse_failed'
  | 'userinfo_fetch_failed'
  | 'user_creation_failed'
  | 'whitelist_rejected'
  | 'invalid_email'
  | 'email_not_verified'
  | 'unknown';

export class OidcError extends Error {
  readonly kind: OidcErrorKind;
  readonly cause?: unknown;
  constructor(kind: OidcErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'OidcError';
    this.kind = kind;
    this.cause = cause;
  }
}

export const OIDC_ERROR_DISPATCH: Record<
  OidcErrorKind,
  { action: AuditAction; code: ErrorCode; key?: string }
> = {
  nonce_mismatch: { action: 'nonce_mismatch', code: errorCodes.NONCE_MISMATCH },
  token_exchange_failed: {
    action: 'token_exchange_failed',
    code: errorCodes.TOKEN_EXCHANGE_FAILED,
  },
  id_token_parse_failed: {
    action: 'login_failure',
    code: errorCodes.ID_TOKEN_PARSE_FAILED,
    key: 'id_token_parse_failed',
  },
  userinfo_fetch_failed: {
    action: 'login_failure',
    code: errorCodes.USERINFO_FETCH_FAILED,
    key: 'userinfo_fetch_failed',
  },
  user_creation_failed: {
    action: 'login_failure',
    code: errorCodes.USER_CREATION_FAILED,
    key: 'user_creation_failed',
  },
  whitelist_rejected: {
    action: 'whitelist_rejected',
    code: errorCodes.WHITELIST_CHECK_FAILED,
    key: 'whitelist_rejected',
  },
  invalid_email: {
    action: 'login_failure',
    code: errorCodes.TOKEN_EXCHANGE_FAILED,
    key: 'sign_in_unknown',
  },
  email_not_verified: {
    action: 'email_not_verified',
    code: errorCodes.EMAIL_NOT_VERIFIED,
    key: 'email_not_verified',
  },
  unknown: {
    action: 'login_failure',
    code: errorCodes.TOKEN_EXCHANGE_FAILED,
    key: 'sign_in_unknown',
  },
};
