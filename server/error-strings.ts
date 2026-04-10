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
} as const;

export function getErrorDetail(
  key: string,
  params?: Record<string, string | number>,
): string | undefined {
  switch (key) {
    case 'token_exchange_failed':
      return `Token exchange failed with HTTP status ${params?.status ?? 'unknown'}`;
    case 'userinfo_fetch_failed':
      return `UserInfo endpoint returned HTTP ${params?.status ?? 'unknown'}`;
    case 'role_update_failed':
      return `Role update failed for user ${params?.userId}: ${params?.error ?? 'unknown'}`;
    case 'user_creation_failed':
      return `User creation failed for ${params?.email}: ${params?.error ?? 'unknown'}`;
    case 'id_token_parse_failed':
      return `ID token parse failed: ${params?.error ?? 'unknown'}`;
    case 'sign_in_unknown':
      return `Unknown sign-in error: ${params?.error ?? 'unknown'}`;
    default:
      return undefined;
  }
}
