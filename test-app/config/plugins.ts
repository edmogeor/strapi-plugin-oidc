import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Plugin => ({
  'strapi-plugin-oidc': {
    enabled: true,
    resolve: './node_modules/strapi-plugin-oidc',
  }
});

export default config;
