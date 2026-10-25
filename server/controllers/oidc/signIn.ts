import * as client from 'openid-client';
import { COOKIE_NAMES, shouldMarkSecure, reconcileCookieName } from '../../utils/cookies';
import { configValidation, resolveRedirectUri } from './shared';
import { sendErrorResponse } from './errors';
import { getOidcConfig } from '../../utils/oidc-client';
import { getOauthService, getWhitelistService } from '../../utils/services';
import { resolveSkipLoginPage } from '../../utils/configFlag';
import { getLocaleFromContext, t } from '../../i18n';
import { toMessage } from '../../../shared/utils';
import { PKCE_COOKIE_MAX_AGE_MS, OIDC_COOKIE_PATH } from '../../../shared/constants';
import type { StrapiContext } from '../../types';
import { resolveAdminRedirect } from '../../utils/redirect';

export async function oidcSignIn(ctx: StrapiContext) {
  try {
    const config = configValidation();
    const redirectTo = resolveAdminRedirect(strapi, ctx.query.redirectTo);

    // Only gate auto-redirects (those with ?oidc_redirect=1). Explicit SSO
    // button clicks arrive without this param and always proceed.
    if (ctx.query.oidc_redirect === '1') {
      const whitelistService = getWhitelistService();
      const settings = await whitelistService.getSettings();
      if (!resolveSkipLoginPage(strapi, settings?.skipLoginPage)) {
        const adminUrl = resolveAdminRedirect(strapi);
        const query = new URLSearchParams({ oidc_redirect: '1', redirectTo });
        ctx.redirect(`${adminUrl.replace(/\/$/, '')}/auth/login?${query}`);
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
      path: OIDC_COOKIE_PATH,
    };

    ctx.cookies.set(
      reconcileCookieName(COOKIE_NAMES.codeVerifier, secureFlag),
      codeVerifier,
      cookieOptions,
    );
    ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.state, secureFlag), state, cookieOptions);
    ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.nonce, secureFlag), nonce, cookieOptions);
    ctx.cookies.set(
      reconcileCookieName(COOKIE_NAMES.redirect, secureFlag),
      `${state}:${encodeURIComponent(redirectTo)}`,
      cookieOptions,
    );

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
    const locale = getLocaleFromContext(ctx);
    return sendErrorResponse(ctx, getOauthService(), t(locale, 'user.signInError'), locale);
  }
}
