import type { Context } from 'koa';
import { getEnforceOIDCConfig, resolveEnforceOIDC } from '../utils/enforceOIDC';
import { isAuditLogEnabled, getPluginConfig } from '../utils/pluginConfig';
import { isValidEmail } from '../utils/email';
import { getWhitelistService } from '../utils/services';
import { setJsonAttachmentHeaders } from '../utils/http';
import { errorMessages } from '../error-strings';
import {
  updateSettingsSchema,
  registerSchema,
  importUsersSchema,
  syncUsersSchema,
} from '../schemas';
import type { StrapiContext } from '../types';

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
  const parsed = updateSettingsSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: errorMessages.WHITELIST_INVALID_REQUEST, details: parsed.error.flatten() };
    return;
  }
  const { useWhitelist, enforceOIDC } = parsed.data;
  let enforceOIDCParsed = enforceOIDC;
  const whitelistService = getWhitelistService();

  if (useWhitelist && enforceOIDCParsed) {
    const users = await whitelistService.getUsers();
    if (users.length === 0) {
      enforceOIDCParsed = false;
    }
  }

  await whitelistService.setSettings({ useWhitelist, enforceOIDC: enforceOIDCParsed });
  ctx.body = { useWhitelist, enforceOIDC: enforceOIDCParsed };
}

async function publicSettings(ctx: Context) {
  const whitelistService = getWhitelistService();
  const settings = await whitelistService.getSettings();
  const config = getPluginConfig();
  ctx.body = {
    enforceOIDC: resolveEnforceOIDC(strapi, settings.enforceOIDC),
    ssoButtonText: config.OIDC_SSO_BUTTON_TEXT,
  };
}

async function register(ctx: Context) {
  const parsed = registerSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { message: errorMessages.WHITELIST_INVALID_EMAIL };
    return;
  }
  const { email } = parsed.data;

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
    ctx.body = { message: errorMessages.WHITELIST_INVALID_EMAIL };
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
  const { email } = ctx.params;
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
  const parsed = importUsersSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: errorMessages.WHITELIST_IMPORT_INVALID };
    return;
  }
  const { users } = parsed.data;

  const normalized = users.map((u) => (u.email ?? '').trim().toLowerCase()).filter(isValidEmail);

  const deduped = [...new Set(normalized)];

  const whitelistService = getWhitelistService();
  const existing = await whitelistService.getUsers();
  const existingEmails = new Set(existing.map((u) => u.email));

  const toImport = deduped.filter((email) => !existingEmails.has(email));
  await Promise.all(toImport.map((email) => whitelistService.registerUser(email)));

  ctx.body = { importedCount: toImport.length };
}

async function syncUsers(ctx: Context) {
  const parsed = syncUsersSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.status = 400;
    ctx.body = { error: errorMessages.WHITELIST_INVALID_REQUEST };
    return;
  }
  const { users } = parsed.data;

  const emails = users.map((u) => u.email.toLowerCase()).filter(isValidEmail);

  const whitelistService = getWhitelistService();
  const currentUsers = await whitelistService.getUsers();

  const syncEmailSet = new Set(emails);
  const currentUsersByEmail = new Map(currentUsers.map((u) => [u.email, u]));

  await Promise.all([
    ...currentUsers
      .filter((u) => !syncEmailSet.has(u.email))
      .map((u) => whitelistService.removeUser(u.email)),
    ...emails
      .filter((email) => !currentUsersByEmail.has(email))
      .map((email) => whitelistService.registerUser(email)),
  ]);

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
