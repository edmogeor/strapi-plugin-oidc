import { getTranslation } from './utils/getTranslation';
import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import Initializer from './components/Initializer';
import en from './translations/en.json';

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
              document.documentElement.style.visibility = 'hidden';
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
        document.documentElement.style.visibility = 'hidden';
        window.location.replace('/strapi-plugin-oidc/oidc');
      }
    };

    // --- SSO button injection (shown on login page when enforceOIDC is false) ---
    let ssoButtonInjected = false;
    let ssoObserver: MutationObserver | null = null;
    let ssoButtonText = en['login.sso']; // overwritten by server settings

    const injectSSOButton = () => {
      if (ssoButtonInjected) return;
      if (!isAuthRoute(window.location.pathname)) return;
      if (document.getElementById('strapi-oidc-sso-btn')) return;

      const submitButton = document.querySelector('form button[type="submit"]');
      if (!submitButton?.parentNode) return;

      const btn = document.createElement('button');
      btn.id = 'strapi-oidc-sso-btn';
      btn.type = 'button';
      // Copy styled-components classes from the submit button so appearance is identical
      btn.className = submitButton.className;
      btn.style.marginTop = '8px';
      btn.onclick = () => {
        window.location.href = '/strapi-plugin-oidc/oidc';
      };

      // Match the inner <span> structure of the submit button
      const innerSpan = submitButton.querySelector('span');
      const span = document.createElement('span');
      if (innerSpan) span.className = innerSpan.className;
      span.textContent = ssoButtonText;
      btn.appendChild(span);

      submitButton.parentNode.insertBefore(btn, submitButton.nextSibling);
      ssoButtonInjected = true;
    };

    const startSSOButtonObserver = () => {
      if (ssoObserver) return;
      injectSSOButton(); // try immediately in case form is already rendered
      ssoObserver = new MutationObserver(() => {
        if (isAuthRoute(window.location.pathname)) injectSSOButton();
      });
      ssoObserver.observe(document.body, { childList: true, subtree: true });
    };

    const stopSSOButtonObserver = () => {
      ssoObserver?.disconnect();
      ssoObserver = null;
      document.getElementById('strapi-oidc-sso-btn')?.remove();
      ssoButtonInjected = false;
    };
    // --- end SSO button injection ---

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
            stopSSOButtonObserver();
            patchHistory(); // no-op if already patched from cache
          } else {
            localStorage.removeItem(ENFORCE_CACHE_KEY);
            document.documentElement.style.visibility = '';
            if (data.showSSOButton !== false) {
              ssoButtonText = data.ssoButtonText || en['login.sso'];
              startSSOButtonObserver();
            } else {
              stopSSOButtonObserver();
            }
          }
        }
      } catch (error) {
        document.documentElement.style.visibility = '';
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

        // Clear the jwtToken cookie (not httpOnly, so JS can remove it)
        // strapi_admin_refresh and oidc_authenticated are httpOnly — cleared server-side
        document.cookie = 'jwtToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        document.cookie = 'jwtToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/admin';

        // Always route through the plugin logout endpoint — the server decides whether
        // to redirect to the OIDC provider based on the oidc_authenticated cookie.
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
