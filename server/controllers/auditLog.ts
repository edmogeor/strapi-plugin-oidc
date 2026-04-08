import type { StrapiContext, AuditLogService } from '../types';

function getAuditLogService(): AuditLogService {
  return strapi.plugin('strapi-plugin-oidc').service('auditLog') as AuditLogService;
}

async function find(ctx: StrapiContext): Promise<void> {
  const page = ctx.query.page ? Number(ctx.query.page) : 1;
  const pageSize = ctx.query.pageSize ? Number(ctx.query.pageSize) : 25;
  ctx.body = await getAuditLogService().find({ page, pageSize });
}

async function exportLogs(ctx: StrapiContext): Promise<void> {
  const rows = await getAuditLogService().findAll();
  ctx.set('Content-Type', 'application/x-ndjson');
  ctx.set(
    'Content-Disposition',
    `attachment; filename="oidc-audit-log-${new Date().toISOString().slice(0, 10)}.ndjson"`,
  );
  ctx.body = rows.map((r) => JSON.stringify(r)).join('\n');
}

export default {
  find,
  export: exportLogs,
};
