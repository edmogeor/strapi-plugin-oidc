import { getEnforceOIDCConfig, resolveEnforceOIDC } from '../utils/enforceOIDC';

function getWhitelistService() {
  return strapi.plugin('strapi-plugin-oidc').service('whitelist');
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
  const { email, roles } = ctx.request.body;
  if (!email) {
    ctx.body = { message: 'Please enter a valid email address' };
    return;
  }

  // Handle both comma-separated strings and arrays of emails
  const rawEmails = Array.isArray(email) ? email : email.split(',');
  const emailList = rawEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean);

  const existingUsers = await strapi.query('admin::user').findMany({
    where: { email: { $in: emailList } },
    populate: ['roles'],
  });
  const existingUsersByEmail = new Map(existingUsers.map((u) => [u.email, u]));

  const whitelistService = getWhitelistService();
  let matchedExistingUsersCount = 0;

  for (const singleEmail of emailList) {
    const existingUser = existingUsersByEmail.get(singleEmail);
    let finalRoles = roles;

    if (existingUser?.roles) {
      finalRoles = existingUser.roles.map((r) => String(r.id));
      matchedExistingUsersCount++;
    }

    // Only register if not already in whitelist to prevent duplicates
    const alreadyWhitelisted = await strapi.query('plugin::strapi-plugin-oidc.whitelists').findOne({
      where: { email: singleEmail },
    });

    if (!alreadyWhitelisted) {
      await whitelistService.registerUser(singleEmail, finalRoles);
    }
  }

  ctx.body = { matchedExistingUsersCount };
}

async function removeEmail(ctx) {
  const { id } = ctx.params;
  const whitelistService = getWhitelistService();
  await whitelistService.removeUser(id);
  ctx.body = {};
}

async function deleteAll(ctx) {
  await strapi.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({});
  ctx.body = {};
}

async function importUsers(ctx) {
  const { users } = ctx.request.body;
  if (!Array.isArray(users)) {
    ctx.status = 400;
    ctx.body = { error: 'Expected { users: [{email, roles}] }' };
    return;
  }

  // Build a name→id map so the JSON can use human-readable role names.
  // Falls back to treating the value as an ID if no matching name is found,
  // which preserves backwards compatibility with ID-based exports.
  const allRoles = await strapi.query('admin::role').findMany({});
  const roleNameToId = new Map(allRoles.map((r) => [r.name, String(r.id)]));
  const resolveRole = (nameOrId: string) => roleNameToId.get(nameOrId) ?? nameOrId;

  const normalized = users
    .filter((u) => u?.email)
    .map((u) => ({
      email: String(u.email).trim().toLowerCase(),
      roles: (Array.isArray(u.roles) ? u.roles : []).map(resolveRole),
    }));

  // Deduplicate within the import payload itself
  const seen = new Set<string>();
  const deduped = normalized.filter((u) => {
    if (seen.has(u.email)) return false;
    seen.add(u.email);
    return true;
  });

  // If a Strapi admin user already exists, use their current roles (same behaviour as register)
  const strapiUsers = await strapi.query('admin::user').findMany({
    where: { email: { $in: deduped.map((u) => u.email) } },
    populate: ['roles'],
  });
  const strapiUserMap = new Map(strapiUsers.map((u) => [u.email, u]));

  const whitelistService = getWhitelistService();
  const existing = await whitelistService.getUsers();
  const existingEmails = new Set(existing.map((u) => u.email));

  let importedCount = 0;
  for (const user of deduped) {
    if (existingEmails.has(user.email)) continue;
    const strapiUser = strapiUserMap.get(user.email);
    const finalRoles = strapiUser?.roles?.length
      ? strapiUser.roles.map((r) => String(r.id))
      : user.roles;
    await whitelistService.registerUser(user.email, finalRoles);
    importedCount++;
  }

  ctx.body = { importedCount };
}

async function syncUsers(ctx) {
  const { users: rawUsers } = ctx.request.body;

  const users = rawUsers.map((u) => ({ ...u, email: String(u.email).toLowerCase() }));

  const whitelistService = getWhitelistService();
  const currentUsers = await whitelistService.getUsers();
  let matchedExistingUsersCount = 0;

  const emailsToSync = users.map((u) => u.email);
  const existingStrapiUsers = await strapi.query('admin::user').findMany({
    where: { email: { $in: emailsToSync } },
    populate: ['roles'],
  });

  const syncEmailSet = new Set(emailsToSync);
  const currentUsersByEmail = new Map(currentUsers.map((u) => [u.email, u]));
  const strapiUsersByEmail = new Map(existingStrapiUsers.map((u) => [u.email, u]));

  // Remove whitelist entries not present in the incoming list
  for (const currUser of currentUsers) {
    if (!syncEmailSet.has(currUser.email)) {
      await whitelistService.removeUser(currUser.id);
    }
  }

  // Upsert incoming entries
  for (const user of users) {
    const currUser = currentUsersByEmail.get(user.email);
    let finalRoles = user.roles;

    if (!currUser) {
      const existingStrapiUser = strapiUsersByEmail.get(user.email);
      if (existingStrapiUser?.roles) {
        finalRoles = existingStrapiUser.roles.map((r) => String(r.id));
        matchedExistingUsersCount++;
      }
      await whitelistService.registerUser(user.email, finalRoles);
    } else {
      await strapi.query('plugin::strapi-plugin-oidc.whitelists').update({
        where: { id: currUser.id },
        data: { roles: finalRoles },
      });
    }
  }

  ctx.body = { matchedExistingUsersCount };
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
};
