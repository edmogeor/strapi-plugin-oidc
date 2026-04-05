export default function roleService({ strapi }) {
  return {
    SSO_TYPE_OIDC: '4',
    ssoRoles() {
      return [
        {
          'oauth_type': this.SSO_TYPE_OIDC,
          name: 'OIDC'
        },
      ];
    },
    async oidcRoles() {
      return await strapi
        .query('plugin::strapi-plugin-oidc.roles')
        .findOne({
          where: {
            'oauth_type': this.SSO_TYPE_OIDC
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
          const ssoRole = await query.findOne({ where: { 'oauth_type': role['oauth_type'] } });
          if (ssoRole) {
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
