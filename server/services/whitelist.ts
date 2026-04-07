import type { Core } from '@strapi/types';
import type { WhitelistSettings, WhitelistEntry } from '../types';

export default function whitelistService({ strapi }: { strapi: Core.Strapi }) {
  const getPluginStore = () =>
    strapi.store({
      environment: '',
      type: 'plugin',
      name: 'strapi-plugin-oidc',
    });

  const getWhitelistQuery = () => strapi.query('plugin::strapi-plugin-oidc.whitelists');

  // In-memory cache for the enforceOIDC setting, which is read on every admin
  // HTML request and token refresh. Invalidated whenever settings are saved.
  let settingsCache: { value: WhitelistSettings; ts: number } | null = null;
  const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  return {
    async getSettings(): Promise<WhitelistSettings> {
      const now = Date.now();
      if (settingsCache && now - settingsCache.ts < SETTINGS_CACHE_TTL_MS) {
        return settingsCache.value;
      }
      let settings = (await getPluginStore().get({ key: 'settings' })) as WhitelistSettings | null;
      if (!settings) {
        settings = {
          useWhitelist: true,
          enforceOIDC: false,
        };
        await getPluginStore().set({ key: 'settings', value: settings });
      }
      settingsCache = { value: settings, ts: now };
      return settings;
    },
    async setSettings(settings: WhitelistSettings): Promise<void> {
      settingsCache = null; // invalidate so next read reflects the change
      await getPluginStore().set({ key: 'settings', value: settings });
    },
    async getUsers(): Promise<WhitelistEntry[]> {
      return getWhitelistQuery().findMany() as Promise<WhitelistEntry[]>;
    },
    async registerUser(email: string, roles: string[]): Promise<void> {
      await getWhitelistQuery().create({
        data: { email, roles },
      });
    },
    async removeUser(id: number): Promise<void> {
      await getWhitelistQuery().delete({
        where: { id },
      });
    },
    async checkWhitelistForEmail(email: string): Promise<WhitelistEntry | null> {
      const settings = await this.getSettings();
      if (!settings.useWhitelist) {
        return null;
      }

      const result = (await getWhitelistQuery().findOne({
        where: { email },
      })) as WhitelistEntry | null;

      if (!result) {
        throw new Error('Not present in whitelist');
      }
      return result;
    },
  };
}
