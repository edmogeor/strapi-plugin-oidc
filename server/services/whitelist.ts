export default function whitelistService({ strapi }) {
  const getPluginStore = () =>
    strapi.store({
      environment: '',
      type: 'plugin',
      name: 'strapi-plugin-oidc',
    });

  const getWhitelistQuery = () => strapi.query('plugin::strapi-plugin-oidc.whitelists');

  // In-memory cache for the enforceOIDC setting, which is read on every admin
  // HTML request and token refresh. Invalidated whenever settings are saved.
  let settingsCache: { value: any; ts: number } | null = null;
  const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  return {
    async getSettings() {
      const now = Date.now();
      if (settingsCache && now - settingsCache.ts < SETTINGS_CACHE_TTL_MS) {
        return settingsCache.value;
      }
      let settings = await getPluginStore().get({ key: 'settings' });
      if (!settings) {
        settings = {
          useWhitelist: true,
          enforceOIDC: false,
          showSSOButton: true,
          ssoButtonText: 'Login via SSO',
        };
        await getPluginStore().set({ key: 'settings', value: settings });
      }
      settingsCache = { value: settings, ts: now };
      return settings;
    },
    async setSettings(settings) {
      settingsCache = null; // invalidate so next read reflects the change
      await getPluginStore().set({ key: 'settings', value: settings });
    },
    async getUsers() {
      return getWhitelistQuery().findMany();
    },
    async registerUser(email, roles) {
      await getWhitelistQuery().create({
        data: { email, roles },
      });
    },
    async removeUser(id) {
      await getWhitelistQuery().delete({
        where: { id },
      });
    },
    async checkWhitelistForEmail(email) {
      const settings = await this.getSettings();
      if (!settings.useWhitelist) {
        return null;
      }

      const result = await getWhitelistQuery().findOne({
        where: { email },
      });

      if (!result) {
        throw new Error('Not present in whitelist');
      }
      return result;
    },
  };
}
