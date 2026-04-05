import { getTranslation } from './utils/getTranslation';
import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import Initializer from './components/Initializer';
import PluginIcon from './components/PluginIcon';

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

  bootstrap(app) {
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
