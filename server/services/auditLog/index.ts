import type { Core } from '@strapi/types';
import type { AuditEntry, AuditLogRecord } from '../../types';
import type { AuditLogFilters } from '../../audit-log-filters';
import { isAuditLogEnabled } from '../../utils/pluginConfig';
import { translateDetails } from './translations';
import { buildWhereClause, DAY_MS } from './queryBuilder';

interface AuditLogResult {
  results: Array<AuditLogRecord & { details: string | null }>;
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
}

export default function auditLogService({ strapi }: { strapi: Core.Strapi }) {
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

      const eventHub =
        (
          strapi as Core.Strapi & {
            serviceMap?: {
              get: (name: string) => { emit: (event: string, data: unknown) => void };
            };
          }
        ).serviceMap?.get?.('eventHub') ?? strapi.eventHub;
      if (eventHub) {
        eventHub.emit(`strapi-plugin-oidc::auth.${action}`, {
          email,
          ip,
          provider: 'strapi-plugin-oidc',
        });
      }
    },

    async find({
      page = 1,
      pageSize = 25,
      filters,
    }: {
      page?: number;
      pageSize?: number;
      filters?: AuditLogFilters;
    } = {}): Promise<AuditLogResult> {
      const where = filters ? buildWhereClause(filters) : {};
      const dbQuery = strapi.db.query('plugin::strapi-plugin-oidc.audit-log');

      const [rows, total] = (await Promise.all([
        dbQuery.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }],
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }),
        dbQuery.count({ where }),
      ])) as [AuditLogRecord[], number];

      return {
        results: rows.map((row) => ({
          ...row,
          details: row.detailsKey ? translateDetails(row.detailsKey, row.detailsParams) : null,
        })),
        pagination: {
          page,
          pageSize,
          total,
          pageCount: Math.ceil(total / pageSize),
        },
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
      const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
      await strapi.db
        .query('plugin::strapi-plugin-oidc.audit-log')
        .deleteMany({ where: { createdAt: { $lt: cutoff } } });
    },
  };
}
