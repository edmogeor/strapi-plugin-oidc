import type { AuditEntry, AuditLogRecord } from '../types';
import { isAuditLogEnabled } from '../utils/pluginConfig';
import en from '../../translations/locales/en.json';

function interpolate(str: string, params?: Record<string, string>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

function translateDetails(key: string, params?: Record<string, string>): string | null {
  const translation = en[`audit.${key}` as keyof typeof en] as string | undefined;
  if (!translation) return null;
  return interpolate(translation, params);
}

export default function auditLogService({ strapi }) {
  return {
    async log({ action, email, ip, detailsKey, detailsParams }: AuditEntry): Promise<void> {
      if (!isAuditLogEnabled()) return;

      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').create({
        data: {
          action,
          email: email ?? null,
          ip: ip ?? null,
          detailsKey: detailsKey ?? null,
          detailsParams: detailsParams ?? null,
        },
      });

      const eventHub = strapi.serviceMap?.get?.('eventHub') ?? strapi.eventHub;
      if (eventHub) {
        eventHub.emit(`strapi-plugin-oidc::auth.${action}`, {
          email,
          ip,
          provider: 'strapi-plugin-oidc',
        });
      }
    },

    async find({ page = 1, pageSize = 25 }: { page?: number; pageSize?: number } = {}): Promise<{
      results: (Omit<AuditLogRecord, 'detailsKey' | 'detailsParams'> & {
        details: string | null;
      })[];
      pagination: { page: number; pageSize: number; total: number; pageCount: number };
    }> {
      const result = await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').findPage({
        sort: { createdAt: 'desc' },
        page,
        pageSize,
      });

      const results = result.results.map((row) => ({
        ...row,
        details: row.detailsKey ? translateDetails(row.detailsKey, row.detailsParams) : null,
      }));

      return {
        results,
        pagination: result.pagination,
      };
    },

    async clearAll(): Promise<void> {
      const BATCH_SIZE = 1000;
      let deletedCount: number;
      do {
        const result = await strapi.db
          .query('plugin::strapi-plugin-oidc.audit-log')
          .deleteMany({ limit: BATCH_SIZE });
        deletedCount = result.count;
      } while (deletedCount === BATCH_SIZE);
    },

    async cleanup(retentionDays: number): Promise<void> {
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
      await strapi.db
        .query('plugin::strapi-plugin-oidc.audit-log')
        .deleteMany({ where: { createdAt: { $lt: cutoff } } });
    },
  };
}
