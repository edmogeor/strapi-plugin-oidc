import { getTranslation } from './utils/getTranslation';
import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import Initializer from './components/Initializer';

const name = pluginPkg.strapi.displayName;

export default {
  register(app: { addSettingsLink: Function; registerPlugin: Function }) {
    app.addSettingsLink(
      {
        id: 'oidc',
        intlLabel: {
          id: `${pluginId}.settings.section`,
          defaultMessage: 'OIDC',
        },
      },
      {
        id: 'configuration',
        to: `/settings/${pluginId}`,
        intlLabel: {
          id: `${pluginId}.settings.configuration`,
          defaultMessage: 'Configuration',
        },
        Component: async () => {
          return await import('./pages/App');
        },
        permissions: [{ action: 'plugin::strapi-plugin-oidc.read', subject: null }],
      },
    );
    app.registerPlugin({
      id: pluginId,
      initializer: Initializer,
      name,
    });
  },

  bootstrap() {
    let isLogoutInProgress = false;

    const isAuthRoute = (path: string) =>
      /\/auth\/(login|register|forgot-password|reset-password)/.test(path);

    // Asynchronously fetch enforceOIDC so we can intercept client-side navigations
    // (Server-side Koa middleware already handles initial load 302 redirects)
    const checkEnforceOIDC = async () => {
      try {
        const response = await window.fetch('/strapi-plugin-oidc/settings/public');
        if (response.ok) {
          const data = await response.json();
          if (data.enforceOIDC) {
            const interceptHistory = (originalMethod: any) => {
              return function (
                ...args: [data: unknown, unused: string, url?: string | URL | null | undefined]
              ) {
                const url = args[2];
                if (url && typeof url === 'string') {
                  const urlWithoutQuery = url.split('?')[0].split('#')[0];
                  if (isAuthRoute(urlWithoutQuery) && !isLogoutInProgress) {
                    window.location.href = '/strapi-plugin-oidc/oidc';
                    return;
                  }
                }
                return originalMethod.apply(window.history, args);
              };
            };

            window.history.pushState = interceptHistory(window.history.pushState);
            window.history.replaceState = interceptHistory(window.history.replaceState);
          }
        }
      } catch (error) {
        console.error('Failed to check OIDC enforcement setting:', error);
      }
    };
    checkEnforceOIDC();

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      const isLogout =
        url && url.endsWith('/admin/logout') && args[1]?.method?.toUpperCase() === 'POST';

      if (isLogout) {
        isLogoutInProgress = true;
      }

      const response = await originalFetch(...args);

      if (isLogout && response.ok) {
        window.location.href = '/strapi-plugin-oidc/logout';
        // Return a pending promise to prevent Strapi from completing the logout redirect
        return new Promise(() => {});
      } else if (isLogout) {
        isLogoutInProgress = false; // Reset if logout failed
      }

      return response;
    };
  },
  async registerTrads({ locales }: { locales: string[] }) {
    const importedTrads = await Promise.all(
      locales.map((locale: string) => {
        return import(`./translations/${locale}.json`)
          .then(({ default: data }) => {
            const newData = Object.fromEntries(
              Object.entries(data).map(([key, value]) => [
                key.startsWith('global.') ? key : getTranslation(key),
                value,
              ]),
            );
            return {
              data: newData,
              locale,
            };
          })
          .catch(() => {
            return {
              data: {},
              locale,
            };
          });
      }),
    );
    return Promise.resolve(importedTrads);
  },
};
