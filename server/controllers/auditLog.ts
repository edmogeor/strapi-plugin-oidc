import type { StrapiContext, AuditLogService } from '../types';
import { formatDatetimeForFilename } from '../utils/datetime';

type AuditLogExportRow = {
  id: number;
  createdAt: string;
  action: string;
  email: string | null;
  ip: string | null;
  details: string | null;
};

function getAuditLogService(): AuditLogService {
  return strapi.plugin('strapi-plugin-oidc').service('auditLog') as AuditLogService;
}

async function find(ctx: StrapiContext): Promise<void> {
  const page = Math.max(1, Number(ctx.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(ctx.query.pageSize) || 25));
  ctx.body = await getAuditLogService().find({ page, pageSize });
}

async function exportLogs(ctx: StrapiContext): Promise<void> {
  const datetime = formatDatetimeForFilename(new Date());
  ctx.set('Content-Type', 'application/json');
  ctx.set('Content-Disposition', `attachment; filename="strapi-oidc-audit-log-${datetime}.json"`);

  const service = getAuditLogService();
  const PAGE_SIZE = 1000;
  const allRows: AuditLogExportRow[] = [];
  let page = 1;

  while (true) {
    const { results } = await service.find({ page, pageSize: PAGE_SIZE });
    for (const row of results) {
      allRows.push({
        id: row.id,
        createdAt: row.createdAt,
        action: row.action,
        email: row.email ?? null,
        ip: row.ip ?? null,
        details: row.details,
      });
    }
    if (results.length < PAGE_SIZE) break;
    page++;
  }

  ctx.body = allRows.map((row) => ({
    datetime: row.createdAt,
    action: row.action,
    email: row.email,
    ip: row.ip,
    details: row.details,
  }));
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
