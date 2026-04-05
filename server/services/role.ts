export default function roleService({ strapi }) {
  return {
    OIDC_TYPE: '4',
    getOidcRoles() {
      return [
        {
          'oauth_type': this.OIDC_TYPE,
          name: 'OIDC'
        },
      ];
    },
    async oidcRoles() {
      return await strapi
        .query('plugin::strapi-plugin-oidc.roles')
        .findOne({
          where: {
            'oauth_type': this.OIDC_TYPE
          }
        });
    },
    async find() {
      return await strapi
        .query('plugin::strapi-plugin-oidc.roles')
        .findMany();
    },
    async update(roles) {
      const query = strapi.query('plugin::strapi-plugin-oidc.roles');
      await Promise.all(
        roles.map(async (role) => {
          const oidcRole = await query.findOne({ where: { 'oauth_type': role['oauth_type'] } });
          if (oidcRole) {
            await query.update({
              where: { 'oauth_type': role['oauth_type'] },
              data: { roles: role.role },
            });
          } else {
            await query.create({
              data: {
                'oauth_type': role['oauth_type'],
                roles: role.role,
              }
            });
          }
        })
      );
    }
  };
}
