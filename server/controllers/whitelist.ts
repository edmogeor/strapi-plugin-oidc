import { getEnforceOIDCConfig, resolveEnforceOIDC } from '../utils/enforceOIDC';

async function info(ctx) {
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
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
  let { useWhitelist, enforceOIDC } = ctx.request.body;
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');

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
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
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

  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
  let matchedExistingUsersCount = 0;

  for (const singleEmail of emailList) {
    const existingUser = existingUsers.find((u) => u.email === singleEmail);
    let finalRoles = roles;

    if (existingUser?.roles) {
      finalRoles = existingUser.roles.map((r) => String(r.id));
      matchedExistingUsersCount++;
    }

    // Only register if not already in whitelist to prevent errors
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
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
  await whitelistService.removeUser(id);
  ctx.body = {};
}

async function deleteAll(ctx) {
  await strapi.db.query('plugin::strapi-plugin-oidc.whitelists').deleteMany({});
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

  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
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
  let { users } = ctx.request.body;

  // normalize emails
  users = users.map((u) => ({ ...u, email: String(u.email).toLowerCase() }));

  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');

  const currentUsers = await whitelistService.getUsers();
  let matchedExistingUsersCount = 0;

  const emailsToSync = users.map((u) => u.email);
  const existingStrapiUsers = await strapi.query('admin::user').findMany({
    where: { email: { $in: emailsToSync } },
    populate: ['roles'],
  });

  for (const currUser of currentUsers) {
    if (!users.find((u) => u.email === currUser.email)) {
      await whitelistService.removeUser(currUser.id);
    }
  }

  for (const user of users) {
    const existingStrapiUser = existingStrapiUsers.find((u) => u.email === user.email);
    let finalRoles = user.roles;
    const currUser = currentUsers.find((u) => u.email === user.email);

    if (!currUser && existingStrapiUser?.roles) {
      finalRoles = existingStrapiUser.roles.map((r) => String(r.id));
      matchedExistingUsersCount++;
    }

    if (currUser) {
      await strapi.query('plugin::strapi-plugin-oidc.whitelists').update({
        where: { id: currUser.id },
        data: { roles: finalRoles },
      });
    } else {
      await whitelistService.registerUser(user.email, finalRoles);
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
