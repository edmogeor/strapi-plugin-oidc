import { describe, it, expect } from 'vitest';
import qs from 'qs';
import { buildQueryString } from '../../../admin/src/components/AuditLog/queryString';

const parse = (s: string) => qs.parse(s);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const or = (parsed.filters as any)?.action?.$or;
      expect(Array.isArray(or)).toBe(true);
      expect(or[0].$eq).toBe('login_success');
    });

    it('encodes multiple actions', () => {
      const parsed = parse(buildQueryString({ filters: { action: ['login_success', 'logout'] } }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const or = (parsed.filters as any)?.action?.$or;
      expect(or).toHaveLength(2);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(or.map((c: any) => c.$eq)).toEqual(['login_success', 'logout']);
    });
  });

  describe('email filter', () => {
    it('encodes email values as $or of $contains conditions', () => {
      const parsed = parse(buildQueryString({ filters: { email: ['test@company.com'] } }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const or = (parsed.filters as any)?.email?.$or;
      expect(or[0].$contains).toBe('test@company.com');
    });
  });

  describe('ip filter', () => {
    it('encodes ip values as $or of $contains conditions', () => {
      const parsed = parse(buildQueryString({ filters: { ip: ['192.168'] } }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const or = (parsed.filters as any)?.ip?.$or;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inClause = (parsed.filters as any)?.createdAt?.$in as string[];
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inClause = (parsed.filters as any)?.createdAt?.$in as string[];
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = parsed.filters as any;
    expect(f?.action?.$or).toBeDefined();
    expect(f?.email?.$or).toBeDefined();
    expect(f?.createdAt?.$in).toBeDefined();
    expect(parsed.page).toBe('1');
    expect(parsed.pageSize).toBe('25');
  });
});
