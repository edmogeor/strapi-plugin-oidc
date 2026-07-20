import { randomUUID } from 'node:crypto';
import * as client from 'openid-client';
import { getOidcConfig } from '../../utils/oidc-client';
import { shouldMarkSecure, COOKIE_NAMES } from '../../utils/cookies';
import { negotiateLocale, t } from '../../i18n';
import {
  getOauthService,
  getRoleService,
  getWhitelistService,
  getAuditLogService,
  getAdminUserService,
} from '../../utils/services';
import { getClientIp } from '../../utils/ip';
import { configValidation } from './shared';
import { handleUserAuthentication } from './userAuth';
import { handleCallbackError } from './errors';
import type { StrapiContext, OidcUserInfo, AuditLogService, StrapiAdminUser } from '../../types';

function readAndClearPkceCookies(ctx: StrapiContext): {
  oidcState: string | undefined;
  codeVerifier: string | undefined;
  oidcNonce: string | undefined;
} {
  const oidcState = ctx.cookies.get(COOKIE_NAMES.state);
  const codeVerifier = ctx.cookies.get(COOKIE_NAMES.codeVerifier);
  const oidcNonce = ctx.cookies.get(COOKIE_NAMES.nonce);
  ctx.cookies.set(COOKIE_NAMES.state, null, { maxAge: 0, expires: new Date(0) });
  ctx.cookies.set(COOKIE_NAMES.codeVerifier, null, { maxAge: 0, expires: new Date(0) });
  ctx.cookies.set(COOKIE_NAMES.nonce, null, { maxAge: 0, expires: new Date(0) });
  return { oidcState, codeVerifier, oidcNonce };
}

async function logSuccessfulAuth(
  auditLog: AuditLogService,
  ctx: StrapiContext,
  user: StrapiAdminUser,
  userCreated: boolean,
  rolesUpdated: boolean,
  resolvedRoleNames: string[],
): Promise<void> {
  const roles = resolvedRoleNames.join(', ');
  const entries: Promise<unknown>[] = [
    auditLog.log({
      action: 'login_success',
      email: user.email,
      ip: getClientIp(ctx),
      detailsKey: rolesUpdated ? 'roles_updated' : undefined,
      detailsParams: rolesUpdated ? { roles } : undefined,
    }),
  ];
  if (userCreated) {
    entries.push(
      auditLog.log({
        action: 'user_created',
        email: user.email,
        ip: getClientIp(ctx),
        detailsKey: 'user_created',
        detailsParams: { roles },
      }),
    );
  }
  await Promise.all(entries);
}

export async function oidcSignInCallback(ctx: StrapiContext) {
  const config = configValidation();
  const oidcConfig = await getOidcConfig();
  const oauthService = getOauthService();
  const auditLog = getAuditLogService();
  const locale = negotiateLocale(ctx.request.headers['accept-language'] as string | undefined);

  if (!ctx.query.code) {
    await auditLog.log({ action: 'missing_code', ip: getClientIp(ctx) });
    return ctx.send(oauthService.renderSignUpError(t(locale, 'user.missing_code'), locale));
  }

  const { oidcState, codeVerifier, oidcNonce } = readAndClearPkceCookies(ctx);

  if (!ctx.query.state || ctx.query.state !== oidcState) {
    await auditLog.log({ action: 'state_mismatch', ip: getClientIp(ctx) });
    return ctx.send(oauthService.renderSignUpError(t(locale, 'user.invalid_state'), locale));
  }

  let userInfo: OidcUserInfo | undefined;
  try {
    const currentUrl = new URL(ctx.request.href);
    const tokens = await client.authorizationCodeGrant(oidcConfig, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedState: oidcState,
      expectedNonce: oidcNonce,
      idTokenExpected: true,
    });

    const claims = tokens.claims();
    const sub = claims?.sub;
    const idToken = tokens.id_token;

    const userInfoData = await client.fetchUserInfo(
      oidcConfig,
      tokens.access_token,
      sub ?? client.skipSubjectCheck,
    );

    const secureFlag = shouldMarkSecure(strapi, ctx);

    if (idToken) {
      ctx.cookies.set(COOKIE_NAMES.idToken, idToken, {
        httpOnly: true,
        path: '/',
        secure: true,
        sameSite: 'lax' as const,
      });
    }

    userInfo = userInfoData as unknown as OidcUserInfo;

    const { activateUser, jwtToken, userCreated, rolesUpdated, resolvedRoleNames } =
      await handleUserAuthentication(
        getAdminUserService(),
        oauthService,
        getRoleService(),
        getWhitelistService(),
        userInfo,
        config,
        ctx,
      );

    if (sub) {
      try {
        await strapi.db.query('admin::user').update({
          where: { id: activateUser.id },
          data: { oidc_sub: sub },
        });
      } catch (err: unknown) {
        strapi.log.error('[strapi-plugin-oidc] Failed to persist oidc_sub:', err);
      }
    }

    ctx.cookies.set(COOKIE_NAMES.userEmail, activateUser.email, {
      httpOnly: true,
      path: '/',
      secure: true,
      sameSite: 'lax' as const,
    });

    await logSuccessfulAuth(
      auditLog,
      ctx,
      activateUser,
      userCreated,
      rolesUpdated,
      resolvedRoleNames,
    );

    const nonce = randomUUID();
    ctx.set('Content-Security-Policy', `script-src 'nonce-${nonce}'`);
    ctx.send(oauthService.renderSignUpSuccess(jwtToken, activateUser, nonce, secureFlag, locale));
  } catch (e) {
    await handleCallbackError(e, userInfo, auditLog, oauthService, ctx);
  }
}
