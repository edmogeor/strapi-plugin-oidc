import * as client from 'openid-client';
import { COOKIE_NAMES, shouldMarkSecure, reconcileCookieName } from '../../utils/cookies';
import { configValidation, resolveRedirectUri } from './shared';
import { getOidcConfig } from '../../utils/oidc-client';
import { getOauthService, getWhitelistService } from '../../utils/services';
import { resolveSkipLoginPage } from '../../utils/configFlag';
import { negotiateLocale, t } from '../../i18n';
import { toMessage } from '../../../shared/utils';
import { PKCE_COOKIE_MAX_AGE_MS } from '../../../shared/constants';
import type { StrapiContext } from '../../types';

export async function oidcSignIn(ctx: StrapiContext) {
  try {
    const config = configValidation();

    // Only gate auto-redirects (those with ?oidc_redirect=1). Explicit SSO
    // button clicks arrive without this param and always proceed.
    if (ctx.query.oidc_redirect === '1') {
      const whitelistService = getWhitelistService();
      const settings = await whitelistService.getSettings();
      if (!resolveSkipLoginPage(strapi, settings?.skipLoginPage)) {
        const raw = strapi.config.get('admin.url');
        const adminUrl = typeof raw === 'string' && raw.length > 0 ? raw : '/admin';
        ctx.redirect(`${adminUrl}/auth/login?oidc_redirect=1`);
        return;
      }
    }

    const oidcConfig = await getOidcConfig();

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();

    const secureFlag = shouldMarkSecure(strapi, ctx);
    const cookieOptions = {
      httpOnly: true,
      maxAge: PKCE_COOKIE_MAX_AGE_MS,
      secure: secureFlag,
      sameSite: 'lax' as const,
      path: '/',
    };

    ctx.cookies.set(
      reconcileCookieName(COOKIE_NAMES.codeVerifier, secureFlag),
      codeVerifier,
      cookieOptions,
    );
    ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.state, secureFlag), state, cookieOptions);
    ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.nonce, secureFlag), nonce, cookieOptions);

    const redirectUri = resolveRedirectUri(config);
    const authUrl = client.buildAuthorizationUrl(oidcConfig, {
      redirect_uri: redirectUri,
      scope: config.OIDC_SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
      ...(config.OIDC_MAX_AGE ? { max_age: String(config.OIDC_MAX_AGE) } : {}),
      ...(config.OIDC_PROMPT ? { prompt: config.OIDC_PROMPT } : {}),
    });

    ctx.set('Location', authUrl.href);
    return ctx.send({}, 302);
  } catch (e) {
    strapi.log.error({ phase: 'oidc_sign_in', message: toMessage(e) });
    const locale = negotiateLocale(ctx.request.headers['accept-language'] as string | undefined);
    return ctx.send(getOauthService().renderSignUpError(t(locale, 'user.signInError'), locale));
  }
}
