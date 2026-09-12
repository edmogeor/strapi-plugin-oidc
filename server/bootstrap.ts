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
  const addColumn = async (name: string): Promise<void> => {
    try {
      if (!(await strapi.db.connection.schema.hasColumn('admin_users', name))) {
        await strapi.db.connection.schema.alterTable('admin_users', (table) => table.text(name));
      }
    } catch (err) {
      strapi.log.warn(`[strapi-plugin-oidc] Failed to add ${name} column: ${toMessage(err)}`);
    }
  };

  await addColumn('oidc_sub');
  await addColumn('oidc_sid');
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

  const updates = configSyncJobs
    .map(({ key, getter, dbField }) => ({ key, dbField, value: getter(strapi) }))
    .filter(
      (
        update,
      ): update is { key: string; dbField: 'enforceOIDC' | 'skipLoginPage'; value: boolean } =>
        update.value !== null,
    );
  if (updates.length === 0) return;

  try {
    const whitelistService = getWhitelistService();
    const settings = await whitelistService.getSettings();
    const changed = updates.filter(({ dbField, value }) => settings[dbField] !== value);
    if (changed.length === 0) return;

    await whitelistService.setSettings({
      ...settings,
      ...Object.fromEntries(changed.map(({ dbField, value }) => [dbField, value])),
    });
    for (const { key, value } of changed) {
      strapi.log.info(`[strapi-plugin-oidc] ${key}=${value} written to database settings`);
    }
  } catch (err) {
    strapi.log.error(errorMessages.ENFORCE_SYNC_ERROR, err);
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
