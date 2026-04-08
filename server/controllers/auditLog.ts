import type { StrapiContext, AuditLogService } from '../types';

function getAuditLogService(): AuditLogService {
  return strapi.plugin('strapi-plugin-oidc').service('auditLog') as AuditLogService;
}

async function find(ctx: StrapiContext): Promise<void> {
  const page = Math.max(1, Number(ctx.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(ctx.query.pageSize) || 25));
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

async function clearAll(ctx: StrapiContext): Promise<void> {
  await getAuditLogService().clearAll();
  ctx.status = 204;
}

export default {
  find,
  export: exportLogs,
  clearAll,
};
