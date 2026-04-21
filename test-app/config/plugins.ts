import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'strapi-plugin-oidc': {
    enabled: true,
    resolve: './node_modules/strapi-plugin-oidc',
    config: {
      OIDC_DISCOVERY_URL: env('OIDC_DISCOVERY_URL', ''),
      OIDC_CLIENT_ID: env('OIDC_CLIENT_ID', 'test-client-id'),
      OIDC_CLIENT_SECRET: env('OIDC_CLIENT_SECRET', 'test-client-secret'),
      OIDC_REDIRECT_URI: env(
        'OIDC_REDIRECT_URI',
        'http://localhost:1337/strapi-plugin-oidc/oidc/callback',
      ),
      OIDC_SCOPE: env('OIDC_SCOPE', 'openid profile email'),
      OIDC_FAMILY_NAME_FIELD: env('OIDC_FAMILY_NAME_FIELD', 'family_name'),
      OIDC_GIVEN_NAME_FIELD: env('OIDC_GIVEN_NAME_FIELD', 'given_name'),
      OIDC_ENFORCE: env('OIDC_ENFORCE', null),
      OIDC_GROUP_FIELD: env('OIDC_GROUP_FIELD', 'groups'),
      OIDC_GROUP_ROLE_MAP: env('OIDC_GROUP_ROLE_MAP', '{}'),
      OIDC_TRUSTED_IP_HEADER: env('OIDC_TRUSTED_IP_HEADER', ''),
    },
  },
});

export default config;
