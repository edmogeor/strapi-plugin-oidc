import type { StrapiConfigLogger } from '../../types';

type ConfigMap = Record<string, unknown>;

export function createMockStrapi(initialOidcConfig: ConfigMap = {}): StrapiConfigLogger {
  const configStore = new Map<string, unknown>();
  configStore.set('plugin::strapi-plugin-oidc', initialOidcConfig);

  return {
    config: {
      get(key: string, defaultValue?: unknown): unknown {
        if (configStore.has(key)) {
          return configStore.get(key);
        }
        return defaultValue;
      },
      set(key: string, value: unknown): void {
        configStore.set(key, value);
      },
    },
    log: {
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
    },
  };
}
