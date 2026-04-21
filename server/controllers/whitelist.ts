import type { Context } from 'koa';
import { getEnforceOIDCConfig, resolveEnforceOIDC } from '../utils/enforceOIDC';
import { isAuditLogEnabled } from '../utils/pluginConfig';
import { isValidEmail } from '../utils/email';
import { getWhitelistService } from '../utils/services';
import { setJsonAttachmentHeaders } from '../utils/http';
import type { StrapiContext } from '../types';

interface EmailUser {
  email: string;
}

async function info(ctx: Context) {
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

async function updateSettings(ctx: Context) {
  const body = ctx.request.body as { useWhitelist: boolean; enforceOIDC: boolean };
  const { useWhitelist } = body;
  let { enforceOIDC } = body;
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

async function publicSettings(ctx: Context) {
  const whitelistService = getWhitelistService();
  const settings = await whitelistService.getSettings();
  const config = strapi.config.get('plugin::strapi-plugin-oidc') as Record<string, unknown>;
  ctx.body = {
    enforceOIDC: resolveEnforceOIDC(strapi, settings.enforceOIDC),
    ssoButtonText: config.OIDC_SSO_BUTTON_TEXT,
  };
}

async function register(ctx: Context) {
  const { email } = ctx.request.body as { email: string | string[] };
  if (!email) {
    ctx.body = { message: 'Please enter a valid email address' };
    return;
  }

  const rawEmails = Array.isArray(email) ? email : email.split(',');
  const normalized = rawEmails.map((e: string) => String(e).trim().toLowerCase()).filter(Boolean);

  const rejectedEmails: string[] = [];
  const validEmails: string[] = [];
  for (const e of normalized) {
    if (isValidEmail(e)) {
      validEmails.push(e);
    } else {
      rejectedEmails.push(e);
    }
  }

  if (validEmails.length === 0) {
    ctx.status = 400;
    ctx.body = { error: 'No valid email addresses supplied', rejectedEmails };
    return;
  }

  const whitelistService = getWhitelistService();
  let acceptedCount = 0;
  let alreadyWhitelistedCount = 0;
  for (const singleEmail of validEmails) {
    const alreadyWhitelisted = await whitelistService.hasUser(singleEmail);
    if (alreadyWhitelisted) {
      alreadyWhitelistedCount++;
    } else {
      await whitelistService.registerUser(singleEmail);
      acceptedCount++;
    }
  }

  ctx.body = { acceptedCount, alreadyWhitelistedCount, rejectedEmails };
}

async function removeEmail(ctx: Context) {
  const { email } = ctx.params as { email: string };
  const whitelistService = getWhitelistService();
  await whitelistService.removeUser(email);
  ctx.body = {};
}

async function deleteAll(ctx: Context) {
  const whitelistService = getWhitelistService();
  await whitelistService.deleteAllUsers();
  ctx.body = {};
}

async function exportWhitelist(ctx: StrapiContext): Promise<void> {
  setJsonAttachmentHeaders(ctx, 'strapi-oidc-whitelist');

  const whitelistService = getWhitelistService();
  const users = await whitelistService.getUsers();
  ctx.body = users.map((u) => ({ email: u.email }));
}

async function importUsers(ctx: Context) {
  const { users } = ctx.request.body as { users: EmailUser[] };
  if (!Array.isArray(users)) {
    ctx.status = 400;
    ctx.body = { error: 'Expected { users: [{email}] }' };
    return;
  }

  const normalized = users
    .filter((u) => u?.email)
    .map((u) => String(u.email).trim().toLowerCase())
    .filter(isValidEmail);

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

async function syncUsers(ctx: Context) {
  const { users: rawUsers } = ctx.request.body as { users: EmailUser[] };

  const emails = rawUsers.map((u) => String(u.email).toLowerCase()).filter(isValidEmail);

  const whitelistService = getWhitelistService();
  const currentUsers = await whitelistService.getUsers();

  const syncEmailSet = new Set(emails);
  const currentUsersByEmail = new Map(currentUsers.map((u) => [u.email, u]));

  for (const currUser of currentUsers) {
    if (!syncEmailSet.has(currUser.email)) {
      await whitelistService.removeUser(currUser.email);
    }
  }

  for (const email of emails) {
    if (!currentUsersByEmail.has(email)) {
      await whitelistService.registerUser(email);
    }
  }

  ctx.body = {};
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
