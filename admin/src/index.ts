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
    let historyPatched = false;

    const ENFORCE_CACHE_KEY = 'strapi_oidc_enforced';

    const isAuthRoute = (path: string) =>
      /\/auth\/(login|register|forgot-password|reset-password)/.test(path);

    // Patch history.pushState/replaceState to redirect auth routes to OIDC.
    // Guarded so double-calls are safe.
    const patchHistory = () => {
      if (historyPatched) return;
      historyPatched = true;

      const interceptHistory = (originalMethod: any) => {
        return function (
          ...args: [data: unknown, unused: string, url?: string | URL | null | undefined]
        ) {
          const url = args[2];
          if (url && typeof url === 'string') {
            const urlWithoutQuery = url.split('?')[0].split('#')[0];
            if (isAuthRoute(urlWithoutQuery)) {
              if (isLogoutInProgress) {
                // Block local navigation to login page to prevent UI flash during logout
                return;
              }
              window.location.href = '/strapi-plugin-oidc/oidc';
              return;
            }
          }
          return originalMethod.apply(window.history, args);
        };
      };

      window.history.pushState = interceptHistory(window.history.pushState);
      window.history.replaceState = interceptHistory(window.history.replaceState);

      // Redirect immediately if we're already on an auth route (e.g. hard refresh to /auth/login)
      if (isAuthRoute(window.location.pathname)) {
        window.location.replace('/strapi-plugin-oidc/oidc');
      }
    };

    // Synchronously patch history from the cached value so there is zero window
    // where React Router can render the login page on return visits.
    if (localStorage.getItem(ENFORCE_CACHE_KEY) === '1') {
      patchHistory();
    }

    // Async verify and keep the cache up to date.
    const checkEnforceOIDC = async () => {
      try {
        const response = await window.fetch('/strapi-plugin-oidc/settings/public');
        if (response.ok) {
          const data = await response.json();
          if (data.enforceOIDC) {
            localStorage.setItem(ENFORCE_CACHE_KEY, '1');
            patchHistory(); // no-op if already patched from cache
          } else {
            localStorage.removeItem(ENFORCE_CACHE_KEY);
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
        // Manually clear Strapi's local tokens since we are halting the normal logout flow
        window.localStorage.removeItem('jwtToken');
        window.localStorage.removeItem('isLoggedIn');
        window.sessionStorage.removeItem('jwtToken');
        window.sessionStorage.removeItem('isLoggedIn');

        // Strapi v5 uses cookies, so clear those as well
        document.cookie = 'jwtToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        document.cookie = 'jwtToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/admin';
        document.cookie = 'strapi_admin_refresh=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        document.cookie = 'strapi_admin_refresh=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/admin';

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
