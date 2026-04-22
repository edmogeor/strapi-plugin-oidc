import { describe, it, expect } from 'vitest';
import qs from 'qs';
import { buildQueryString } from './queryString';

function parse(q: string) {
  return qs.parse(q);
}

describe('buildQueryString', () => {
  it('returns empty string when nothing provided', () => {
    expect(buildQueryString({})).toBe('');
  });

  it('serializes page and pageSize without filters', () => {
    expect(parse(buildQueryString({ page: 2, pageSize: 10 }))).toEqual({
      page: '2',
      pageSize: '10',
    });
  });

  it('serializes action filter as $or of $eq', () => {
    expect(parse(buildQueryString({ filters: { action: ['login_success', 'logout'] } }))).toEqual({
      filters: {
        action: {
          $or: [{ $eq: 'login_success' }, { $eq: 'logout' }],
        },
      },
    });
  });

  it('serializes email filter as $or of $contains', () => {
    expect(parse(buildQueryString({ filters: { email: ['a@b.com'] } }))).toEqual({
      filters: { email: { $or: [{ $contains: 'a@b.com' }] } },
    });
  });

  it('serializes ip filter as $or of $contains', () => {
    expect(parse(buildQueryString({ filters: { ip: ['10.0'] } }))).toEqual({
      filters: { ip: { $or: [{ $contains: '10.0' }] } },
    });
  });

  it('flattens and dedupes createdAt date selections', () => {
    const parsed = parse(
      buildQueryString({
        filters: {
          createdAt: [
            { dates: ['2026-04-22', '2026-04-23'] },
            { dates: ['2026-04-23', '2026-04-24'] },
          ] as never,
        },
      }),
    );
    expect(parsed).toEqual({
      filters: { createdAt: { $in: ['2026-04-22', '2026-04-23', '2026-04-24'] } },
    });
  });

  it('omits filter keys with empty arrays', () => {
    expect(parse(buildQueryString({ filters: { action: [], email: [] } }))).toEqual({});
  });

  it('omits filters entirely when undefined', () => {
    expect(parse(buildQueryString({ page: 1 }))).toEqual({ page: '1' });
  });
});
