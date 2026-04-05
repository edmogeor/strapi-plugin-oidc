async function info(ctx) {
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
  const settings = await whitelistService.getSettings();
  const whitelistUsers = await whitelistService.getUsers();

  ctx.body = {
    useWhitelist: settings.useWhitelist,
    enforceOIDC: settings.enforceOIDC || false,
    whitelistUsers,
  };
}

async function updateSettings(ctx) {
  const { useWhitelist, enforceOIDC } = ctx.request.body;
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
  await whitelistService.setSettings({ useWhitelist, enforceOIDC });
  ctx.body = { useWhitelist, enforceOIDC };
}

async function publicSettings(ctx) {
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist');
  const settings = await whitelistService.getSettings();
  ctx.body = {
    enforceOIDC: settings.enforceOIDC || false,
  };
}

async function register(ctx) {
  const { email, roles } = ctx.request.body;
  if (!email) {
    ctx.body = { message: 'Please enter a valid email address' };
    return;
  }

  // Handle both comma-separated strings and arrays of emails
  const emailList = Array.isArray(email)
    ? email
    : email
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);

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

async function syncUsers(ctx) {
  const { users } = ctx.request.body;
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
  syncUsers,
};
