async function info(ctx) {
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist')
  const settings = await whitelistService.getSettings();
  const whitelistUsers = await whitelistService.getUsers();
  ctx.body = {
    useWhitelist: settings.useWhitelist,
    whitelistUsers
  };
}

async function updateSettings(ctx) {
  const { useWhitelist } = ctx.request.body;
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist')
  await whitelistService.setSettings({ useWhitelist });
  ctx.body = { useWhitelist };
}

async function register(ctx) {
  const {email, roles} = ctx.request.body;
  if (!email) {
    ctx.body = {
      message: 'Please enter a valid email address',
    }
  }
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist')
  await whitelistService.registerUser(email, roles)

  ctx.body = {}
}

async function removeEmail(ctx) {
  const {id} = ctx.params
  const whitelistService = strapi.plugin('strapi-plugin-oidc').service('whitelist')
  await whitelistService.removeUser(id)
  ctx.body = {}
}

export default {
  info,
  updateSettings,
  register,
  removeEmail
}
