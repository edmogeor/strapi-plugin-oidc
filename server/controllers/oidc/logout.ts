import { clearAuthCookies } from '../../utils/cookies';
import { getAuditLogService } from '../../utils/services';
import { getClientIp } from '../../utils/ip';
import type { StrapiContext, AuditAction, PluginConfig } from '../../types';

const LOGOUT_USERINFO_TIMEOUT_MS = 1500;

// Returns true only when the provider explicitly rejects the token (4xx).
// Timeouts and network errors return false so we still redirect to the provider.
async function isProviderSessionExpired(
  userinfoEndpoint: string,
  accessToken: string,
): Promise<boolean> {
  try {
    const response = await fetch(userinfoEndpoint, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(LOGOUT_USERINFO_TIMEOUT_MS),
    });
    return !response.ok;
  } catch {
    return false;
  }
}

export async function logout(ctx: StrapiContext) {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as PluginConfig;
  const auditLog = getAuditLogService();
  const logoutUrl = config.OIDC_END_SESSION_ENDPOINT;
  const adminPanelUrl = strapi.config.get('admin.url', '/admin') as string;
  const loginUrl = `${adminPanelUrl}/auth/login`;

  // Read before clearing (cookies are gone after clearAuthCookies).
  const isOidcSession = !!ctx.cookies.get('oidc_authenticated');
  const accessToken = ctx.cookies.get('oidc_access_token');
  const userEmail = ctx.cookies.get('oidc_user_email') ?? undefined;

  clearAuthCookies(strapi, ctx);

  if (!isOidcSession) {
    return ctx.redirect(loginUrl);
  }

  const logAudit = (action: AuditAction) =>
    userEmail
      ? auditLog.log({ action, email: userEmail, ip: getClientIp(ctx) })
      : Promise.resolve();

  if (logoutUrl && accessToken) {
    // Skip provider logout only when the provider confirms the token is expired (4xx).
    // On timeout or network error we still redirect to the provider.
    const expired = await isProviderSessionExpired(config.OIDC_USERINFO_ENDPOINT, accessToken);
    if (expired) {
      await logAudit('session_expired');
      return ctx.redirect(loginUrl);
    }
    logAudit('logout').catch(() => {});
    return ctx.redirect(logoutUrl);
  }

  await logAudit('logout');
  ctx.redirect(logoutUrl || loginUrl);
}
