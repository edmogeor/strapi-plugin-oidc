import type { Core } from '@strapi/types';
import type { AuditEntry, AuditLogRecord, AuditLogFilters } from '../types';
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

type StringFieldFilter = Partial<Record<string, string | boolean>>;

function addStringFieldConditions(
  conditions: StrapiWhereClause[],
  field: string,
  filter: StringFieldFilter,
): void {
  if ('$eq' in filter) conditions.push({ [field]: filter.$eq });
  if ('$ne' in filter) conditions.push({ [field]: { $ne: filter.$ne } });
  if ('$contains' in filter) conditions.push({ [field]: { $containsi: filter.$contains } });
  if ('$notContains' in filter)
    conditions.push({ [field]: { $notContainsi: filter.$notContains } });
  if ('$startsWith' in filter) conditions.push({ [field]: { $startsWith: filter.$startsWith } });
  if ('$endsWith' in filter) conditions.push({ [field]: { $endsWith: filter.$endsWith } });
  if ('$null' in filter && filter.$null === true) conditions.push({ [field]: null });
  if ('$notNull' in filter && filter.$notNull === true)
    conditions.push({ [field]: { $notNull: true } });
}

// fallow-ignore-next-line complexity
function buildWhereClause(filters: AuditLogFilters): StrapiWhereClause {
  const conditions: StrapiWhereClause[] = [];

  if (filters.action) {
    const af = filters.action;
    if ('$eq' in af) conditions.push({ action: af.$eq });
    if ('$ne' in af) conditions.push({ action: { $ne: af.$ne } });
    if ('$in' in af) conditions.push({ action: { $in: af.$in } });
    if ('$notIn' in af) conditions.push({ action: { $notIn: af.$notIn } });
  }

  if (filters.email) addStringFieldConditions(conditions, 'email', filters.email);
  if (filters.ip) addStringFieldConditions(conditions, 'ip', filters.ip);

  if (filters.createdAt) {
    const cf = filters.createdAt;
    if ('$eq' in cf) conditions.push({ createdAt: cf.$eq });
    if ('$gt' in cf) conditions.push({ createdAt: { $gt: cf.$gt } });
    if ('$gte' in cf) conditions.push({ createdAt: { $gte: cf.$gte } });
    if ('$lt' in cf) conditions.push({ createdAt: { $lt: cf.$lt } });
    if ('$lte' in cf) conditions.push({ createdAt: { $lte: cf.$lte } });
    if ('$between' in cf) conditions.push({ createdAt: { $between: cf.$between } });
  }

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
