import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import Initializer from './components/Initializer';
import { t, en } from './utils/getTrad';

const name = pluginPkg.strapi.displayName;

export default {
  register(app: { addSettingsLink: Function; registerPlugin: Function }) {
    app.addSettingsLink(
      {
        id: 'oidc',
        intlLabel: {
          id: 'settings.section',
          defaultMessage: 'OIDC',
        },
      },
      {
        id: 'configuration',
        to: `/settings/${pluginId}`,
        intlLabel: {
          id: 'settings.configuration',
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
    const defaultButtonText = t('login.sso');

    const isAuthRoute = (path: string) =>
      /\/auth\/(login|register|forgot-password|reset-password)/.test(path);

    // --- SSO button injection + enforcement DOM removal ---
    let ssoButtonInjected = false;
    let loginObserver: MutationObserver | null = null;

    const injectSSOButton = (buttonText: string) => {
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
      btn.onclick = () => {
        window.location.href = '/strapi-plugin-oidc/oidc';
      };

      // Match the inner <span> structure of the submit button
      const innerSpan = submitButton.querySelector('span');
      const span = document.createElement('span');
      if (innerSpan) span.className = innerSpan.className;
      span.style.display = 'inline-flex';
      span.style.alignItems = 'center';
      span.style.gap = '8px';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML =
        '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/>' +
        '<circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>';

      span.appendChild(svg);
      span.appendChild(document.createTextNode(buttonText));
      btn.appendChild(span);

      submitButton.parentNode.insertBefore(btn, submitButton.nextSibling);
      ssoButtonInjected = true;
    };

    // Remove standard login elements from the DOM when enforcement is on.
    // Uses stable semantic selectors so it survives Strapi's hashed class names.
    // Called on each observer tick so elements re-added by React are removed again.
    const removeEnforcedElements = () => {
      // Form field wrappers (email, password, remember-me) and the login submit button
      [
        'form > div > div:has(input[name="email"])',
        'form > div > div:has(input[name="password"])',
        'form > div > div:has(button[role="checkbox"])',
        'form > div > button[type="submit"]:not(#strapi-oidc-sso-btn)',
      ].forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => el.remove());
      });

      // Forgot password link — remove its outer wrapper div so no empty space remains
      document.querySelectorAll('a[href*="forgot-password"]').forEach((el) => {
        (el.closest('div')?.parentElement ?? el).remove();
      });
    };

    const startLoginObserver = (buttonText: string, enforced: boolean) => {
      if (loginObserver) return;

      const tick = () => {
        if (!isAuthRoute(window.location.pathname)) return;
        injectSSOButton(buttonText);
        if (enforced) removeEnforcedElements();
      };

      tick(); // try immediately in case the form is already in the DOM
      loginObserver = new MutationObserver(tick);
      loginObserver.observe(document.body, { childList: true, subtree: true });
    };
    // --- end SSO button / enforcement ---

    // Fetch public settings, then start the login observer.
    const applySettings = async () => {
      try {
        const response = await window.fetch('/strapi-plugin-oidc/settings/public');
        if (response.ok) {
          const data = await response.json();
          startLoginObserver(data.ssoButtonText || defaultButtonText, !!data.enforceOIDC);
        } else {
          startLoginObserver(defaultButtonText, false);
        }
      } catch (error) {
        startLoginObserver(defaultButtonText, false);
        console.error('Failed to fetch OIDC settings:', error);
      }
    };
    applySettings();

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
      const isLogout = url?.endsWith('/admin/logout') && args[1]?.method?.toUpperCase() === 'POST';

      const response = await originalFetch(...args);

      if (isLogout && response.ok) {
        window.localStorage.removeItem('jwtToken');
        window.localStorage.removeItem('isLoggedIn');
        window.sessionStorage.removeItem('jwtToken');
        window.sessionStorage.removeItem('isLoggedIn');
        document.cookie = 'jwtToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
        document.cookie = 'jwtToken=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/admin';
        window.location.href = '/strapi-plugin-oidc/logout';
        return new Promise(() => {});
      }

      return response;
    };
  },

  async registerTrads({ locales }: { locales: string[] }) {
    const transformKeys = (data: Record<string, string>) =>
      Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key.startsWith('global.') ? key : `${pluginId}.${key}`,
          value,
        ]),
      );

    const importedTrads = await Promise.all(
      locales.map((locale: string) => {
        if (locale === 'en') {
          return Promise.resolve({ data: transformKeys(en), locale });
        }
        // Additional locale files live in translations/locales/ (e.g. fr.json, de.json)
        return import(`../translations/locales/${locale}.json`)
          .then(({ default: data }) => ({ data: transformKeys(data), locale }))
          .catch(() => ({ data: {}, locale }));
      }),
    );
    return importedTrads;
  },
};
