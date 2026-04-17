import { Readable } from 'node:stream';
import type { StrapiContext } from '../types';
import { getAuditLogService } from '../utils/services';
import { setNdjsonAttachmentHeaders } from '../utils/http';

const EXPORT_PAGE_SIZE = 500;

async function* ndjsonRowStream(service: {
  find: (opts: { page: number; pageSize: number }) => Promise<{
    results: Array<{
      createdAt: string;
      action: string;
      email?: string | null;
      ip?: string | null;
      details: string | null;
    }>;
  }>;
}): AsyncGenerator<Buffer> {
  let page = 1;
  while (true) {
    const { results } = await service.find({ page, pageSize: EXPORT_PAGE_SIZE });
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

function errorAwareNdjsonStream(service: {
  find: (opts: { page: number; pageSize: number }) => Promise<{
    results: Array<{
      createdAt: string;
      action: string;
      email?: string | null;
      ip?: string | null;
      details: string | null;
    }>;
  }>;
}): Readable {
  const gen = ndjsonRowStream(service);
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
  return getAuditLogService()
    .find({ page, pageSize })
    .then((result) => {
      ctx.body = result;
    });
}

async function exportLogs(ctx: StrapiContext): Promise<void> {
  strapi = ctx.strapi;
  setNdjsonAttachmentHeaders(ctx, 'strapi-oidc-audit-log');

  const service = getAuditLogService();
  ctx.body = errorAwareNdjsonStream(service);
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
