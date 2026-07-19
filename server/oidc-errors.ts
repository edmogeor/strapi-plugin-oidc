import { errorCodes, type ErrorCode } from './error-strings';
import type { AuditAction } from './types';

type OidcErrorKind =
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
    code: errorCodes.SIGN_IN_ERROR,
    key: 'sign_in_unknown',
  },
  email_not_verified: {
    action: 'email_not_verified',
    code: errorCodes.EMAIL_NOT_VERIFIED,
    key: 'email_not_verified',
  },
  unknown: {
    action: 'login_failure',
    code: errorCodes.SIGN_IN_ERROR,
    key: 'sign_in_unknown',
  },
};
