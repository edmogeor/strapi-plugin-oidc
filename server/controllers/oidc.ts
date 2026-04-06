import { randomUUID, randomBytes } from 'node:crypto';
import pkceChallenge from 'pkce-challenge';

function configValidation(): Record<string, string> {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, string>;
  const requiredKeys = [
    'OIDC_CLIENT_ID',
    'OIDC_CLIENT_SECRET',
    'OIDC_REDIRECT_URI',
    'OIDC_SCOPES',
    'OIDC_TOKEN_ENDPOINT',
    'OIDC_USER_INFO_ENDPOINT',
    'OIDC_GRANT_TYPE',
    'OIDC_FAMILY_NAME_FIELD',
    'OIDC_GIVEN_NAME_FIELD',
    'OIDC_AUTHORIZATION_ENDPOINT',
  ];

  if (requiredKeys.every((key) => config[key])) {
    return config;
  }
  throw new Error(`The following configuration keys are required: ${requiredKeys.join(', ')}`);
}

async function oidcSignIn(ctx: any) {
  let { state } = ctx.query as { state?: string };
  const { OIDC_CLIENT_ID, OIDC_REDIRECT_URI, OIDC_SCOPES, OIDC_AUTHORIZATION_ENDPOINT } =
    configValidation();

  // Generate code verifier and code challenge
  const { code_verifier: codeVerifier, code_challenge: codeChallenge } = await pkceChallenge();

  if (!state) {
    state = randomBytes(32).toString('base64url');
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // Store the code verifier and state in cookies
  // We use `secure: isProduction && ctx.request.secure` to align with Strapi's own session management.
  // This ensures cookies are secure in production, provided the reverse proxy is configured correctly
  // (sending X-Forwarded-Proto and proxy: true in Strapi config).
  ctx.cookies.set('oidc_code_verifier', codeVerifier, {
    httpOnly: true,
    maxAge: 600000,
    secure: isProduction && ctx.request.secure,
    sameSite: 'lax',
  }); // 10 min

  ctx.cookies.set('oidc_state', state, {
    httpOnly: true,
    maxAge: 600000,
    secure: isProduction && ctx.request.secure,
    sameSite: 'lax',
  });

  const params = new URLSearchParams();
  params.append('response_type', 'code');
  params.append('client_id', OIDC_CLIENT_ID);
  params.append('redirect_uri', OIDC_REDIRECT_URI);
  params.append('scope', OIDC_SCOPES);
  params.append('code_challenge', codeChallenge);
  params.append('code_challenge_method', 'S256');
  params.append('state', state);

  const authorizationUrl = `${OIDC_AUTHORIZATION_ENDPOINT}?${params.toString()}`;
  ctx.set('Location', authorizationUrl);
  return ctx.send({}, 302);
}

async function exchangeTokenAndFetchUserInfo(
  config: Record<string, string>,
  params: URLSearchParams,
) {
  const response = await fetch(config.OIDC_TOKEN_ENDPOINT, {
    method: 'POST',
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Failed to exchange token: ${response.status} ${response.statusText} - ${errText}`,
    );
  }

  const tokenData = await response.json();

  let userInfoEndpointHeaders: HeadersInit = {};
  let userInfoEndpointParameters = `?access_token=${tokenData.access_token}`;

  if (config.OIDC_USER_INFO_ENDPOINT_WITH_AUTH_HEADER) {
    userInfoEndpointHeaders = {
      Authorization: `Bearer ${tokenData.access_token}`,
    };
    userInfoEndpointParameters = '';
  }

  const userInfoEndpoint = `${config.OIDC_USER_INFO_ENDPOINT}${userInfoEndpointParameters}`;
  const userResponse = await fetch(userInfoEndpoint, {
    headers: userInfoEndpointHeaders,
  });

  if (!userResponse.ok) {
    const errText = await userResponse.text();
    throw new Error(
      `Failed to fetch user info: ${userResponse.status} ${userResponse.statusText} - ${errText}`,
    );
  }

  return await userResponse.json();
}

async function registerNewUser(
  userService: any,
  oauthService: any,
  roleService: any,
  email: string,
  userResponseData: any,
  whitelistUser: any,
  config: Record<string, string>,
  ctx: any,
) {
  let roles = [];
  if (whitelistUser?.roles?.length > 0) {
    roles = whitelistUser.roles;
  } else {
    const oidcRoles = await roleService.oidcRoles();
    roles = oidcRoles?.roles || [];
  }

  const defaultLocale = oauthService.localeFindByHeader(ctx.request.headers);
  const activateUser = await oauthService.createUser(
    email,
    userResponseData[config.OIDC_FAMILY_NAME_FIELD],
    userResponseData[config.OIDC_GIVEN_NAME_FIELD],
    defaultLocale,
    roles,
  );

  await oauthService.triggerWebHook(activateUser);

  return activateUser;
}

async function handleUserAuthentication(
  userService: any,
  oauthService: any,
  roleService: any,
  whitelistService: any,
  userResponseData: any,
  config: Record<string, string>,
  ctx: any,
) {
  const email = String(userResponseData.email).toLowerCase();

  // whitelist check must happen before checking if the user exists
  const whitelistUser = await whitelistService.checkWhitelistForEmail(email);

  const dbUser = await userService.findOneByEmail(email);

  let activateUser;

  if (dbUser) {
    activateUser = dbUser;
  } else {
    activateUser = await registerNewUser(
      userService,
      oauthService,
      roleService,
      email,
      userResponseData,
      whitelistUser,
      config,
      ctx,
    );
  }

  const jwtToken = await oauthService.generateToken(activateUser, ctx);
  oauthService.triggerSignInSuccess(activateUser);

  return { activateUser, jwtToken };
}

async function oidcSignInCallback(ctx: any) {
  const config = configValidation();
  const userService = strapi.service('admin::user');
  const oauthService = strapi.plugin('strapi-plugin-oidc').service('oauth');
  const roleService = strapi.plugin('strapi-plugin-oidc').service('role');
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');

  if (!ctx.query.code) {
    return ctx.send(oauthService.renderSignUpError('code Not Found'));
  }
  const oidcState = ctx.cookies.get('oidc_state');
  const codeVerifier = ctx.cookies.get('oidc_code_verifier');

  if (!ctx.query.state || ctx.query.state !== oidcState) {
    return ctx.send(oauthService.renderSignUpError('Invalid state'));
  }

  const params = new URLSearchParams();
  params.append('code', ctx.query.code);
  params.append('client_id', config.OIDC_CLIENT_ID);
  params.append('client_secret', config.OIDC_CLIENT_SECRET);
  params.append('redirect_uri', config.OIDC_REDIRECT_URI);
  params.append('grant_type', config.OIDC_GRANT_TYPE);
  params.append('code_verifier', codeVerifier);

  try {
    const userResponseData = await exchangeTokenAndFetchUserInfo(config, params);

    const { activateUser, jwtToken } = await handleUserAuthentication(
      userService,
      oauthService,
      roleService,
      whitelistService,
      userResponseData,
      config,
      ctx,
    );

    const nonce = randomUUID();
    const html = oauthService.renderSignUpSuccess(jwtToken, activateUser, nonce);

    ctx.set('Content-Security-Policy', `script-src 'nonce-${nonce}'`);
    ctx.send(html);
  } catch (e) {
    console.error('ERROR CAUGHT IN OIDC SIGNIN:', e);
    ctx.send(oauthService.renderSignUpError(e.message));
  }
}

async function logout(ctx: any) {
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, string>;
  const logoutUrl = config.OIDC_LOGOUT_URL;

  if (logoutUrl) {
    ctx.redirect(logoutUrl);
  } else {
    const adminPanelUrl = strapi.config.get('admin.url', '/admin');
    ctx.redirect(`${adminPanelUrl}/auth/login`);
  }
}

export default {
  oidcSignIn,
  oidcSignInCallback,
  logout,
};
