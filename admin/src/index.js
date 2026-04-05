import { getTranslation } from './utils/getTranslation';
import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import Initializer from './components/Initializer';

const name = pluginPkg.strapi.displayName;

export default {
  register(app) {
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
      }
    );
    app.registerPlugin({
      id: pluginId,
      initializer: Initializer,
      name,
    });
  },

  bootstrap() {
    const checkEnforceOIDC = async () => {
      try {
        const response = await window.fetch('/strapi-plugin-oidc/settings/public');
        if (response.ok) {
          const data = await response.json();
          if (data.enforceOIDC) {
            const currentPath = window.location.pathname;
            if (currentPath.endsWith('/auth/login')) {
              window.location.href = '/strapi-plugin-oidc/oidc';
            }
            
            // Intercept React Router navigation
            const originalPushState = window.history.pushState;
            window.history.pushState = function() {
              const url = arguments[2];
              if (url && typeof url === 'string' && url.endsWith('/auth/login')) {
                window.location.href = '/strapi-plugin-oidc/oidc';
                return;
              }
              return originalPushState.apply(window.history, arguments);
            };

            const originalReplaceState = window.history.replaceState;
            window.history.replaceState = function() {
              const url = arguments[2];
              if (url && typeof url === 'string' && url.endsWith('/auth/login')) {
                window.location.href = '/strapi-plugin-oidc/oidc';
                return;
              }
              return originalReplaceState.apply(window.history, arguments);
            };
          }
        }
      } catch (error) {
        console.error('Failed to check OIDC enforcement setting:', error);
      }
    };
    checkEnforceOIDC();

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const isLogout = url && url.endsWith('/admin/logout') && args[1]?.method?.toUpperCase() === 'POST';
      
      const response = await originalFetch(...args);
      
      if (isLogout && response.ok) {
        window.location.href = '/strapi-plugin-oidc/logout';
      }
      
      return response;
    };
  },
  async registerTrads({ locales }) {
    const importedTrads = await Promise.all(
      locales.map(locale => {
        return import(`./translations/${locale}.json`)
          .then(({default: data}) => {
            const newData = Object.fromEntries(
              Object.entries(data).map(([key, value]) => [
                key.startsWith('global.') ? key : getTranslation(key), 
                value
              ])
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
      })
    );
    return Promise.resolve(importedTrads);
  },
};
