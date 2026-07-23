import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  proxy: {
    koa: env.bool('PROXY', env('NODE_ENV') === 'production'),
  },
  app: {
    keys: env.array('APP_KEYS'),
  },
  url: env('PUBLIC_URL', 'http://127.0.0.1:1337'),
});

export default config;
