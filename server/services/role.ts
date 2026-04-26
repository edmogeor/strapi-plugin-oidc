import type { Core } from '@strapi/types';
import { CONTENT_TYPES } from '../../shared/constants';

interface OidcRoleInput {
  oauth_type: string;
  role: number[];
}

export default function roleService({ strapi }: { strapi: Core.Strapi }) {
  return {
    OIDC_TYPE: '4',
    getOidcRoles() {
      return [
        {
          oauth_type: this.OIDC_TYPE,
          name: 'OIDC',
        },
      ];
    },
    async oidcRoles() {
      return strapi.query(CONTENT_TYPES.ROLES).findOne({
        where: {
          oauth_type: this.OIDC_TYPE,
        },
      });
    },
    async find() {
      return strapi.query(CONTENT_TYPES.ROLES).findMany();
    },
    async update(roles: OidcRoleInput[]) {
      const query = strapi.query(CONTENT_TYPES.ROLES);
      await Promise.all(
        roles.map(async (role: OidcRoleInput) => {
          const oidcRole = await query.findOne({ where: { oauth_type: role.oauth_type } });
          if (oidcRole) {
            await query.update({
              where: { oauth_type: role.oauth_type },
              data: { roles: role.role },
            });
          } else {
            await query.create({
              data: {
                oauth_type: role.oauth_type,
                roles: role.role,
              },
            });
          }
        }),
      );
    },
  };
}
