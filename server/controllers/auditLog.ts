import { Readable } from 'node:stream';
import { errorMessages } from '../error-strings';
import type { StrapiContext, AuditLogService } from '../types';
import { getAuditLogService } from '../utils/services';
import { setNdjsonAttachmentHeaders } from '../utils/http';
import { parseAuditLogFilters, ValidationError, type AuditLogFilters } from '../audit-log-filters';

const EXPORT_PAGE_SIZE = 500;

async function* ndjsonRowStream(
  service: AuditLogService,
  filters?: AuditLogFilters,
): AsyncGenerator<Buffer> {
  let page = 1;
  while (true) {
    const { results } = await service.find({ page, pageSize: EXPORT_PAGE_SIZE, filters });
    if (results.length === 0) return;

    let chunk = '';
    for (const row of results) {
      chunk +=
        JSON.stringify({
          datetime: row.createdAt,
          action: row.action,
          email: row.email ?? null,
          ip: row.ip ?? null,
          details: row.details,
        }) + '\n';
    }
    yield Buffer.from(chunk, 'utf8');

    if (results.length < EXPORT_PAGE_SIZE) return;
    page++;
  }
}

function errorAwareNdjsonStream(
  strapi: StrapiContext['strapi'],
  service: AuditLogService,
  filters?: AuditLogFilters,
): Readable {
  const gen = ndjsonRowStream(service, filters);
  const readable = Readable.from(gen);
  readable.on('error', (err) => {
    strapi.log.error({ phase: 'audit_log_export', err }, errorMessages.AUDIT_LOG_EXPORT_ERROR);
  });
  return readable;
}

function parseFiltersOr400(ctx: StrapiContext): AuditLogFilters | null {
  try {
    return parseAuditLogFilters(ctx.query);
  } catch (err) {
    ctx.status = 400;
    ctx.body = { message: err instanceof ValidationError ? err.message : 'Invalid filters' };
    return null;
  }
}

async function find(ctx: StrapiContext): Promise<void> {
  const filters = parseFiltersOr400(ctx);
  if (!filters) return;

  const page = Math.max(1, Number(ctx.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(ctx.query.pageSize) || 25));
  ctx.body = await getAuditLogService().find({ page, pageSize, filters });
}

async function exportLogs(ctx: StrapiContext): Promise<void> {
  const filters = parseFiltersOr400(ctx);
  if (!filters) return;

  setNdjsonAttachmentHeaders(ctx, 'strapi-oidc-audit-log');
  ctx.body = errorAwareNdjsonStream(ctx.strapi, getAuditLogService(), filters);
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
