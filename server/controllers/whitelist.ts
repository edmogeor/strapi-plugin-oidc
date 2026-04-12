import { getEnforceOIDCConfig, resolveEnforceOIDC } from '../utils/enforceOIDC';
import { isAuditLogEnabled } from '../utils/pluginConfig';
import { formatDatetimeForFilename } from '../utils/datetime';
import type { WhitelistService, StrapiContext } from '../types';

function getWhitelistService(): WhitelistService {
  return strapi.plugin('strapi-plugin-oidc').service('whitelist') as WhitelistService;
}

async function info(ctx) {
  const whitelistService = getWhitelistService();
  const settings = await whitelistService.getSettings();
  const whitelistUsers = await whitelistService.getUsers();
  ctx.body = {
    useWhitelist: settings.useWhitelist,
    enforceOIDC: resolveEnforceOIDC(strapi, settings.enforceOIDC),
    enforceOIDCConfig: getEnforceOIDCConfig(strapi),
    whitelistUsers,
    auditLogEnabled: isAuditLogEnabled(),
  };
}

async function updateSettings(ctx) {
  const { useWhitelist } = ctx.request.body;
  let { enforceOIDC } = ctx.request.body;
  const whitelistService = getWhitelistService();

  if (useWhitelist && enforceOIDC) {
    const users = await whitelistService.getUsers();
    if (users.length === 0) {
      enforceOIDC = false;
    }
  }

  await whitelistService.setSettings({ useWhitelist, enforceOIDC });
  ctx.body = { useWhitelist, enforceOIDC };
}

async function publicSettings(ctx) {
  const whitelistService = getWhitelistService();
  const settings = await whitelistService.getSettings();
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, any>;
  ctx.body = {
    enforceOIDC: resolveEnforceOIDC(strapi, settings.enforceOIDC),
    ssoButtonText: config.OIDC_SSO_BUTTON_TEXT,
  };
}

async function register(ctx) {
  const { email } = ctx.request.body;
  if (!email) {
    ctx.body = { message: 'Please enter a valid email address' };
    return;
  }

  // Handle both comma-separated strings and arrays of emails
  const rawEmails = Array.isArray(email) ? email : email.split(',');
  const emailList = rawEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean);

  const whitelistService = getWhitelistService();
  let matchedExistingUsersCount = 0;

  for (const singleEmail of emailList) {
    const existingUser = await strapi.query('admin::user').findOne({
      where: { email: singleEmail },
    });
    if (existingUser) matchedExistingUsersCount++;

    const alreadyWhitelisted = await strapi.query('plugin::strapi-plugin-oidc.whitelists').findOne({
      where: { email: singleEmail },
    });

    if (!alreadyWhitelisted) {
      await whitelistService.registerUser(singleEmail);
    }
  }

  ctx.body = { matchedExistingUsersCount };
}

async function removeEmail(ctx) {
  const { email } = ctx.params;
  const whitelistService = getWhitelistService();
  await whitelistService.removeUser(email);
  ctx.body = {};
}

async function deleteAll(ctx) {
  await strapi.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({});
  ctx.body = {};
}

async function exportWhitelist(ctx: StrapiContext): Promise<void> {
  const datetime = formatDatetimeForFilename(new Date());
  ctx.set('Content-Type', 'application/json');
  ctx.set('Content-Disposition', `attachment; filename="strapi-oidc-whitelist-${datetime}.json"`);

  const whitelistService = getWhitelistService();
  const users = await whitelistService.getUsers();
  ctx.body = users.map((u) => ({ email: u.email }));
}

async function importUsers(ctx) {
  const { users } = ctx.request.body;
  if (!Array.isArray(users)) {
    ctx.status = 400;
    ctx.body = { error: 'Expected { users: [{email}] }' };
    return;
  }

  const normalized = users
    .filter((u) => u?.email)
    .map((u) => String(u.email).trim().toLowerCase())
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

  // Deduplicate within the import payload itself
  const deduped = [...new Set(normalized)];

  const whitelistService = getWhitelistService();
  const existing = await whitelistService.getUsers();
  const existingEmails = new Set(existing.map((u) => u.email));

  let importedCount = 0;
  for (const email of deduped) {
    if (existingEmails.has(email)) continue;
    await whitelistService.registerUser(email);
    importedCount++;
  }

  ctx.body = { importedCount };
}

async function syncUsers(ctx) {
  const { users: rawUsers } = ctx.request.body;

  const emails = rawUsers
    .map((u) => String(u.email).toLowerCase())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const whitelistService = getWhitelistService();
  const currentUsers = await whitelistService.getUsers();

  const syncEmailSet = new Set(emails);
  const currentUsersByEmail = new Map(currentUsers.map((u) => [u.email, u]));

  // Remove whitelist entries not present in the incoming list
  for (const currUser of currentUsers) {
    if (!syncEmailSet.has(currUser.email)) {
      await whitelistService.removeUser(currUser.email);
    }
  }

  // Add new entries
  for (const email of emails) {
    if (!currentUsersByEmail.has(email)) {
      await whitelistService.registerUser(email);
    }
  }

  ctx.body = { matchedExistingUsersCount: 0 };
}

export default {
  info,
  updateSettings,
  publicSettings,
  register,
  removeEmail,
  deleteAll,
  syncUsers,
  importUsers,
  exportWhitelist,
};
