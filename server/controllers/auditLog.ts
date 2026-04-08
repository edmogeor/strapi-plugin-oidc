import type { StrapiContext, AuditLogService } from '../types';

export default ({ strapi }) => ({
  async find(ctx: StrapiContext): Promise<void> {
    const page = ctx.query.page ? Number(ctx.query.page) : 1;
    const pageSize = ctx.query.pageSize ? Number(ctx.query.pageSize) : 25;
    const service = strapi.plugin('strapi-plugin-oidc').service('auditLog') as AuditLogService;
    ctx.body = await service.find({ page, pageSize });
  },

  async export(ctx: StrapiContext): Promise<void> {
    const service = strapi.plugin('strapi-plugin-oidc').service('auditLog') as AuditLogService;
    const rows = await service.findAll();
    ctx.set('Content-Type', 'application/x-ndjson');
    ctx.set(
      'Content-Disposition',
      `attachment; filename="oidc-audit-log-${new Date().toISOString().slice(0, 10)}.ndjson"`,
    );
    ctx.body = rows.map((r) => JSON.stringify(r)).join('\n');
  },
});
