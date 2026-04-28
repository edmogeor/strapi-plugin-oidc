import qs from 'qs';
import type { FilterState } from './types';

function toWireFilters(f: FilterState) {
  const out: Record<string, unknown> = {};
  if (f.action?.length) out.action = { $or: f.action.map((v) => ({ $eq: v })) };
  if (f.email?.length) out.email = { $or: f.email.map((v) => ({ $contains: v })) };
  if (f.ip?.length) out.ip = { $or: f.ip.map((v) => ({ $contains: v })) };
  if (f.createdAt?.length) {
    const allDates = f.createdAt.flatMap((s) => s.dates);
    const deduped = [...new Set(allDates)];
    out.createdAt = { $in: deduped };
  }
  return out;
}

export function buildQueryString(params: {
  filters?: FilterState;
  page?: number;
  pageSize?: number;
}) {
  const { filters, ...rest } = params;
  return qs.stringify(
    { ...rest, filters: filters ? toWireFilters(filters) : undefined },
    { encodeValuesOnly: true },
  );
}
