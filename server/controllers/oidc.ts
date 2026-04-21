import { randomUUID, randomBytes } from 'node:crypto';
import pkceChallenge from 'pkce-challenge';
import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import type { JWTPayload } from 'jose';
import { clearAuthCookies, shouldMarkSecure } from '../utils/cookies';
import { isValidEmail } from '../utils/email';
import { errorCodes, getErrorDetail, errorMessages } from '../error-strings';
import { userFacingMessages } from '../audit-error-strings';
import { negotiateLocale } from '../i18n';
import { OidcError, OIDC_ERROR_DISPATCH } from '../oidc-errors';
import {
  getOauthService,
  getRoleService,
  getWhitelistService,
  getAuditLogService,
  getAdminUserService,
} from '../utils/services';
import { getClientIp } from '../utils/ip';
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

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const REQUIRED_CONFIG_KEYS = [
  'OIDC_DISCOVERY_URL',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
  'OIDC_SCOPE',
  'OIDC_GRANT_TYPE',
  'OIDC_FAMILY_NAME_FIELD',
  'OIDC_GIVEN_NAME_FIELD',
  // Populated at bootstrap from OIDC_DISCOVERY_URL — checked here as a runtime safety net
  'OIDC_TOKEN_ENDPOINT',
  'OIDC_USERINFO_ENDPOINT',
  'OIDC_AUTHORIZATION_ENDPOINT',
] as const;

const LOGOUT_USERINFO_TIMEOUT_MS = 1500;

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
let jwksDisabledWarned = false;

function getJwks(uri: string) {
  let jwks = jwksCache.get(uri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(uri));
    jwksCache.set(uri, jwks);
  }
  return jwks;
}

async function verifyIdToken(idToken: string, config: PluginConfig): Promise<JWTPayload | null> {
  const jwksUri = config.OIDC_JWKS_URI;
  const issuer = config.OIDC_ISSUER;
  if (!jwksUri) {
    if (!jwksDisabledWarned) {
      jwksDisabledWarned = true;
      strapi.log.warn(
        "[OIDC] OIDC_JWKS_URI is not configured — ID token signature verification is disabled. Set OIDC_JWKS_URI and OIDC_ISSUER from your provider's discovery document.",
      );
    }
    return null;
  }

  try {
    const jwks = getJwks(jwksUri);
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: issuer || undefined,
      audience: config.OIDC_CLIENT_ID,
    });
    return payload;
  } catch (e) {
    if (
      e instanceof joseErrors.JWTClaimValidationFailed ||
      e instanceof joseErrors.JWSSignatureVerificationFailed ||
      e instanceof joseErrors.JWTExpired ||
      e instanceof joseErrors.JWTInvalid ||
      e instanceof joseErrors.JWSInvalid
    ) {
      const msg = toMessage(e);
      throw new OidcError('id_token_invalid', msg, e);
    }
    throw e;
  }
}

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

  // Generate state server-side to prevent CSRF attacks.
  const state = randomBytes(32).toString('base64url');
  // Generate nonce to prevent ID token replay attacks.
  const nonce = randomBytes(32).toString('base64url');

  const cookieOptions = {
    httpOnly: true,
    maxAge: 600000,
    secure: shouldMarkSecure(strapi, ctx),
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
  return [...next].some((id) => !current.has(id));
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

type ResolvedRoles = {
  roles: string[];
  fromGroupMapping: boolean;
  resolvedRoleNames: string[];
};

async function resolveRolesFromGroups(candidateNames: string[]): Promise<ResolvedRoles> {
  const matchedRoles = await strapi.db.query('admin::role').findMany({
    where: { name: { $in: candidateNames } },
    select: ['id', 'name'],
  });
  const nameToId = new Map(matchedRoles.map((r) => [r.name, String(r.id)]));
  const roles: string[] = [];
  for (const name of candidateNames) {
    const id = nameToId.get(name);
    if (id) roles.push(id);
  }
  return {
    roles,
    fromGroupMapping: true,
    resolvedRoleNames: matchedRoles.map((r) => r.name),
  };
}

async function resolveRolesFromDefaults(roleService: RoleService): Promise<ResolvedRoles> {
  const oidcRolesResult = await roleService.oidcRoles();
  const roles = oidcRolesResult?.roles || [];
  if (roles.length === 0) {
    return { roles, fromGroupMapping: false, resolvedRoleNames: [] };
  }
  const records = await strapi.db.query('admin::role').findMany({
    where: { id: { $in: roles.map(Number) } },
    select: ['id', 'name'],
  });
  return {
    roles,
    fromGroupMapping: false,
    resolvedRoleNames: records.map((r) => r.name),
  };
}

async function resolveRoles(
  userResponseData: OidcUserInfo,
  config: PluginConfig,
  roleService: RoleService,
): Promise<ResolvedRoles> {
  const candidateNames = collectGroupMapRoleNames(userResponseData, config);
  if (candidateNames.length > 0) {
    return resolveRolesFromGroups(candidateNames);
  }
  return resolveRolesFromDefaults(roleService);
}

async function ensureUser(
  userService: AdminUserService,
  oauthService: OAuthService,
  email: string,
  userResponseData: OidcUserInfo,
  config: PluginConfig,
  ctx: StrapiContext,
  resolved: ResolvedRoles,
): Promise<{ user: StrapiAdminUser; userCreated: boolean; rolesUpdated: boolean }> {
  const existing = await userService.findOneByEmail(email, ['roles']);
  if (!existing) {
    try {
      const user = await registerNewUser(
        oauthService,
        email,
        userResponseData,
        config,
        ctx,
        resolved.roles,
      );
      return { user, userCreated: true, rolesUpdated: true };
    } catch (e) {
      const msg = toMessage(e);
      throw new OidcError('user_creation_failed', msg, e);
    }
  }
  if (!resolved.fromGroupMapping || resolved.roles.length === 0) {
    return { user: existing, userCreated: false, rolesUpdated: false };
  }
  const currentRoleIds = new Set((existing.roles ?? []).map((r) => String(r.id)));
  if (!rolesChanged(currentRoleIds, new Set(resolved.roles))) {
    return { user: existing, userCreated: false, rolesUpdated: false };
  }
  await updateUserRoles(existing, currentRoleIds, resolved.roles);
  return { user: existing, userCreated: false, rolesUpdated: true };
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
  const email = String(userResponseData.email ?? '').toLowerCase();
  if (!email || !isValidEmail(email)) {
    throw new OidcError('invalid_email', errorMessages.INVALID_EMAIL);
  }

  // OIDC Core §5.7: email_verified SHOULD accompany email. Treat missing as unverified.
  if (config.OIDC_REQUIRE_EMAIL_VERIFIED !== false) {
    const emailVerified = userResponseData.email_verified;
    const isVerified = emailVerified === true || emailVerified === 'true';
    if (!isVerified) {
      throw new OidcError('email_not_verified', errorMessages.EMAIL_NOT_VERIFIED);
    }
  }

  await whitelistService.checkWhitelistForEmail(email);

  const resolved = await resolveRoles(userResponseData, config, roleService);
  const { user, userCreated, rolesUpdated } = await ensureUser(
    userService,
    oauthService,
    email,
    userResponseData,
    config,
    ctx,
    resolved,
  );

  const jwtToken = await oauthService.generateToken(user, ctx);
  oauthService.triggerSignInSuccess(user);

  return {
    activateUser: user,
    jwtToken,
    userCreated,
    rolesUpdated,
    resolvedRoleNames: resolved.resolvedRoleNames,
  };
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
  const msg = toMessage(e);

  let params: Record<string, string | number> | undefined;
  if (kind === 'id_token_parse_failed' || kind === 'id_token_invalid' || kind === 'unknown') {
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

async function handleCallbackError(
  e: unknown,
  userInfo: OidcUserInfo | undefined,
  auditLog: AuditLogService,
  oauthService: OAuthService,
  ctx: StrapiContext,
): Promise<void> {
  const errorInfo = classifyOidcError(e, userInfo);
  const message = toMessage(e);

  await auditLog.log({
    action: errorInfo.action,
    email: userInfo?.email,
    ip: getClientIp(ctx),
    detailsKey: errorInfo.action,
    detailsParams: errorInfo.action === 'login_failure' ? { message } : undefined,
  });
  strapi.log.error({
    code: errorInfo.code,
    phase: 'oidc_callback',
    message: e instanceof Error ? e.message : 'Unknown sign-in error',
    detail: errorInfo.key ? getErrorDetail(errorInfo.key, errorInfo.params) : undefined,
    email: userInfo?.email,
  });
  const locale = negotiateLocale(ctx.request.headers['accept-language'] as string | undefined);
  ctx.send(oauthService.renderSignUpError(userFacingMessages(locale).signInError, locale));
}

async function oidcSignInCallback(ctx: StrapiContext) {
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
    grant_type: config.OIDC_GRANT_TYPE,
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

async function logout(ctx: StrapiContext) {
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

export default {
  oidcSignIn,
  oidcSignInCallback,
  logout,
};
