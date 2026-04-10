import type { AuditAction } from './types';

export function getAuditLogDetails(action: AuditAction, msg?: string): string {
  switch (action) {
    case 'login_failure':
      return `Unexpected error during authentication: ${msg ?? 'Unknown error'}`;
    case 'missing_code':
      return 'Authorisation code was not received in the OIDC callback. Check your OIDC provider configuration.';
    case 'state_mismatch':
      return 'State parameter mismatch. Clear cookies and restart the login flow.';
    case 'nonce_mismatch':
      return 'CSRF token mismatch. Clear cookies and restart the login flow.';
    case 'token_exchange_failed':
      return 'Provider token exchange failed. Verify OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, and OIDC_REDIRECT_URI in plugin configuration.';
    case 'whitelist_rejected':
      return 'User not in allowlist. Add the user email to the OIDC allowlist in the plugin settings.';
    case 'login_success':
    case 'logout':
    case 'session_expired':
    case 'user_created':
      return '';
  }
}

export const errorMessages = {
  missing_code: 'Authorisation code was not received from the OIDC provider.',
  invalid_state: 'State parameter mismatch. Please restart the login flow.',
  authentication_failed: 'Authentication failed. Please try again.',
} as const;

export const userMessages = {
  signInError: 'Authentication failed. Please try again.',
} as const;
