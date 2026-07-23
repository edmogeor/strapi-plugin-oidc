import type { Core } from '@strapi/types';
import type { Context, Next } from 'koa';
import { errorMessages } from './error-strings';
import { toMessage } from '../shared/utils';
import { getEnforceOIDCConfig, getSkipLoginPageConfig } from './utils/configFlag';
import { getRetentionDays, getPluginConfig } from './utils/pluginConfig';
import { getWhitelistService, getAuditLogService } from './utils/services';
import { resetOidcConfig } from './utils/oidc-client';
import { pruneStoredJtis } from './controllers/oidc/backchannelLogout';
import { registerEnforceOidcMiddleware } from './middleware/enforceOidc';
import { CONTENT_TYPES as CT, PERMISSIONS } from '../shared/constants';

export default async function bootstrap({ strapi }: { strapi: Core.Strapi }) {
  resetOidcConfig();
  warnIfSecureCookiesForced(strapi);
  await addOidcColumns(strapi);
  const adminPath = resolveAdminPath(strapi);

  registerEnforceOidcMiddleware(strapi, adminPath);
  registerOidcCspMiddleware(strapi);
  await registerPermissions(strapi);
  await syncEnvConfigToDatabase(strapi);
  await seedDefaultOidcRole(strapi);
  scheduleAuditLogCleanup(strapi);
}

function warnIfSecureCookiesForced(strapi: Core.Strapi): void {
  if (getPluginConfig(strapi).OIDC_FORCE_SECURE_COOKIES === true) {
    strapi.log.warn(
      '[strapi-plugin-oidc] OIDC_FORCE_SECURE_COOKIES is enabled. Cookies will be marked Secure; ensure Strapi is served over HTTPS or __Host- cookies will be rejected by browsers.',
    );
  }
}

async function addOidcColumns(strapi: Core.Strapi): Promise<void> {
  const columns: Array<{ name: string; type: string }> = [
    { name: 'oidc_sub', type: 'TEXT' },
    { name: 'oidc_sid', type: 'TEXT' },
  ];
  for (const { name, type } of columns) {
    try {
      await strapi.db.connection.raw(`ALTER TABLE admin_users ADD COLUMN ${name} ${type}`);
    } catch (err) {
      const msg = toMessage(err);
      if (!msg.includes('Duplicate column') && !msg.includes('already exists')) {
        strapi.log.warn(`[strapi-plugin-oidc] Failed to add ${name} column:`, msg);
      }
    }
  }
}

export function resolveAdminPath(strapi: Core.Strapi): string {
  const rawAdminUrl = strapi.config.get('admin.url');
  const adminUrl =
    typeof rawAdminUrl === 'string' && rawAdminUrl.length > 0 ? rawAdminUrl : '/admin';
  try {
    return new URL(adminUrl).pathname.replace(/\/$/, '');
  } catch {
    return adminUrl.startsWith('/') ? adminUrl : `/${adminUrl}`;
  }
}

function registerOidcCspMiddleware(strapi: Core.Strapi): void {
  const applyOidcCsp = async (ctx: Context, next: Next) => {
    await next();
    if (ctx.state.oidcCsp) {
      ctx.set('Content-Security-Policy', ctx.state.oidcCsp);
    }
  };
  strapi.server.use(applyOidcCsp);
}

async function registerPermissions(strapi: Core.Strapi): Promise<void> {
  const actions = [
    { section: 'plugins', displayName: 'Read', uid: 'read', pluginName: 'strapi-plugin-oidc' },
    { section: 'plugins', displayName: 'Update', uid: 'update', pluginName: 'strapi-plugin-oidc' },
  ];
  await strapi.admin.services.permission.actionProvider.registerMany(actions);

  const contentApiScopeUids = [
    PERMISSIONS.WHITELIST_READ,
    PERMISSIONS.WHITELIST_WRITE,
    PERMISSIONS.WHITELIST_DELETE,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_DELETE,
  ];
  for (const uid of contentApiScopeUids) {
    strapi.contentAPI.permissions.providers.action.register(uid, { uid });
  }
}

async function syncEnvConfigToDatabase(strapi: Core.Strapi): Promise<void> {
  const configSyncJobs = [
    { key: 'OIDC_ENFORCE', getter: getEnforceOIDCConfig, dbField: 'enforceOIDC' as const },
    {
      key: 'OIDC_SKIP_LOGIN_PAGE',
      getter: getSkipLoginPageConfig,
      dbField: 'skipLoginPage' as const,
    },
  ];

  for (const { key, getter, dbField } of configSyncJobs) {
    const configValue = getter(strapi);
    if (configValue === null) continue;
    try {
      const whitelistService = getWhitelistService();
      const settings = await whitelistService.getSettings();
      if (settings[dbField] !== configValue) {
        await whitelistService.setSettings({ ...settings, [dbField]: configValue });
        strapi.log.info(`[strapi-plugin-oidc] ${key}=${configValue} written to database settings`);
      }
    } catch (err) {
      strapi.log.error(errorMessages.ENFORCE_SYNC_ERROR, err);
    }
  }
}

async function seedDefaultOidcRole(strapi: Core.Strapi): Promise<void> {
  try {
    const oidcRoleCount = await strapi.query(CT.ROLES).count({ where: { oauth_type: '4' } });
    if (oidcRoleCount > 0) return;

    const defaultRole =
      (await strapi.query('admin::role').findOne({ where: { code: 'strapi-editor' } })) ??
      (await strapi.query('admin::role').findOne({}));

    if (defaultRole) {
      await strapi.query(CT.ROLES).create({
        data: { oauth_type: '4', roles: [String(defaultRole.id)] },
      });
    }
  } catch (err) {
    strapi.log.warn(errorMessages.DEFAULT_ROLE_INIT_ERROR, toMessage(err));
  }
}

function scheduleAuditLogCleanup(strapi: Core.Strapi): void {
  strapi.cron.add({
    'strapi-plugin-oidc-audit-log-cleanup': {
      task: async () => {
        try {
          const retentionDays = getRetentionDays(strapi);
          await getAuditLogService().cleanup(retentionDays);
          await pruneStoredJtis();
        } catch (err) {
          strapi.log.warn(errorMessages.AUDIT_LOG_CLEANUP_ERROR, toMessage(err));
        }
      },
      options: { rule: '0 0 * * *' },
    },
  });
}
