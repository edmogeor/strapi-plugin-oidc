import { describe, it, expect } from 'vitest';
import { buildWhereClause } from '../services/auditLog/queryBuilder';

describe('buildWhereClause', () => {
  it('returns empty object when no filters match', () => {
    expect(buildWhereClause({})).toEqual({});
  });

  it('maps action $eq and $in without transformation', () => {
    expect(buildWhereClause({ action: { $eq: 'login_success' } })).toEqual({
      action: 'login_success',
    });
    expect(buildWhereClause({ action: { $in: ['a', 'b'] } })).toEqual({
      action: { $in: ['a', 'b'] },
    });
  });

  it('maps email $contains to case-insensitive $containsi', () => {
    expect(buildWhereClause({ email: { $contains: 'Example' } })).toEqual({
      email: { $containsi: 'Example' },
    });
  });

  it('maps email $eq, $endsWith, $null, $notNull', () => {
    expect(buildWhereClause({ email: { $eq: 'user@example.com' } })).toEqual({
      email: 'user@example.com',
    });
    expect(buildWhereClause({ email: { $endsWith: '@example.com' } })).toEqual({
      email: { $endsWith: '@example.com' },
    });
    expect(buildWhereClause({ email: { $null: true } })).toEqual({ email: null });
    expect(buildWhereClause({ email: { $notNull: true } })).toEqual({
      email: { $notNull: true },
    });
  });

  it('drops $null/$notNull when value is false', () => {
    expect(buildWhereClause({ email: { $null: false } })).toEqual({});
    expect(buildWhereClause({ email: { $notNull: false } })).toEqual({});
  });

  it('maps ip filters with the string op map', () => {
    expect(buildWhereClause({ ip: { $contains: '10.' } })).toEqual({
      ip: { $containsi: '10.' },
    });
  });

  it('expands createdAt $in to a single-day range when one date', () => {
    expect(buildWhereClause({ createdAt: { $in: ['2026-04-22T00:00:00.000Z'] } })).toEqual({
      createdAt: { $gte: '2026-04-22T00:00:00.000Z', $lt: '2026-04-23T00:00:00.000Z' },
    });
  });

  it('expands createdAt $in to an $or of ranges for multiple days', () => {
    const result = buildWhereClause({
      createdAt: { $in: ['2026-04-22T00:00:00.000Z', '2026-04-24T00:00:00.000Z'] },
    });
    expect(result).toEqual({
      $or: [
        { createdAt: { $gte: '2026-04-22T00:00:00.000Z', $lt: '2026-04-23T00:00:00.000Z' } },
        { createdAt: { $gte: '2026-04-24T00:00:00.000Z', $lt: '2026-04-25T00:00:00.000Z' } },
      ],
    });
  });

  it('maps createdAt comparator ops', () => {
    expect(buildWhereClause({ createdAt: { $gte: '2026-04-22' } })).toEqual({
      createdAt: { $gte: '2026-04-22' },
    });
    expect(buildWhereClause({ createdAt: { $between: ['2026-04-22', '2026-04-23'] } })).toEqual({
      createdAt: { $between: ['2026-04-22', '2026-04-23'] },
    });
  });

  it('combines $in expansion with other createdAt comparators under $and', () => {
    const result = buildWhereClause({
      createdAt: { $in: ['2026-04-22T00:00:00.000Z'], $lt: '2026-05-01' },
    });
    expect(result).toEqual({
      $and: [
        { createdAt: { $gte: '2026-04-22T00:00:00.000Z', $lt: '2026-04-23T00:00:00.000Z' } },
        { createdAt: { $lt: '2026-05-01' } },
      ],
    });
  });

  it('wraps multiple field conditions in $and', () => {
    const result = buildWhereClause({
      action: { $eq: 'login_success' },
      email: { $contains: 'alice' },
    });
    expect(result).toEqual({
      $and: [{ action: 'login_success' }, { email: { $containsi: 'alice' } }],
    });
  });

  it('ignores unknown operators', () => {
    expect(
      buildWhereClause({ email: { $bogus: 'x' } as unknown as Record<string, unknown> }),
    ).toEqual({});
  });
});
