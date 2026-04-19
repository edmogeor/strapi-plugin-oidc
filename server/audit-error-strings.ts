import { t } from './i18n';

export const userFacingMessages = (locale: string) => ({
  missing_code: t(
    locale,
    'user.missing_code',
    'Authorisation code was not received from the OIDC provider.',
  ),
  invalid_state: t(
    locale,
    'user.invalid_state',
    'State parameter mismatch. Please restart the login flow.',
  ),
  signInError: t(locale, 'user.signInError', 'Authentication failed. Please try again.'),
});

export const authPageMessages = (locale: string) => ({
  authenticatingTitle: t(locale, 'auth.page.authenticating.title', 'Authenticating...'),
  noscriptHeading: t(locale, 'auth.page.authenticating.noscript.heading', 'JavaScript Required'),
  noscriptBody: t(
    locale,
    'auth.page.authenticating.noscript.body',
    'JavaScript must be enabled for authentication to complete.',
  ),
  errorTitle: t(locale, 'auth.page.error.title', 'Authentication Failed'),
  returnToLogin: t(locale, 'auth.page.error.returnToLogin', 'Return to Login'),
});
