import type { Core } from '@strapi/types';
import type { AuditEntry, AuditLogRecord } from '../types';
import type { AuditLogFilters } from '../audit-log-filters';
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

interface AuditLogResult {
  results: Array<AuditLogRecord & { details: string | null }>;
  pagination: { page: number; pageSize: number; total: number; pageCount: number };
}

type StrapiWhereClause = Record<string, unknown>;

const STRING_OP_MAP: Record<string, (v: unknown) => unknown> = {
  $eq: (v) => v,
  $ne: (v) => ({ $ne: v }),
  $contains: (v) => ({ $containsi: v }),
  $notContains: (v) => ({ $notContainsi: v }),
  $startsWith: (v) => ({ $startsWith: v }),
  $endsWith: (v) => ({ $endsWith: v }),
  $null: (v) => (v === true ? null : undefined),
  $notNull: (v) => (v === true ? { $notNull: true } : undefined),
};

const DATE_OP_MAP: Record<string, (v: unknown) => unknown> = {
  $eq: (v) => v,
  $gt: (v) => ({ $gt: v }),
  $gte: (v) => ({ $gte: v }),
  $lt: (v) => ({ $lt: v }),
  $lte: (v) => ({ $lte: v }),
  $between: (v) => ({ $between: v }),
};

const ACTION_OP_MAP: Record<string, (v: unknown) => unknown> = {
  $eq: (v) => v,
  $ne: (v) => ({ $ne: v }),
  $in: (v) => ({ $in: v }),
  $notIn: (v) => ({ $notIn: v }),
};

function mapFieldFilter(
  conditions: StrapiWhereClause[],
  field: string,
  filter: Record<string, unknown>,
  opMap: Record<string, (v: unknown) => unknown>,
): void {
  for (const [op, value] of Object.entries(filter)) {
    const transform = opMap[op];
    if (!transform) continue;
    const result = transform(value);
    if (result !== undefined) conditions.push({ [field]: result });
  }
}

function buildWhereClause(filters: AuditLogFilters): StrapiWhereClause {
  const conditions: StrapiWhereClause[] = [];

  if (filters.action) mapFieldFilter(conditions, 'action', filters.action, ACTION_OP_MAP);
  if (filters.email) mapFieldFilter(conditions, 'email', filters.email, STRING_OP_MAP);
  if (filters.ip) mapFieldFilter(conditions, 'ip', filters.ip, STRING_OP_MAP);
  if (filters.createdAt) mapFieldFilter(conditions, 'createdAt', filters.createdAt, DATE_OP_MAP);

  if (filters.q) {
    conditions.push({
      $or: [{ email: { $containsi: filters.q } }, { ip: { $containsi: filters.q } }],
    });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
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
      let results;
      let total;

      if (filters && Object.keys(filters).length > 0) {
        const whereClause = buildWhereClause(filters);
        const dbQuery = strapi.db.query('plugin::strapi-plugin-oidc.audit-log');

        [results, total] = await Promise.all([
          dbQuery.findMany({
            where: whereClause,
            orderBy: [{ createdAt: 'desc' }],
            limit: pageSize,
            offset: (page - 1) * pageSize,
          }),
          dbQuery.count({ where: whereClause }),
        ]);
      } else {
        results = await (
          strapi.db.query('plugin::strapi-plugin-oidc.audit-log') as ReturnType<
            typeof strapi.db.query
          > & {
            findPage: (opts: {
              sort: { createdAt: string };
              page: number;
              pageSize: number;
            }) => Promise<{
              results: AuditLogRecord[];
              pagination: { page: number; pageSize: number; total: number; pageCount: number };
            }>;
          }
        ).findPage({
          sort: { createdAt: 'desc' },
          page,
          pageSize,
        });

        total = results.pagination.total;
        results = results.results;
      }

      const mappedResults = (results as AuditLogRecord[]).map((row) => ({
        ...row,
        details: row.detailsKey ? translateDetails(row.detailsKey, row.detailsParams) : null,
      }));

      return {
        results: mappedResults,
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
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
      await strapi.db
        .query('plugin::strapi-plugin-oidc.audit-log')
        .deleteMany({ where: { createdAt: { $lt: cutoff } } });
    },
  };
}
