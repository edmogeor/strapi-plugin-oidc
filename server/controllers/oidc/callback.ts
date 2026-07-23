import { randomUUID } from 'node:crypto';
import * as client from 'openid-client';
import { getOidcConfig } from '../../utils/oidc-client';
import {
  shouldMarkSecure,
  COOKIE_NAMES,
  readCookie,
  reconcileCookieName,
} from '../../utils/cookies';
import { oidcUserInfoSchema, type OidcUserInfo } from '../../../shared/config';
import { OIDC_COOKIE_PATH } from '../../../shared/constants';
import { getLocaleFromContext, t } from '../../i18n';
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
import { handleCallbackError, sendErrorResponse } from './errors';
import type { StrapiContext, AuditLogService, StrapiAdminUser, OAuthService } from '../../types';

type TokenSet = Awaited<ReturnType<typeof client.authorizationCodeGrant>>;

function readAndClearPkceCookies(ctx: StrapiContext): {
  oidcState: string | undefined;
  codeVerifier: string | undefined;
  oidcNonce: string | undefined;
} {
  const oidcState = readCookie(ctx, COOKIE_NAMES.state);
  const codeVerifier = readCookie(ctx, COOKIE_NAMES.codeVerifier);
  const oidcNonce = readCookie(ctx, COOKIE_NAMES.nonce);
  const expired = { maxAge: 0, expires: new Date(0) };
  ctx.cookies.set(COOKIE_NAMES.state, null, expired);
  ctx.cookies.set(COOKIE_NAMES.codeVerifier, null, expired);
  ctx.cookies.set(COOKIE_NAMES.nonce, null, expired);
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
      ip: getClientIp(strapi, ctx),
      detailsKey: rolesUpdated ? 'roles_updated' : undefined,
      detailsParams: rolesUpdated ? { roles } : undefined,
    }),
  ];
  if (userCreated) {
    entries.push(
      auditLog.log({
        action: 'user_created',
        email: user.email,
        ip: getClientIp(strapi, ctx),
        detailsKey: 'user_created',
        detailsParams: { roles },
      }),
    );
  }
  await Promise.all(entries);
}

function validateCallbackQuery(
  ctx: StrapiContext,
  oauthService: OAuthService,
  auditLog: AuditLogService,
  locale: string,
): boolean {
  if (!ctx.query.code) {
    sendErrorResponse(ctx, oauthService, t(locale, 'user.missing_code'), locale);
    void auditLog.log({ action: 'missing_code', ip: getClientIp(strapi, ctx) });
    return false;
  }
  return true;
}

async function exchangeCodeForTokens(
  oidcConfig: client.Configuration,
  ctx: StrapiContext,
  codeVerifier: string | undefined,
  oidcState: string | undefined,
  oidcNonce: string | undefined,
): Promise<TokenSet> {
  const currentUrl = new URL(ctx.request.href);
  return client.authorizationCodeGrant(oidcConfig, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: oidcState,
    expectedNonce: oidcNonce,
    idTokenExpected: true,
  });
}

async function fetchAndValidateUserInfo(
  oidcConfig: client.Configuration,
  tokens: TokenSet,
): Promise<{ userInfo: OidcUserInfo; sub: string; sid: string | undefined }> {
  const claims = tokens.claims();
  const sub = claims?.sub;
  if (!sub || typeof sub !== 'string') {
    throw new Error('ID token missing required "sub" claim');
  }
  const sid = typeof claims?.sid === 'string' ? claims.sid : undefined;
  const userInfoData = await client.fetchUserInfo(oidcConfig, tokens.access_token, sub);
  const userInfo = oidcUserInfoSchema.parse(userInfoData);
  return { userInfo, sub, sid };
}

async function persistOidcIdentifiers(
  strapi: StrapiContext['strapi'],
  user: StrapiAdminUser,
  sub: string,
  sid: string | undefined,
): Promise<void> {
  try {
    await strapi.db.connection.raw('UPDATE admin_users SET oidc_sub = ? WHERE id = ?', [
      sub,
      user.id,
    ]);
    if (sid) {
      await strapi.db.connection.raw('UPDATE admin_users SET oidc_sid = ? WHERE id = ?', [
        sid,
        user.id,
      ]);
    }
  } catch (err: unknown) {
    strapi.log.error('[strapi-plugin-oidc] Failed to persist oidc_sub/oidc_sid:', err);
  }
}

function setOidcSessionCookies(
  ctx: StrapiContext,
  idToken: string | undefined,
  userEmail: string,
  secure: boolean,
): void {
  if (idToken) {
    ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.idToken, secure), idToken, {
      httpOnly: true,
      path: OIDC_COOKIE_PATH,
      secure,
      sameSite: 'lax' as const,
    });
  }

  ctx.cookies.set(reconcileCookieName(COOKIE_NAMES.userEmail, secure), userEmail, {
    httpOnly: true,
    path: OIDC_COOKIE_PATH,
    secure,
    sameSite: 'lax' as const,
  });
}

function renderAuthSuccess(
  ctx: StrapiContext,
  oauthService: OAuthService,
  jwtToken: string,
  user: StrapiAdminUser,
  secure: boolean,
  locale: string,
): void {
  const nonce = randomUUID();
  ctx.state.oidcCsp = `script-src 'nonce-${nonce}'`;
  ctx.send(oauthService.renderSignUpSuccess(jwtToken, user, nonce, secure, locale));
}

export async function oidcSignInCallback(ctx: StrapiContext) {
  const config = configValidation();
  const oidcConfig = await getOidcConfig();
  const oauthService = getOauthService();
  const auditLog = getAuditLogService();
  const locale = getLocaleFromContext(ctx);

  if (!validateCallbackQuery(ctx, oauthService, auditLog, locale)) return;

  const { oidcState, codeVerifier, oidcNonce } = readAndClearPkceCookies(ctx);

  if (!ctx.query.state || ctx.query.state !== oidcState) {
    await auditLog.log({ action: 'state_mismatch', ip: getClientIp(strapi, ctx) });
    return sendErrorResponse(ctx, oauthService, t(locale, 'user.invalid_state'), locale);
  }

  let userInfo: OidcUserInfo | undefined;
  try {
    const tokens = await exchangeCodeForTokens(oidcConfig, ctx, codeVerifier, oidcState, oidcNonce);
    const idToken = tokens.id_token;
    const {
      userInfo: parsedUserInfo,
      sub,
      sid,
    } = await fetchAndValidateUserInfo(oidcConfig, tokens);
    userInfo = parsedUserInfo;

    const secure = shouldMarkSecure(strapi, ctx);
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

    await persistOidcIdentifiers(strapi, activateUser, sub, sid);
    setOidcSessionCookies(ctx, idToken, activateUser.email, secure);
    await logSuccessfulAuth(
      auditLog,
      ctx,
      activateUser,
      userCreated,
      rolesUpdated,
      resolvedRoleNames,
    );
    renderAuthSuccess(ctx, oauthService, jwtToken, activateUser, secure, locale);
  } catch (e) {
    await handleCallbackError(e, userInfo, auditLog, oauthService, ctx);
  }
}
