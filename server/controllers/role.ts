import type { Context } from 'koa';
import { getRoleService } from '../utils/services';
import { roleUpdateSchema } from '../schemas';

async function find(ctx: Context) {
  const roleService = getRoleService();
  const roles = await roleService.find();
  const oidcConstants = roleService.getOidcRoles();

  for (const oidc of oidcConstants) {
    const matchedRole = roles.find((r) => r.oauth_type === oidc.oauth_type);
    if (matchedRole) {
      oidc.role = matchedRole.roles;
    }
  }

  ctx.send(oidcConstants);
}

async function update(ctx: Context) {
  const parsed = roleUpdateSchema.safeParse(ctx.request.body);
  if (!parsed.success) {
    ctx.send({}, 400);
    return;
  }
  try {
    const { roles } = parsed.data;
    const roleService = getRoleService();
    await roleService.update(roles);
    ctx.send({}, 204);
  } catch (e) {
    strapi.log.error(e);
    ctx.send({}, 400);
  }
}

export default {
  find,
  update,
};
