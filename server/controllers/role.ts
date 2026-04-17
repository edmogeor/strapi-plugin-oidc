import type { Context } from 'koa';
import { getRoleService } from '../utils/services';

interface RoleUpdateBody {
  roles: Array<{ oauth_type: string; role: number[] }>;
}

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
  try {
    const { roles } = ctx.request.body as RoleUpdateBody;
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
