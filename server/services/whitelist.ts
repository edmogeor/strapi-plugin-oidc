export default function whitelistService({ strapi }) {
  const getPluginStore = () =>
    strapi.store({
      environment: '',
      type: 'plugin',
      name: 'strapi-plugin-oidc',
    });

  const getWhitelistQuery = () => strapi.query('plugin::strapi-plugin-oidc.whitelists');

  return {
    async getSettings() {
      let settings = await getPluginStore().get({ key: 'settings' });
      if (!settings) {
        settings = { useWhitelist: true, enforceOIDC: false };
        await getPluginStore().set({ key: 'settings', value: settings });
      }
      return settings;
    },
    async setSettings(settings) {
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
      console.log('checkWhitelistForEmail settings:', settings);
      if (!settings.useWhitelist) {
        // If whitelist is disabled, set to true and skip
        return null;
      }

      const result = await getWhitelistQuery().findOne({
        where: { email },
      });
      console.log('checkWhitelistForEmail result:', result);

      if (!result) {
        throw new Error('Not present in whitelist');
      }
      return result;
    },
  };
}
