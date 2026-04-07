import { randomUUID, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import pkceChallenge from 'pkce-challenge';
import { clearAuthCookies } from '../utils/cookies';
import type {
  StrapiContext,
  OidcUserInfo,
  WhitelistEntry,
  OAuthService,
  RoleService,
  WhitelistService,
  AdminUserService,
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

function configValidation(): Record<string, string> {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, string>;

  if (REQUIRED_CONFIG_KEYS.every((key) => config[key])) {
    return config;
  }
  throw new Error(
    `The following configuration keys are required: ${REQUIRED_CONFIG_KEYS.join(', ')}`,
  );
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

  const params = new URLSearchParams();
  params.append('response_type', 'code');
  params.append('client_id', OIDC_CLIENT_ID);
  params.append('redirect_uri', OIDC_REDIRECT_URI);
  params.append('scope', OIDC_SCOPE);
  params.append('code_challenge', codeChallenge);
  params.append('code_challenge_method', 'S256');
  params.append('state', state);
  params.append('nonce', nonce);

  const authorizationUrl = `${OIDC_AUTHORIZATION_ENDPOINT}?${params.toString()}`;
  ctx.set('Location', authorizationUrl);
  return ctx.send({}, 302);
}

async function exchangeTokenAndFetchUserInfo(
  config: Record<string, string>,
  params: URLSearchParams,
  expectedNonce: string,
): Promise<{ userInfo: OidcUserInfo; idToken: string | undefined }> {
  const response = await fetch(config.OIDC_TOKEN_ENDPOINT, {
    method: 'POST',
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    throw new Error('Token exchange failed');
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
        throw new Error('Nonce mismatch');
      }
    } catch (e) {
      if ((e as Error).message === 'Nonce mismatch') throw e;
      throw new Error('Failed to parse ID token');
    }
  }

  // Always use the Authorization header (RFC 6750 §2.1). Sending the token as a
  // URL query parameter (§2.3) is deprecated because it leaks into server/proxy logs.
  const userResponse = await fetch(config.OIDC_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userResponse.ok) {
    throw new Error('Failed to fetch user info');
  }

  const userInfo = (await userResponse.json()) as OidcUserInfo;
  return { userInfo, idToken: tokenData.id_token };
}

async function registerNewUser(
  userService: AdminUserService,
  oauthService: OAuthService,
  roleService: RoleService,
  email: string,
  userResponseData: OidcUserInfo,
  whitelistUser: WhitelistEntry | null,
  config: Record<string, string>,
  ctx: StrapiContext,
) {
  let roles: string[] = [];
  if (whitelistUser?.roles?.length > 0) {
    roles = whitelistUser.roles;
  } else {
    const oidcRoles = await roleService.oidcRoles();
    roles = oidcRoles?.roles || [];
  }

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

async function handleUserAuthentication(
  userService: AdminUserService,
  oauthService: OAuthService,
  roleService: RoleService,
  whitelistService: WhitelistService,
  userResponseData: OidcUserInfo,
  config: Record<string, string>,
  ctx: StrapiContext,
) {
  const email = String(userResponseData.email).toLowerCase();

  // whitelist check must happen before checking if the user exists
  const whitelistUser = await whitelistService.checkWhitelistForEmail(email);

  const activateUser =
    (await userService.findOneByEmail(email)) ??
    (await registerNewUser(
      userService,
      oauthService,
      roleService,
      email,
      userResponseData,
      whitelistUser,
      config,
      ctx,
    ));

  const jwtToken = await oauthService.generateToken(activateUser, ctx);
  oauthService.triggerSignInSuccess(activateUser);

  return { activateUser, jwtToken };
}

async function oidcSignInCallback(ctx: StrapiContext) {
  const config = configValidation();
  const userService = strapi.service('admin::user') as AdminUserService;
  const oauthService = strapi.plugin('strapi-plugin-oidc').service('oauth') as OAuthService;
  const roleService = strapi.plugin('strapi-plugin-oidc').service('role') as RoleService;
  const whitelistService = strapi
    .plugin('strapi-plugin-oidc')
    .service('whitelist') as WhitelistService;

  if (!ctx.query.code) {
    return ctx.send(oauthService.renderSignUpError('code Not Found'));
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
    return ctx.send(oauthService.renderSignUpError('Invalid state'));
  }

  const params = new URLSearchParams();
  params.append('code', ctx.query.code as string);
  params.append('client_id', config.OIDC_CLIENT_ID);
  params.append('client_secret', config.OIDC_CLIENT_SECRET);
  params.append('redirect_uri', config.OIDC_REDIRECT_URI);
  params.append('grant_type', config.OIDC_GRANT_TYPE);
  params.append('code_verifier', codeVerifier ?? '');

  try {
    const { userInfo: userResponseData, idToken } = await exchangeTokenAndFetchUserInfo(
      config,
      params,
      oidcNonce ?? '',
    );

    const { activateUser, jwtToken } = await handleUserAuthentication(
      userService,
      oauthService,
      roleService,
      whitelistService,
      userResponseData,
      config,
      ctx,
    );

    // Store the ID token so logout can use it as id_token_hint for RP-Initiated Logout
    // (OpenID Connect RP-Initiated Logout 1.0 §2). httpOnly prevents JS access.
    if (idToken) {
      const isProduction = strapi.config.get('environment') === 'production';
      ctx.cookies.set('oidc_id_token', idToken, {
        httpOnly: true,
        secure: isProduction && ctx.request.secure,
        path: '/',
        sameSite: 'lax',
      });
    }

    const nonce = randomUUID();
    const html = oauthService.renderSignUpSuccess(jwtToken, activateUser, nonce);

    ctx.set('Content-Security-Policy', `script-src 'nonce-${nonce}'`);
    ctx.send(html);
  } catch (e) {
    console.error('ERROR CAUGHT IN OIDC SIGNIN:', e);
    ctx.send(oauthService.renderSignUpError('Authentication failed. Please try again.'));
  }
}

async function logout(ctx: StrapiContext) {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, string>;
  const logoutUrl = config.OIDC_END_SESSION_ENDPOINT;

  // Read before clearing — cookies are gone after clearAuthCookies.
  const isOidcSession = !!ctx.cookies.get('oidc_authenticated');
  const idToken = ctx.cookies.get('oidc_id_token');

  // Clear all session cookies so the enforceOIDC middleware correctly redirects
  // to OIDC on the next request rather than passing through a stale session.
  clearAuthCookies(strapi, ctx);

  if (logoutUrl && isOidcSession) {
    // Build an RP-Initiated Logout URL (OpenID Connect RP-Initiated Logout 1.0 §2).
    // id_token_hint lets the provider identify the session to end.
    // post_logout_redirect_uri tells the provider where to send the user afterwards.
    const params = new URLSearchParams();
    if (idToken) params.set('id_token_hint', idToken);
    const postLogoutUri = config.OIDC_POST_LOGOUT_REDIRECT_URI;
    if (postLogoutUri) params.set('post_logout_redirect_uri', postLogoutUri);
    const fullLogoutUrl = params.size > 0 ? `${logoutUrl}?${params.toString()}` : logoutUrl;
    ctx.redirect(fullLogoutUrl);
  } else {
    const adminPanelUrl = strapi.config.get('admin.url', '/admin') as string;
    ctx.redirect(`${adminPanelUrl}/auth/login`);
  }
}

// Cached JWKS sets keyed by JWKS URI to avoid re-fetching on every request
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(uri: string) {
  if (!jwksCache.has(uri)) {
    jwksCache.set(uri, createRemoteJWKSet(new URL(uri)));
  }
  return jwksCache.get(uri)!;
}

async function backchannelLogout(ctx: StrapiContext) {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, string>;

  // Provider POSTs application/x-www-form-urlencoded with a logout_token field
  const logoutToken = (ctx.request.body as Record<string, string>)?.logout_token;
  if (!logoutToken) {
    ctx.status = 400;
    ctx.body = { error: 'Missing logout_token' };
    return;
  }

  if (!config.OIDC_JWKS_URI) {
    ctx.status = 501;
    ctx.body = { error: 'OIDC_JWKS_URI not configured' };
    return;
  }

  try {
    const JWKS = getJWKS(config.OIDC_JWKS_URI);

    const verifyOptions: Parameters<typeof jwtVerify>[2] = {};
    if (config.OIDC_ISSUER) verifyOptions.issuer = config.OIDC_ISSUER;
    if (config.OIDC_CLIENT_ID) verifyOptions.audience = config.OIDC_CLIENT_ID;

    const { payload } = await jwtVerify(logoutToken, JWKS, verifyOptions);

    // nonce MUST NOT be present (OIDC Back-Channel Logout 1.0 §2.6)
    if ('nonce' in payload) {
      ctx.status = 400;
      ctx.body = { error: 'logout_token must not contain nonce' };
      return;
    }

    // events claim must contain the backchannel-logout event marker
    const events = payload.events as Record<string, unknown> | undefined;
    if (!events?.['http://schemas.openid.net/event/backchannel-logout']) {
      ctx.status = 400;
      ctx.body = { error: 'logout_token missing backchannel-logout event' };
      return;
    }

    // sub or sid must be present
    const sid = (payload as Record<string, unknown>).sid as string | undefined;
    if (!payload.sub && !sid) {
      ctx.status = 400;
      ctx.body = { error: 'logout_token must contain sub or sid' };
      return;
    }

    // Attempt to find the Strapi user and revoke all their sessions.
    // sub is typically the provider's unique user identifier (e.g. email on some providers).
    // We attempt email lookup first; if the provider uses opaque UUIDs for sub this will
    // not match, but we still return 200 as required by the spec.
    if (payload.sub) {
      const userService = strapi.service('admin::user') as AdminUserService;
      const user = await userService.findOneByEmail(payload.sub);

      if (user) {
        const sessionManager = strapi.sessionManager;
        if (sessionManager) {
          await sessionManager('admin').invalidateRefreshToken(String(user.id));
        }
      }
    }

    // Spec requires 200 with empty body on success
    ctx.status = 200;
    ctx.body = '';
  } catch (e) {
    strapi.log.error('Backchannel logout failed:', e);
    ctx.status = 400;
    ctx.body = { error: 'Invalid logout_token' };
  }
}

export default {
  oidcSignIn,
  oidcSignInCallback,
  logout,
  backchannelLogout,
};
