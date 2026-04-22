import { randomUUID } from 'node:crypto';
import { shouldMarkSecure } from '../../utils/cookies';
import { errorMessages } from '../../error-strings';
import { userFacingMessages } from '../../audit-error-strings';
import { negotiateLocale } from '../../i18n';
import { OidcError } from '../../oidc-errors';
import {
  getOauthService,
  getRoleService,
  getWhitelistService,
  getAuditLogService,
  getAdminUserService,
} from '../../utils/services';
import { getClientIp } from '../../utils/ip';
import { configValidation, verifyIdToken } from './shared';
import { handleUserAuthentication } from './userAuth';
import { handleCallbackError } from './errors';
import type {
  StrapiContext,
  OidcUserInfo,
  AuditAction,
  AuditLogService,
  PluginConfig,
  StrapiAdminUser,
} from '../../types';

async function exchangeTokenAndFetchUserInfo(
  config: PluginConfig,
  params: URLSearchParams,
  expectedNonce: string,
): Promise<{ userInfo: OidcUserInfo; accessToken: string }> {
  const response = await fetch(config.OIDC_TOKEN_ENDPOINT, {
    method: 'POST',
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    throw new OidcError('token_exchange_failed', errorMessages.TOKEN_EXCHANGE_FAILED);
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    id_token?: string;
  };

  if (tokenData.id_token) {
    // null when OIDC_JWKS_URI is unset; nonce check still validates replay either way.
    const verifiedPayload = await verifyIdToken(tokenData.id_token, config);
    try {
      const idTokenPayload =
        verifiedPayload ??
        (JSON.parse(
          Buffer.from(tokenData.id_token.split('.')[1], 'base64url').toString('utf8'),
        ) as { nonce?: string });
      if (idTokenPayload.nonce !== expectedNonce) {
        throw new OidcError('nonce_mismatch', errorMessages.NONCE_MISMATCH);
      }
    } catch (e) {
      if (e instanceof OidcError) throw e;
      throw new OidcError('id_token_parse_failed', errorMessages.ID_TOKEN_PARSE_FAILED, e);
    }
  }

  // Use Authorization header (RFC 6750). URL query params are deprecated due to log leakage.
  const userResponse = await fetch(config.OIDC_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userResponse.ok) {
    throw new OidcError('userinfo_fetch_failed', errorMessages.USERINFO_FETCH_FAILED);
  }

  const userInfo = (await userResponse.json()) as OidcUserInfo;
  return { userInfo, accessToken: tokenData.access_token };
}

function readAndClearPkceCookies(ctx: StrapiContext): {
  oidcState: string | undefined;
  codeVerifier: string | undefined;
  oidcNonce: string | undefined;
} {
  const oidcState = ctx.cookies.get('oidc_state');
  const codeVerifier = ctx.cookies.get('oidc_code_verifier');
  const oidcNonce = ctx.cookies.get('oidc_nonce');
  ctx.cookies.set('oidc_state', null);
  ctx.cookies.set('oidc_code_verifier', null);
  ctx.cookies.set('oidc_nonce', null);
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
        action: 'user_created' as AuditAction,
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
  const oauthService = getOauthService();
  const auditLog = getAuditLogService();
  const locale = negotiateLocale(ctx.request.headers['accept-language'] as string | undefined);

  if (!ctx.query.code) {
    await auditLog.log({ action: 'missing_code', ip: getClientIp(ctx) });
    return ctx.send(
      oauthService.renderSignUpError(userFacingMessages(locale).missing_code, locale),
    );
  }

  const { oidcState, codeVerifier, oidcNonce } = readAndClearPkceCookies(ctx);

  if (!ctx.query.state || ctx.query.state !== oidcState) {
    await auditLog.log({ action: 'state_mismatch', ip: getClientIp(ctx) });
    return ctx.send(
      oauthService.renderSignUpError(userFacingMessages(locale).invalid_state, locale),
    );
  }

  const params = new URLSearchParams({
    code: ctx.query.code as string,
    client_id: config.OIDC_CLIENT_ID,
    client_secret: config.OIDC_CLIENT_SECRET,
    redirect_uri: config.OIDC_REDIRECT_URI,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier ?? '',
  });

  let userInfo: OidcUserInfo | undefined;
  try {
    const exchangeResult = await exchangeTokenAndFetchUserInfo(config, params, oidcNonce ?? '');
    userInfo = exchangeResult.userInfo;

    const secureFlag = shouldMarkSecure(strapi, ctx);
    ctx.cookies.set('oidc_access_token', exchangeResult.accessToken, {
      httpOnly: true,
      maxAge: 300000,
      secure: secureFlag,
      sameSite: 'lax' as const,
    });

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

    ctx.cookies.set('oidc_user_email', activateUser.email, {
      httpOnly: true,
      path: '/',
      secure: secureFlag,
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
    ctx.send(oauthService.renderSignUpSuccess(jwtToken, activateUser, nonce, locale));
  } catch (e) {
    await handleCallbackError(e, userInfo, auditLog, oauthService, ctx);
  }
}
