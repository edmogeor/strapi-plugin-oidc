import { Readable } from 'node:stream';
import type { StrapiContext, AuditLogService } from '../types';
import { getAuditLogService } from '../utils/services';
import { setNdjsonAttachmentHeaders } from '../utils/http';
import { parseAuditLogFilters } from '../audit-log-filters';

import type { AuditLogFilters } from '../types';

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

function errorAwareNdjsonStream(service: AuditLogService, filters?: AuditLogFilters): Readable {
  const gen = ndjsonRowStream(service, filters);
  const readable = Readable.from(gen);
  readable.on('error', (err) => {
    strapi.log.error({ phase: 'audit_log_export', err }, 'NDJSON export stream failed');
  });
  return readable;
}

let strapi: StrapiContext['strapi'];

function find(ctx: StrapiContext): Promise<void> {
  strapi = ctx.strapi;
  const page = Math.max(1, Number(ctx.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(ctx.query.pageSize) || 25));

  let filters;
  try {
    filters = parseAuditLogFilters(ctx.query.filters);
  } catch (err) {
    ctx.status = 400;
    ctx.body = { message: err instanceof Error ? err.message : 'Invalid filters' };
    return Promise.resolve();
  }

  return getAuditLogService()
    .find({ page, pageSize, filters })
    .then((result) => {
      ctx.body = result;
    });
}

async function exportLogs(ctx: StrapiContext): Promise<void> {
  strapi = ctx.strapi;
  setNdjsonAttachmentHeaders(ctx, 'strapi-oidc-audit-log');

  let filters;
  try {
    filters = parseAuditLogFilters(ctx.query.filters);
  } catch (err) {
    ctx.status = 400;
    ctx.body = { message: err instanceof Error ? err.message : 'Invalid filters' };
    return;
  }

  const service = getAuditLogService();
  ctx.body = errorAwareNdjsonStream(service, filters);
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
