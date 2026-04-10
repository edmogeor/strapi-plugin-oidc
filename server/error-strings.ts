export const auditLogDetails = {
  login_failure: (msg: string) => `Unexpected error during authentication: ${msg}`,
  whitelist_rejected:
    'User not in allowlist. Add the user email to the OIDC allowlist in the plugin settings.',
  nonce_mismatch: 'CSRF token mismatch. Clear cookies and restart the login flow.',
  token_exchange_failed:
    'Provider token exchange failed. Verify OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, and OIDC_REDIRECT_URI in plugin configuration.',
} as const;

export const errorMessages = {
  missing_code: 'code Not Found',
  invalid_state: 'Invalid state',
  authentication_failed: 'Authentication failed. Please try again.',
} as const;

export const userMessages = {
  signInError: 'Authentication failed. Please try again.',
} as const;
