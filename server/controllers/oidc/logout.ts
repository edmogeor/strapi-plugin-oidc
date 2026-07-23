import * as client from 'openid-client';
import { getOidcConfig } from '../../utils/oidc-client';
import { clearAuthCookies, COOKIE_NAMES, readCookie } from '../../utils/cookies';
import { getAuditLogService, getWhitelistService } from '../../utils/services';
import { getClientIp } from '../../utils/ip';
import { resolveSkipLoginPage } from '../../utils/configFlag';
import { getPluginConfig } from '../../utils/pluginConfig';
import { OIDC_SIGN_IN_PATH } from '../../../shared/constants';
import type { StrapiContext } from '../../types';

export async function logout(ctx: StrapiContext) {
  let oidcConfig;
  try {
    oidcConfig = await getOidcConfig();
  } catch (err) {
    strapi.log.error('[strapi-plugin-oidc] Failed to fetch OIDC config for logout:', err);
    oidcConfig = null;
  }

  const idToken = readCookie(ctx, COOKIE_NAMES.idToken);
  const userEmail = readCookie(ctx, COOKIE_NAMES.userEmail) ?? undefined;

  const adminPanelUrl = strapi.config.get('admin.url', '/admin') as string;
  const loginUrl = `${adminPanelUrl}/auth/login`;
  const whitelistService = getWhitelistService();
  const settings = await whitelistService.getSettings();
  const relativeFallback = resolveSkipLoginPage(strapi, settings?.skipLoginPage)
    ? OIDC_SIGN_IN_PATH
    : loginUrl;

  const publicUrl = getPluginConfig(strapi).OIDC_PUBLIC_URL || process.env.PUBLIC_URL || '';
  const fallbackUrl = publicUrl
    ? `${publicUrl.replace(/\/+$/, '')}${relativeFallback}`
    : relativeFallback;

  clearAuthCookies(strapi, ctx);

  if (!idToken) {
    return ctx.redirect(fallbackUrl);
  }

  const auditLog = getAuditLogService();
  if (userEmail) {
    await auditLog
      .log({ action: 'logout', email: userEmail, ip: getClientIp(strapi, ctx) })
      .catch((err) => {
        strapi.log.error('[strapi-plugin-oidc] Audit log failed on logout:', err);
      });
  }

  if (oidcConfig) {
    try {
      const endSessionUrl = client.buildEndSessionUrl(oidcConfig, {
        id_token_hint: idToken,
        post_logout_redirect_uri: fallbackUrl,
      });
      return ctx.redirect(endSessionUrl.href);
    } catch {
      // End session URL construction failed; fall back to local redirect.
    }
  }

  return ctx.redirect(fallbackUrl);
}
