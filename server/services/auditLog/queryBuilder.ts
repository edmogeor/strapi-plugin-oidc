import type { AuditLogFilters } from '../../audit-log-filters';
import { DAY_MS } from '../../../shared/constants';

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
};

const ACTION_OP_MAP: Record<string, (v: unknown) => unknown> = {
  $eq: (v) => v,
  $in: (v) => ({ $in: v }),
};

function nextDayIso(iso: string): string {
  return new Date(new Date(iso).getTime() + DAY_MS).toISOString();
}

function expandCreatedAtInToDayRanges(days: string[]): StrapiWhereClause {
  const ranges = days.map((d) => ({ createdAt: { $gte: d, $lt: nextDayIso(d) } }));
  return ranges.length === 1 ? ranges[0] : { $or: ranges };
}

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

function buildDateConditions(
  conditions: StrapiWhereClause[],
  createdAt: AuditLogFilters['createdAt'],
): void {
  if (!createdAt) return;
  const { $in: inDays, ...rest } = createdAt;
  if (Array.isArray(inDays) && inDays.length > 0) {
    conditions.push(expandCreatedAtInToDayRanges(inDays));
  }
  for (const [op, value] of Object.entries(rest)) {
    const transform = DATE_OP_MAP[op];
    if (transform) {
      const result = transform(value);
      if (result !== undefined) conditions.push({ createdAt: result });
    }
  }
}

export function buildWhereClause(filters: AuditLogFilters): StrapiWhereClause {
  const conditions: StrapiWhereClause[] = [];

  if (filters.action) mapFieldFilter(conditions, 'action', filters.action, ACTION_OP_MAP);
  if (filters.email) mapFieldFilter(conditions, 'email', filters.email, STRING_OP_MAP);
  if (filters.ip) mapFieldFilter(conditions, 'ip', filters.ip, STRING_OP_MAP);
  if (filters.createdAt) buildDateConditions(conditions, filters.createdAt);

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}
