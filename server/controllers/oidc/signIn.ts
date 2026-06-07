import { randomBytes } from 'node:crypto';
import pkceChallenge from 'pkce-challenge';
import { shouldMarkSecure, COOKIE_NAMES } from '../../utils/cookies';
import { configValidation, resolveRedirectUri } from './shared';
import { getOauthService, getWhitelistService } from '../../utils/services';
import { resolveSkipLoginPage } from '../../utils/skipLoginPage';
import { negotiateLocale, t } from '../../i18n';
import { toMessage } from '../../../shared/utils';
import { PKCE_COOKIE_MAX_AGE_MS } from '../../../shared/constants';
import type { StrapiContext } from '../../types';

export async function oidcSignIn(ctx: StrapiContext) {
  try {
    const config = configValidation();
    const whitelistService = getWhitelistService();
    const settings = await whitelistService.getSettings();

    if (!resolveSkipLoginPage(strapi, settings?.skipLoginPage)) {
      const raw = strapi.config.get('admin.url');
      const adminUrl = typeof raw === 'string' && raw.length > 0 ? raw : '/admin';
      ctx.redirect(`${adminUrl}/auth/login?oidc_redirect=1`);
      return;
    }

    const { OIDC_CLIENT_ID, OIDC_SCOPE, OIDC_AUTHORIZATION_ENDPOINT } = config;

    const { code_verifier: codeVerifier, code_challenge: codeChallenge } = await pkceChallenge();

    // Generate state server-side to prevent CSRF attacks.
    const state = randomBytes(32).toString('base64url');
    // Generate nonce to prevent ID token replay attacks.
    const nonce = randomBytes(32).toString('base64url');

    const cookieOptions = {
      httpOnly: true,
      maxAge: PKCE_COOKIE_MAX_AGE_MS,
      secure: shouldMarkSecure(strapi, ctx),
      sameSite: 'lax' as const,
    };

    ctx.cookies.set(COOKIE_NAMES.codeVerifier, codeVerifier, cookieOptions);
    ctx.cookies.set(COOKIE_NAMES.state, state, cookieOptions);
    ctx.cookies.set(COOKIE_NAMES.nonce, nonce, cookieOptions);

    const redirectUri = resolveRedirectUri(config);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: OIDC_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: OIDC_SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });

    const authorizationUrl = `${OIDC_AUTHORIZATION_ENDPOINT}?${params.toString()}`;
    ctx.set('Location', authorizationUrl);
    return ctx.send({}, 302);
  } catch (e) {
    strapi.log.error({ phase: 'oidc_sign_in', message: toMessage(e) });
    const locale = negotiateLocale(ctx.request.headers['accept-language'] as string | undefined);
    return ctx.send(getOauthService().renderSignUpError(t(locale, 'user.signInError'), locale));
  }
}
