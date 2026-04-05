async function find(ctx) {
  const roleService = strapi.plugin('strapi-plugin-oidc').service('role')
  const roles = await roleService.find()
  const oidcConstants = roleService.getOidcRoles()
  for (const oidc of oidcConstants) {
    for (const role of roles) {
      if (role['oauth_type'] === oidc['oauth_type']) {
        oidc['role'] = role['roles']
      }
    }
  }
  ctx.send(oidcConstants)
}

async function update(ctx) {
  try {
    const {roles} = ctx.request.body
    const roleService = strapi.plugin('strapi-plugin-oidc').service('role')
    await roleService.update(roles)
    ctx.send({}, 204)
  } catch (e) {
    console.log(e)
    ctx.send({}, 400)
  }
}

export default {
  find,
  update
}
