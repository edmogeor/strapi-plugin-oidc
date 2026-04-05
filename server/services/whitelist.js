export default function whitelistService({ strapi }) {
  return {
    async getSettings() {
      const pluginStore = strapi.store({ type: 'plugin', name: 'strapi-plugin-oidc' });
      let settings = await pluginStore.get({ key: 'settings' });
      if (!settings) {
        settings = { useWhitelist: true, enforceOIDC: false };
        await pluginStore.set({ key: 'settings', value: settings });
      }
      return settings;
    },
    async setSettings(settings) {
      const pluginStore = strapi.store({ type: 'plugin', name: 'strapi-plugin-oidc' });
      await pluginStore.set({ key: 'settings', value: settings });
    },
    async getUsers() {
      const query = strapi.query('plugin::strapi-plugin-oidc.whitelists')
      return await query.findMany()
    },
    async registerUser(email, roles) {
      const query = strapi.query('plugin::strapi-plugin-oidc.whitelists')
      await query.create({
        data: {
          email,
          roles
        }
      })
    },
    async removeUser(id) {
      const query = strapi.query('plugin::strapi-plugin-oidc.whitelists')
      await query.delete({
        where: {
          id
        }
      })
    },
    async checkWhitelistForEmail(email) {
      const settings = await this.getSettings();
      if (!settings.useWhitelist) {
        // If whitelist is disabled, set to true and skip
        return null;
      }
      const query = strapi.query('plugin::strapi-plugin-oidc.whitelists')
      const result = await query.findOne({
        where: {
          email
        }
      })
      if (result === null) {
        throw new Error('Not present in whitelist')
      }
      return result;
    }
  };
}
