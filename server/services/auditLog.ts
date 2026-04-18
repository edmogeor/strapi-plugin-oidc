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
  $contains: (v) => ({ $containsi: v }),
  $endsWith: (v) => ({ $endsWith: v }),
  $null: (v) => (v === true ? null : undefined),
  $notNull: (v) => (v === true ? { $notNull: true } : undefined),
};

const DATE_OP_MAP: Record<string, (v: unknown) => unknown> = {
  $gte: (v) => ({ $gte: v }),
  $lt: (v) => ({ $lt: v }),
  $lte: (v) => ({ $lte: v }),
  $between: (v) => ({ $between: v }),
  // $in is handled separately: each ISO day-start is expanded to a [day, day+1) range.
};

const DAY_MS = 86_400_000;

function nextDayIso(iso: string): string {
  return new Date(new Date(iso).getTime() + DAY_MS).toISOString();
}

function expandCreatedAtInToDayRanges(days: string[]): StrapiWhereClause {
  const ranges = days.map((d) => ({ createdAt: { $gte: d, $lt: nextDayIso(d) } }));
  return ranges.length === 1 ? ranges[0] : { $or: ranges };
}

const ACTION_OP_MAP: Record<string, (v: unknown) => unknown> = {
  $eq: (v) => v,
  $in: (v) => ({ $in: v }),
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
  if (filters.createdAt) {
    const { $in: inDays, ...rest } = filters.createdAt;
    if (Array.isArray(inDays) && inDays.length > 0) {
      conditions.push(expandCreatedAtInToDayRanges(inDays));
    }
    if (Object.keys(rest).length > 0) {
      mapFieldFilter(conditions, 'createdAt', rest, DATE_OP_MAP);
    }
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
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
      await strapi.db
        .query('plugin::strapi-plugin-oidc.audit-log')
        .deleteMany({ where: { createdAt: { $lt: cutoff } } });
    },
  };
}
