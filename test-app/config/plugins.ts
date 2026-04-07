import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'strapi-plugin-oidc': {
    enabled: true,
    resolve: './node_modules/strapi-plugin-oidc',
    config: {
      OIDC_CLIENT_ID: env('OIDC_CLIENT_ID', 'test-client-id'),
      OIDC_CLIENT_SECRET: env('OIDC_CLIENT_SECRET', 'test-client-secret'),
      OIDC_REDIRECT_URI: env(
        'OIDC_REDIRECT_URI',
        'http://localhost:1337/strapi-plugin-oidc/oidc/callback',
      ),
      OIDC_SCOPE: env('OIDC_SCOPE', 'openid profile email'),
      OIDC_AUTHORIZATION_ENDPOINT: env('OIDC_AUTHORIZATION_ENDPOINT', 'https://mock-oidc.com/auth'),
      OIDC_TOKEN_ENDPOINT: env('OIDC_TOKEN_ENDPOINT', 'https://mock-oidc.com/token'),
      OIDC_USERINFO_ENDPOINT: env('OIDC_USERINFO_ENDPOINT', 'https://mock-oidc.com/userinfo'),
      OIDC_GRANT_TYPE: env('OIDC_GRANT_TYPE', 'authorization_code'),
      OIDC_END_SESSION_ENDPOINT: env('OIDC_END_SESSION_ENDPOINT', ''),
      OIDC_POST_LOGOUT_REDIRECT_URI: env('OIDC_POST_LOGOUT_REDIRECT_URI', ''),
      OIDC_ISSUER: env('OIDC_ISSUER', ''),
      OIDC_JWKS_URI: env('OIDC_JWKS_URI', ''),
      OIDC_FAMILY_NAME_FIELD: env('OIDC_FAMILY_NAME_FIELD', 'family_name'),
      OIDC_GIVEN_NAME_FIELD: env('OIDC_GIVEN_NAME_FIELD', 'given_name'),
      OIDC_SSO_BUTTON_TEXT: env('OIDC_SSO_BUTTON_TEXT', 'Login via SSO'),
      OIDC_ENFORCE: env('OIDC_ENFORCE', null),
      REMEMBER_ME: env.bool('REMEMBER_ME', false),
    },
  },
});

export default config;
