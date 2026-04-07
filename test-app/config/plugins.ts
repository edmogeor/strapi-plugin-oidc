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
      OIDC_SCOPES: env('OIDC_SCOPES', 'openid profile email'),
      OIDC_AUTHORIZATION_ENDPOINT: env('OIDC_AUTHORIZATION_ENDPOINT', 'https://mock-oidc.com/auth'),
      OIDC_TOKEN_ENDPOINT: env('OIDC_TOKEN_ENDPOINT', 'https://mock-oidc.com/token'),
      OIDC_USER_INFO_ENDPOINT: env('OIDC_USER_INFO_ENDPOINT', 'https://mock-oidc.com/userinfo'),
      OIDC_USER_INFO_ENDPOINT_WITH_AUTH_HEADER: env.bool(
        'OIDC_USER_INFO_ENDPOINT_WITH_AUTH_HEADER',
        false,
      ),
      OIDC_GRANT_TYPE: env('OIDC_GRANT_TYPE', 'authorization_code'),
      OIDC_LOGOUT_URL: env('OIDC_LOGOUT_URL', ''),
      OIDC_FAMILY_NAME_FIELD: env('OIDC_FAMILY_NAME_FIELD', 'family_name'),
      OIDC_GIVEN_NAME_FIELD: env('OIDC_GIVEN_NAME_FIELD', 'given_name'),
      OIDC_ENFORCE: env('OIDC_ENFORCE', null),
    },
  },
});

export default config;
