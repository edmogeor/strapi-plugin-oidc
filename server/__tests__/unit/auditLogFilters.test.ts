import { describe, it, expect } from 'vitest';
import { parseAuditLogFilters, ValidationError } from '../../audit-log-filters';

describe('parseAuditLogFilters', () => {
  describe('empty / missing filters', () => {
    it('returns {} for an empty query', () => {
      expect(parseAuditLogFilters({})).toEqual({});
    });

    it('returns {} when filters key is absent', () => {
      expect(parseAuditLogFilters({ page: 1, sort: 'createdAt:desc' })).toEqual({});
    });

    it('returns {} for an empty filters object', () => {
      expect(parseAuditLogFilters({ filters: {} })).toEqual({});
    });
  });

  describe('valid filters pass through', () => {
    it('accepts action.$eq with a known audit action', () => {
      const result = parseAuditLogFilters({ filters: { action: { $eq: 'login_success' } } });
      expect(result.action).toEqual({ $eq: 'login_success' });
    });

    it('accepts action.$in with multiple known actions', () => {
      const result = parseAuditLogFilters({
        filters: { action: { $in: ['login_success', 'logout'] } },
      });
      expect(result.action).toEqual({ $in: ['login_success', 'logout'] });
    });

    it('accepts email.$eq', () => {
      const result = parseAuditLogFilters({ filters: { email: { $eq: 'test@test.com' } } });
      expect(result.email).toEqual({ $eq: 'test@test.com' });
    });

    it('accepts email.$contains', () => {
      const result = parseAuditLogFilters({ filters: { email: { $contains: 'test' } } });
      expect(result.email).toEqual({ $contains: 'test' });
    });

    it('accepts email.$endsWith', () => {
      const result = parseAuditLogFilters({
        filters: { email: { $endsWith: '@company.com' } },
      });
      expect(result.email).toEqual({ $endsWith: '@company.com' });
    });

    it('accepts email.$null', () => {
      const result = parseAuditLogFilters({ filters: { email: { $null: true } } });
      expect(result.email).toEqual({ $null: true });
    });

    it('accepts email.$notNull', () => {
      const result = parseAuditLogFilters({ filters: { email: { $notNull: true } } });
      expect(result.email).toEqual({ $notNull: true });
    });

    it('accepts ip filter', () => {
      const result = parseAuditLogFilters({ filters: { ip: { $eq: '127.0.0.1' } } });
      expect(result.ip).toEqual({ $eq: '127.0.0.1' });
    });

    it('accepts createdAt.$gte with a valid ISO datetime', () => {
      const iso = '2024-01-15T00:00:00.000Z';
      const result = parseAuditLogFilters({ filters: { createdAt: { $gte: iso } } });
      expect(result.createdAt).toEqual({ $gte: iso });
    });

    it('accepts createdAt.$between', () => {
      const a = '2024-01-15T00:00:00.000Z';
      const b = '2024-01-16T00:00:00.000Z';
      const result = parseAuditLogFilters({ filters: { createdAt: { $between: [a, b] } } });
      expect(result.createdAt).toEqual({ $between: [a, b] });
    });

    it('accepts createdAt.$in with valid ISO datetimes', () => {
      const iso = '2024-01-15T00:00:00.000Z';
      const result = parseAuditLogFilters({ filters: { createdAt: { $in: [iso] } } });
      expect(result.createdAt).toEqual({ $in: [iso] });
    });

    it('allows unknown top-level fields (passthrough schema)', () => {
      expect(() =>
        parseAuditLogFilters({ filters: {}, page: 1, sort: 'createdAt:desc' }),
      ).not.toThrow();
    });
  });

  describe('throws ValidationError for invalid input', () => {
    it('rejects an action value not in AUDIT_ACTIONS', () => {
      expect(() =>
        parseAuditLogFilters({ filters: { action: { $eq: 'not_a_real_action' } } }),
      ).toThrow(ValidationError);
    });

    it('rejects an unknown action operator (strict schema)', () => {
      expect(() => parseAuditLogFilters({ filters: { action: { $gt: 'login_success' } } })).toThrow(
        ValidationError,
      );
    });

    it('rejects a date-only string in createdAt.$gte (requires UTC ms precision)', () => {
      expect(() =>
        parseAuditLogFilters({ filters: { createdAt: { $gte: '2024-01-15' } } }),
      ).toThrow(ValidationError);
    });

    it('rejects a non-ISO string in createdAt.$in', () => {
      expect(() =>
        parseAuditLogFilters({ filters: { createdAt: { $in: ['not-a-date'] } } }),
      ).toThrow(ValidationError);
    });

    it('rejects unknown fields inside filters (strict schema)', () => {
      expect(() => parseAuditLogFilters({ filters: { unknownField: { $eq: 'x' } } })).toThrow(
        ValidationError,
      );
    });

    it('throws a ValidationError with the correct name and a descriptive message', () => {
      let caught: unknown;
      try {
        parseAuditLogFilters({ filters: { action: { $eq: 'bad_action' } } });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ValidationError);
      expect((caught as ValidationError).name).toBe('ValidationError');
      expect((caught as ValidationError).message.length).toBeGreaterThan(0);
    });
  });
});
