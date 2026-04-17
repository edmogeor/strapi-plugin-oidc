import { randomUUID, randomBytes } from 'node:crypto';
import pkceChallenge from 'pkce-challenge';
import { clearAuthCookies } from '../utils/cookies';
import { isValidEmail } from '../utils/email';
import { errorCodes, getErrorDetail, errorMessages } from '../error-strings';
import { userFacingMessages } from '../audit-error-strings';
import { OidcError, OIDC_ERROR_DISPATCH } from '../oidc-errors';
import {
  getOauthService,
  getRoleService,
  getWhitelistService,
  getAuditLogService,
  getAdminUserService,
} from '../utils/services';
import type {
  StrapiContext,
  OidcUserInfo,
  OAuthService,
  RoleService,
  WhitelistService,
  AdminUserService,
  StrapiAdminUser,
  AuditAction,
  AuditLogService,
  PluginConfig,
  GroupRoleMap,
} from '../types';

const REQUIRED_CONFIG_KEYS = [
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
  'OIDC_SCOPE',
  'OIDC_TOKEN_ENDPOINT',
  'OIDC_USERINFO_ENDPOINT',
  'OIDC_GRANT_TYPE',
  'OIDC_FAMILY_NAME_FIELD',
  'OIDC_GIVEN_NAME_FIELD',
  'OIDC_AUTHORIZATION_ENDPOINT',
] as const;

const LOGOUT_USERINFO_TIMEOUT_MS = 3000;

function configValidation(): PluginConfig {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as PluginConfig;

  const missing = REQUIRED_CONFIG_KEYS.filter((key) => !config[key]);
  if (missing.length === 0) {
    return config;
  }
  throw new Error(errorMessages.MISSING_CONFIG(missing.join(', ')));
}

async function oidcSignIn(ctx: StrapiContext) {
  const { OIDC_CLIENT_ID, OIDC_REDIRECT_URI, OIDC_SCOPE, OIDC_AUTHORIZATION_ENDPOINT } =
    configValidation();

  const { code_verifier: codeVerifier, code_challenge: codeChallenge } = await pkceChallenge();

  // Always generate state server-side — never accept caller-supplied state, as that
  // would defeat the anti-CSRF purpose of the parameter.
  const state = randomBytes(32).toString('base64url');
  // Nonce prevents ID token replay attacks (OIDC Core §3.1.2.1).
  const nonce = randomBytes(32).toString('base64url');

  // Cookie options aligned with Strapi's own session management.
  // Secure in production, provided the reverse proxy is configured correctly
  // (sending X-Forwarded-Proto and proxy: true in Strapi config).
  const isProduction = strapi.config.get('environment') === 'production';
  const cookieOptions = {
    httpOnly: true,
    maxAge: 600000, // 10 minutes
    secure: isProduction && ctx.request.secure,
    sameSite: 'lax' as const,
  };

  ctx.cookies.set('oidc_code_verifier', codeVerifier, cookieOptions);
  ctx.cookies.set('oidc_state', state, cookieOptions);
  ctx.cookies.set('oidc_nonce', nonce, cookieOptions);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: OIDC_CLIENT_ID,
    redirect_uri: OIDC_REDIRECT_URI,
    scope: OIDC_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  const authorizationUrl = `${OIDC_AUTHORIZATION_ENDPOINT}?${params.toString()}`;
  ctx.set('Location', authorizationUrl);
  return ctx.send({}, 302);
}

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

  // Validate the nonce in the ID token if the provider returned one.
  // The ID token is a JWT; the payload is the second base64url segment.
  if (tokenData.id_token) {
    try {
      const payloadB64 = tokenData.id_token.split('.')[1];
      const idTokenPayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
        nonce?: string;
      };
      if (idTokenPayload.nonce !== expectedNonce) {
        throw new OidcError('nonce_mismatch', errorMessages.NONCE_MISMATCH);
      }
    } catch (e) {
      if (e instanceof OidcError && e.kind === 'nonce_mismatch') throw e;
      throw new OidcError('id_token_parse_failed', errorMessages.ID_TOKEN_PARSE_FAILED, e);
    }
  }

  // Always use the Authorization header (RFC 6750 §2.1). Sending the token as a
  // URL query parameter (§2.3) is deprecated because it leaks into server/proxy logs.
  const userResponse = await fetch(config.OIDC_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userResponse.ok) {
    throw new OidcError('userinfo_fetch_failed', errorMessages.USERINFO_FETCH_FAILED);
  }

  const userInfo = (await userResponse.json()) as OidcUserInfo;
  return { userInfo, accessToken: tokenData.access_token };
}

function collectGroupMapRoleNames(userInfo: OidcUserInfo, config: PluginConfig): string[] {
  const rawGroups = userInfo[config.OIDC_GROUP_FIELD];
  if (!Array.isArray(rawGroups) || rawGroups.length === 0) return [];
  const groups = rawGroups.filter((g): g is string => typeof g === 'string');

  const raw = config.OIDC_GROUP_ROLE_MAP;
  let groupRoleMap: GroupRoleMap;
  try {
    groupRoleMap =
      typeof raw === 'string'
        ? (JSON.parse(raw) as GroupRoleMap)
        : (raw as unknown as GroupRoleMap);
  } catch {
    return [];
  }

  const roleNameSet = new Set<string>();
  for (const group of groups) {
    const roleNames = groupRoleMap[group];
    if (!roleNames) continue;
    for (const name of roleNames) {
      roleNameSet.add(name);
    }
  }
  return [...roleNameSet];
}

async function registerNewUser(
  oauthService: OAuthService,
  email: string,
  userResponseData: OidcUserInfo,
  config: PluginConfig,
  ctx: StrapiContext,
  roles: string[],
): Promise<StrapiAdminUser> {
  const defaultLocale = oauthService.localeFindByHeader(
    ctx.request.headers as Record<string, string>,
  );
  const activateUser = await oauthService.createUser(
    email,
    userResponseData[config.OIDC_FAMILY_NAME_FIELD] as string,
    userResponseData[config.OIDC_GIVEN_NAME_FIELD] as string,
    defaultLocale,
    roles,
  );
  await oauthService.triggerWebHook(activateUser);
  return activateUser;
}

function rolesChanged(current: Set<string>, next: Set<string>): boolean {
  if (current.size !== next.size) return true;
  for (const id of next) {
    if (!current.has(id)) return true;
  }
  return false;
}

async function updateUserRoles(
  user: StrapiAdminUser,
  currentRoleIds: Set<string>,
  newRoleIds: string[],
): Promise<void> {
  try {
    strapi.log.info(
      `[OIDC] Roles updated for user ${user.id}: [${[...currentRoleIds].join(',')}] -> [${newRoleIds.join(',')}]`,
    );
    await strapi.db.query('admin::user').update({
      where: { id: user.id },
      data: { roles: newRoleIds },
    });
  } catch (updateErr) {
    strapi.log.error({
      code: errorCodes.ROLE_UPDATE_FAILED,
      userId: user.id,
      detail: getErrorDetail('role_update_failed', {
        userId: user.id,
        error: (updateErr as Error).message,
      }),
    });
    throw updateErr;
  }
}

async function handleUserAuthentication(
  userService: AdminUserService,
  oauthService: OAuthService,
  roleService: RoleService,
  whitelistService: WhitelistService,
  userResponseData: OidcUserInfo,
  config: PluginConfig,
  ctx: StrapiContext,
): Promise<{
  activateUser: StrapiAdminUser;
  jwtToken: string;
  userCreated: boolean;
  rolesUpdated: boolean;
  resolvedRoleNames: string[];
}> {
  const rawEmail = String(userResponseData.email ?? '');
  const email = rawEmail.toLowerCase();
  if (!email || !isValidEmail(email)) {
    throw new OidcError('invalid_email', errorMessages.INVALID_EMAIL);
  }

  await whitelistService.checkWhitelistForEmail(email);

  const candidateNames = collectGroupMapRoleNames(userResponseData, config);
  let roles: string[] = [];
  let fromGroupMapping = false;
  let resolvedRoleNames: string[] = [];

  if (candidateNames.length > 0) {
    const matchedRoles = await strapi.db.query('admin::role').findMany({
      where: { name: { $in: candidateNames } },
      select: ['id', 'name'],
    });
    const nameToId = new Map(matchedRoles.map((r) => [r.name, String(r.id)]));
    for (const name of candidateNames) {
      const id = nameToId.get(name);
      if (id) roles.push(id);
    }
    resolvedRoleNames = matchedRoles.map((r) => r.name);
    fromGroupMapping = true;
  } else {
    const oidcRolesResult = await roleService.oidcRoles();
    roles = oidcRolesResult?.roles || [];
    if (roles.length > 0) {
      const oidcRoleRecords = await strapi.db.query('admin::role').findMany({
        where: { id: { $in: roles.map(Number) } },
        select: ['id', 'name'],
      });
      resolvedRoleNames = oidcRoleRecords.map((r) => r.name);
    }
  }

  let userCreated = false;
  let rolesUpdated = false;
  let user = await userService.findOneByEmail(email, ['roles']);

  if (!user) {
    try {
      user = await registerNewUser(oauthService, email, userResponseData, config, ctx, roles);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new OidcError('user_creation_failed', msg, e);
    }
    userCreated = true;
    rolesUpdated = true;
  } else if (fromGroupMapping && roles.length > 0) {
    const currentRoleIds = new Set(user.roles.map((r) => String(r.id)));
    if (rolesChanged(currentRoleIds, new Set(roles))) {
      await updateUserRoles(user, currentRoleIds, roles);
      rolesUpdated = true;
    }
  }

  const jwtToken = await oauthService.generateToken(user, ctx);
  oauthService.triggerSignInSuccess(user);

  return { activateUser: user, jwtToken, userCreated, rolesUpdated, resolvedRoleNames };
}

type OidcErrorInfo = {
  action: AuditAction;
  code: (typeof errorCodes)[keyof typeof errorCodes];
  key?: string;
  params?: Record<string, string | number>;
};

function classifyOidcError(e: unknown, userInfo?: OidcUserInfo): OidcErrorInfo {
  const kind = e instanceof OidcError ? e.kind : 'unknown';
  const dispatch = OIDC_ERROR_DISPATCH[kind];
  const msg = e instanceof Error ? e.message : String(e);

  let params: Record<string, string | number> | undefined;
  if (kind === 'id_token_parse_failed' || kind === 'unknown') {
    params = { error: msg };
  } else if (kind === 'user_creation_failed' && userInfo?.email) {
    params = { email: userInfo.email, error: msg };
  }

  return {
    action: dispatch.action,
    code: dispatch.code,
    key: dispatch.key,
    params,
  };
}

async function oidcSignInCallback(ctx: StrapiContext) {
  const config = configValidation();
  const userService = getAdminUserService();
  const oauthService = getOauthService();
  const roleService = getRoleService();
  const whitelistService = getWhitelistService();
  const auditLog = getAuditLogService();

  if (!ctx.query.code) {
    await auditLog.log({ action: 'missing_code', ip: ctx.ip });
    return ctx.send(oauthService.renderSignUpError(userFacingMessages.missing_code));
  }
  const oidcState = ctx.cookies.get('oidc_state');
  const codeVerifier = ctx.cookies.get('oidc_code_verifier');
  const oidcNonce = ctx.cookies.get('oidc_nonce');

  // Clear one-time-use PKCE/state/nonce cookies immediately — they are no longer needed
  // after this point and should not linger in the browser.
  ctx.cookies.set('oidc_state', null);
  ctx.cookies.set('oidc_code_verifier', null);
  ctx.cookies.set('oidc_nonce', null);

  if (!ctx.query.state || ctx.query.state !== oidcState) {
    await auditLog.log({ action: 'state_mismatch', ip: ctx.ip });
    return ctx.send(oauthService.renderSignUpError(userFacingMessages.invalid_state));
  }

  const params = new URLSearchParams({
    code: ctx.query.code as string,
    client_id: config.OIDC_CLIENT_ID,
    client_secret: config.OIDC_CLIENT_SECRET,
    redirect_uri: config.OIDC_REDIRECT_URI,
    grant_type: config.OIDC_GRANT_TYPE,
    code_verifier: codeVerifier ?? '',
  });

  let userInfo: OidcUserInfo | undefined;
  try {
    const exchangeResult = await exchangeTokenAndFetchUserInfo(config, params, oidcNonce ?? '');
    userInfo = exchangeResult.userInfo;
    const accessToken = exchangeResult.accessToken;

    const isProduction = strapi.config.get('environment') === 'production';
    ctx.cookies.set('oidc_access_token', accessToken, {
      httpOnly: true,
      maxAge: 300000, // 5 minutes — matches typical provider access token lifetime
      secure: isProduction && ctx.request.secure,
      sameSite: 'lax' as const,
    });

    const { activateUser, jwtToken, userCreated, rolesUpdated, resolvedRoleNames } =
      await handleUserAuthentication(
        userService,
        oauthService,
        roleService,
        whitelistService,
        userInfo,
        config,
        ctx,
      );

    // Store identity in httpOnly session cookies so logout can attribute audit log entries.
    const identityCookieOptions = {
      httpOnly: true,
      path: '/',
      secure: isProduction && ctx.request.secure,
      sameSite: 'lax' as const,
    };
    ctx.cookies.set('oidc_user_email', activateUser.email, identityCookieOptions);

    if (userCreated) {
      await auditLog.log({
        action: 'user_created',
        email: activateUser.email,
        ip: ctx.ip,
        detailsKey: 'user_created',
        detailsParams: { roles: resolvedRoleNames.join(', ') },
      });
    }
    await auditLog.log({
      action: 'login_success',
      email: activateUser.email,
      ip: ctx.ip,
      detailsKey: rolesUpdated ? 'roles_updated' : undefined,
      detailsParams: rolesUpdated ? { roles: resolvedRoleNames.join(', ') } : undefined,
    });

    const nonce = randomUUID();
    const html = oauthService.renderSignUpSuccess(jwtToken, activateUser, nonce);

    ctx.set('Content-Security-Policy', `script-src 'nonce-${nonce}'`);
    ctx.send(html);
  } catch (e) {
    const errorInfo = classifyOidcError(e, userInfo);

    await auditLog.log({
      action: errorInfo.action,
      email: userInfo?.email,
      ip: ctx.ip,
      detailsKey: errorInfo.action,
      detailsParams:
        errorInfo.action === 'login_failure'
          ? { message: e instanceof Error ? e.message : String(e) }
          : undefined,
    });
    strapi.log.error({
      code: errorInfo.code,
      phase: 'oidc_callback',
      message: e instanceof Error ? e.message : 'Unknown sign-in error',
      detail: errorInfo.key ? getErrorDetail(errorInfo.key, errorInfo.params) : undefined,
      email: userInfo?.email,
    });
    ctx.send(oauthService.renderSignUpError(userFacingMessages.signInError));
  }
}

async function logout(ctx: StrapiContext) {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as PluginConfig;
  const auditLog = getAuditLogService();
  const logoutUrl = config.OIDC_END_SESSION_ENDPOINT;
  const adminPanelUrl = strapi.config.get('admin.url', '/admin') as string;

  // Read before clearing — cookies are gone after clearAuthCookies.
  const isOidcSession = !!ctx.cookies.get('oidc_authenticated');
  const accessToken = ctx.cookies.get('oidc_access_token');
  const userEmail = ctx.cookies.get('oidc_user_email') ?? undefined;

  clearAuthCookies(strapi, ctx);

  if (logoutUrl && isOidcSession && accessToken) {
    // Check if the provider session is still active before redirecting to end-session.
    // If the access token is expired, skip Authentik and go straight to Strapi login
    // to avoid the bare "Logout successful" page with no redirect.
    try {
      const response = await fetch(config.OIDC_USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(LOGOUT_USERINFO_TIMEOUT_MS),
      });
      if (response.ok) {
        if (userEmail)
          auditLog.log({ action: 'logout', email: userEmail, ip: ctx.ip }).catch(() => {});
        return ctx.redirect(logoutUrl);
      }
      // Non-ok means the session expired at the provider
      if (userEmail)
        await auditLog.log({ action: 'session_expired', email: userEmail, ip: ctx.ip });
      return ctx.redirect(`${adminPanelUrl}/auth/login`);
    } catch {
      // Network error — treat as session expired
      if (userEmail)
        await auditLog.log({ action: 'session_expired', email: userEmail, ip: ctx.ip });
      return ctx.redirect(`${adminPanelUrl}/auth/login`);
    }
  }

  if (isOidcSession && userEmail) {
    await auditLog.log({ action: 'logout', email: userEmail, ip: ctx.ip });
  }

  if (logoutUrl && isOidcSession) {
    return ctx.redirect(logoutUrl);
  }

  ctx.redirect(`${adminPanelUrl}/auth/login`);
}

export default {
  oidcSignIn,
  oidcSignInCallback,
  logout,
};
