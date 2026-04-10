import en from '../translations/locales/en.json';

export const userFacingMessages = {
  get missing_code() {
    return en['user.missing_code'] ?? 'Authorisation code was not received from the OIDC provider.';
  },
  get invalid_state() {
    return en['user.invalid_state'] ?? 'State parameter mismatch. Please restart the login flow.';
  },
  get signInError() {
    return en['user.signInError'] ?? 'Authentication failed. Please try again.';
  },
} as const;
