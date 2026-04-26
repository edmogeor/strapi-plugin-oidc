import { describe, it, expect } from 'vitest';
import { buildWhereClause } from '../../services/auditLog/queryBuilder';

describe('buildWhereClause', () => {
  describe('empty filters', () => {
    it('returns {} for empty filters', () => {
      expect(buildWhereClause({})).toEqual({});
    });
  });

  describe('condition wrapping', () => {
    it('returns the condition directly when only one filter is present', () => {
      const result = buildWhereClause({ action: { $eq: 'login_success' } });
      expect(result).toEqual({ action: 'login_success' });
      expect(result).not.toHaveProperty('$and');
    });

    it('wraps multiple conditions in $and', () => {
      const result = buildWhereClause({
        action: { $eq: 'login_success' },
        email: { $eq: 'test@test.com' },
      });
      expect(result).toEqual({
        $and: [{ action: 'login_success' }, { email: 'test@test.com' }],
      });
    });
  });

  describe('action filter', () => {
    it('maps $eq to a direct value', () => {
      expect(buildWhereClause({ action: { $eq: 'login_success' } })).toEqual({
        action: 'login_success',
      });
    });

    it('maps $in to { $in: [...] }', () => {
      expect(buildWhereClause({ action: { $in: ['login_success', 'login_failure'] } })).toEqual({
        action: { $in: ['login_success', 'login_failure'] },
      });
    });
  });

  describe('string filters (email / ip)', () => {
    it('maps $eq to a direct value', () => {
      expect(buildWhereClause({ email: { $eq: 'test@test.com' } })).toEqual({
        email: 'test@test.com',
      });
    });

    it('maps $contains to $containsi (case-insensitive Strapi op)', () => {
      expect(buildWhereClause({ email: { $contains: 'test' } })).toEqual({
        email: { $containsi: 'test' },
      });
    });

    it('maps $endsWith', () => {
      expect(buildWhereClause({ email: { $endsWith: '@company.com' } })).toEqual({
        email: { $endsWith: '@company.com' },
      });
    });

    it('maps $null: true to null', () => {
      expect(buildWhereClause({ email: { $null: true } })).toEqual({ email: null });
    });

    it('skips $null: false — produces no condition', () => {
      expect(buildWhereClause({ email: { $null: false } })).toEqual({});
    });

    it('maps $notNull: true to { $notNull: true }', () => {
      expect(buildWhereClause({ email: { $notNull: true } })).toEqual({
        email: { $notNull: true },
      });
    });

    it('skips $notNull: false — produces no condition', () => {
      expect(buildWhereClause({ email: { $notNull: false } })).toEqual({});
    });

    it('applies the same string ops to the ip field', () => {
      expect(buildWhereClause({ ip: { $contains: '192.168' } })).toEqual({
        ip: { $containsi: '192.168' },
      });
    });

    it('ignores unrecognised ops', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(buildWhereClause({ email: { $gt: 'x' } as any })).toEqual({});
    });
  });

  describe('createdAt filter', () => {
    const DAY = '2024-01-15T00:00:00.000Z';
    const NEXT_DAY = '2024-01-16T00:00:00.000Z';
    const DAY2 = '2024-01-16T00:00:00.000Z';
    const NEXT_DAY2 = '2024-01-17T00:00:00.000Z';

    it('maps $gte', () => {
      expect(buildWhereClause({ createdAt: { $gte: DAY } })).toEqual({
        createdAt: { $gte: DAY },
      });
    });

    it('maps $lt', () => {
      expect(buildWhereClause({ createdAt: { $lt: DAY } })).toEqual({
        createdAt: { $lt: DAY },
      });
    });

    it('maps $lte', () => {
      expect(buildWhereClause({ createdAt: { $lte: DAY } })).toEqual({
        createdAt: { $lte: DAY },
      });
    });

    it('maps $between', () => {
      expect(buildWhereClause({ createdAt: { $between: [DAY, NEXT_DAY] } })).toEqual({
        createdAt: { $between: [DAY, NEXT_DAY] },
      });
    });

    it('expands a single $in day into a [gte, lt) range', () => {
      expect(buildWhereClause({ createdAt: { $in: [DAY] } })).toEqual({
        createdAt: { $gte: DAY, $lt: NEXT_DAY },
      });
    });

    it('expands multiple $in days into an $or of ranges', () => {
      expect(buildWhereClause({ createdAt: { $in: [DAY, DAY2] } })).toEqual({
        $or: [
          { createdAt: { $gte: DAY, $lt: NEXT_DAY } },
          { createdAt: { $gte: DAY2, $lt: NEXT_DAY2 } },
        ],
      });
    });
  });
});
