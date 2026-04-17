import type { Core } from '@strapi/types';
import type { WhitelistSettings, WhitelistEntry } from '../types';
import { errorMessages } from '../error-strings';
import { OidcError } from '../oidc-errors';

const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;

export default function whitelistService({ strapi }: { strapi: Core.Strapi }) {
  let settingsCache: { value: WhitelistSettings; ts: number } | null = null;

  const getPluginStore = () =>
    strapi.store({ environment: '', type: 'plugin', name: 'strapi-plugin-oidc' });

  const getWhitelistQuery = () => strapi.query('plugin::strapi-plugin-oidc.whitelists');

  return {
    async getSettings(): Promise<WhitelistSettings> {
      const now = Date.now();
      if (settingsCache && now - settingsCache.ts < SETTINGS_CACHE_TTL_MS) {
        return settingsCache.value;
      }
      let settings = (await getPluginStore().get({ key: 'settings' })) as WhitelistSettings | null;
      if (!settings) {
        settings = { useWhitelist: true, enforceOIDC: false };
        await getPluginStore().set({ key: 'settings', value: settings });
      }
      settingsCache = { value: settings, ts: now };
      return settings;
    },
    async setSettings(settings: WhitelistSettings): Promise<void> {
      settingsCache = null;
      await getPluginStore().set({ key: 'settings', value: settings });
    },
    async getUsers(): Promise<WhitelistEntry[]> {
      return getWhitelistQuery().findMany() as Promise<WhitelistEntry[]>;
    },
    async registerUser(email: string): Promise<void> {
      await getWhitelistQuery().create({ data: { email } });
    },
    async removeUser(email: string): Promise<void> {
      await getWhitelistQuery().deleteMany({ where: { email } });
    },
    async checkWhitelistForEmail(email: string): Promise<WhitelistEntry | null> {
      const settings = await this.getSettings();
      if (!settings.useWhitelist) return null;
      const result = (await getWhitelistQuery().findOne({
        where: { email },
      })) as WhitelistEntry | null;
      if (!result) throw new OidcError('whitelist_rejected', errorMessages.WHITELIST_NOT_PRESENT);
      return result;
    },
    async hasUser(email: string): Promise<boolean> {
      const row = await getWhitelistQuery().findOne({ where: { email }, select: ['id'] });
      return !!row;
    },
    async deleteAllUsers(): Promise<void> {
      await getWhitelistQuery().deleteMany({});
    },
    async countAdminUsersByEmails(emails: string[]): Promise<number> {
      if (emails.length === 0) return 0;
      const rows = await strapi.query('admin::user').findMany({
        where: { email: { $in: emails } },
        select: ['id'],
      });
      return rows.length;
    },
  };
}
