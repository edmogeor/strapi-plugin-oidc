import { describe, it, expect } from 'vitest';
import qs from 'qs';
import { buildQueryString } from '../../../admin/src/components/AuditLog/queryString';

const parse = (s: string) => qs.parse(s);

function getFilters(parsed: qs.ParsedQs): Record<string, unknown> {
  const filters = parsed.filters;
  if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
    return filters as Record<string, unknown>;
  }
  return {};
}

function getOrArray(filters: Record<string, unknown>, key: string): Array<Record<string, string>> {
  const entry = filters[key];
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const or = (entry as Record<string, unknown>).$or;
    if (Array.isArray(or)) return or as Array<Record<string, string>>;
  }
  return [];
}

function getInArray(filters: Record<string, unknown>, key: string): string[] {
  const entry = filters[key];
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    const arr = (entry as Record<string, unknown>).$in;
    if (Array.isArray(arr)) return arr as string[];
  }
  return [];
}

describe('buildQueryString', () => {
  it('returns empty string when given no params', () => {
    expect(buildQueryString({})).toBe('');
  });

  it('encodes page and pageSize', () => {
    const result = buildQueryString({ page: 2, pageSize: 25 });
    expect(result).toContain('page=2');
    expect(result).toContain('pageSize=25');
  });

  it('omits filters key when filters is undefined', () => {
    expect(buildQueryString({ page: 1 })).not.toContain('filters');
  });

  it('omits filters key when all filter fields are empty', () => {
    expect(buildQueryString({ filters: {} })).not.toContain('filters');
  });

  describe('action filter', () => {
    it('encodes a single action as an $or of $eq conditions', () => {
      const parsed = parse(buildQueryString({ filters: { action: ['login_success'] } }));
      const or = getOrArray(getFilters(parsed), 'action');
      expect(or).toHaveLength(1);
      expect(or[0].$eq).toBe('login_success');
    });

    it('encodes multiple actions', () => {
      const parsed = parse(buildQueryString({ filters: { action: ['login_success', 'logout'] } }));
      const or = getOrArray(getFilters(parsed), 'action');
      expect(or).toHaveLength(2);
      expect(or.map((c) => c.$eq)).toEqual(['login_success', 'logout']);
    });
  });

  describe('email filter', () => {
    it('encodes email values as $or of $contains conditions', () => {
      const parsed = parse(buildQueryString({ filters: { email: ['test@company.com'] } }));
      const or = getOrArray(getFilters(parsed), 'email');
      expect(or[0].$contains).toBe('test@company.com');
    });
  });

  describe('ip filter', () => {
    it('encodes ip values as $or of $contains conditions', () => {
      const parsed = parse(buildQueryString({ filters: { ip: ['192.168'] } }));
      const or = getOrArray(getFilters(parsed), 'ip');
      expect(or[0].$contains).toBe('192.168');
    });
  });

  describe('createdAt filter', () => {
    const D1 = '2024-01-15T00:00:00.000Z';
    const D2 = '2024-01-16T00:00:00.000Z';

    it('flattens date selections into a single $in array', () => {
      const parsed = parse(
        buildQueryString({
          filters: { createdAt: [{ dates: [D1, D2], display: 'Jan 15–16' }] },
        }),
      );
      const inClause = getInArray(getFilters(parsed), 'createdAt');
      expect(inClause).toContain(D1);
      expect(inClause).toContain(D2);
    });

    it('deduplicates dates that appear in multiple selections', () => {
      const parsed = parse(
        buildQueryString({
          filters: {
            createdAt: [
              { dates: [D1], display: 'Jan 15' },
              { dates: [D1, D2], display: 'Jan 15–16' },
            ],
          },
        }),
      );
      const inClause = getInArray(getFilters(parsed), 'createdAt');
      expect(inClause.filter((d) => d === D1)).toHaveLength(1);
    });
  });

  it('encodes multiple filter types and pagination together', () => {
    const D = '2024-01-15T00:00:00.000Z';
    const parsed = parse(
      buildQueryString({
        page: 1,
        pageSize: 25,
        filters: {
          action: ['login_success'],
          email: ['test@company.com'],
          createdAt: [{ dates: [D], display: 'Jan 15' }],
        },
      }),
    );
    const f = getFilters(parsed);
    expect(getOrArray(f, 'action')).toHaveLength(1);
    expect(getOrArray(f, 'email')).toHaveLength(1);
    expect(getInArray(f, 'createdAt')).toHaveLength(1);
    expect(parsed.page).toBe('1');
    expect(parsed.pageSize).toBe('25');
  });
});
