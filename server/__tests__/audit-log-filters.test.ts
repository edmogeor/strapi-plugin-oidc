import { describe, it, expect } from 'vitest';
import { parseAuditLogFilters, ValidationError } from '../audit-log-filters';
import { AUDIT_ACTIONS } from '../../shared/audit-actions';

describe('parseAuditLogFilters', () => {
  it('returns empty object for non-object input', () => {
    expect(parseAuditLogFilters(null)).toEqual({});
    expect(parseAuditLogFilters(undefined)).toEqual({});
    expect(parseAuditLogFilters('string')).toEqual({});
    expect(parseAuditLogFilters(123)).toEqual({});
    expect(parseAuditLogFilters([])).toEqual({});
  });

  it('returns empty object for empty object', () => {
    expect(parseAuditLogFilters({})).toEqual({});
  });

  it('parses action $eq filter', () => {
    const result = parseAuditLogFilters({ filters: { action: { $eq: 'login_success' } } });
    expect(result).toEqual({ action: { $eq: 'login_success' } });
  });

  it('parses action $in filter', () => {
    const result = parseAuditLogFilters({
      filters: { action: { $in: ['login_success', 'user_created'] } },
    });
    expect(result).toEqual({ action: { $in: ['login_success', 'user_created'] } });
  });

  it('parses email $eq filter', () => {
    const result = parseAuditLogFilters({ filters: { email: { $eq: 'test@example.com' } } });
    expect(result).toEqual({ email: { $eq: 'test@example.com' } });
  });

  it('parses email $contains filter', () => {
    const result = parseAuditLogFilters({ filters: { email: { $contains: 'acme' } } });
    expect(result).toEqual({ email: { $contains: 'acme' } });
  });

  it('parses email $endsWith filter', () => {
    const result = parseAuditLogFilters({ filters: { email: { $endsWith: '.edu' } } });
    expect(result).toEqual({ email: { $endsWith: '.edu' } });
  });

  it('parses email $null filter', () => {
    const result = parseAuditLogFilters({ filters: { email: { $null: true } } });
    expect(result).toEqual({ email: { $null: true } });
  });

  it('parses email $notNull filter', () => {
    const result = parseAuditLogFilters({ filters: { email: { $notNull: true } } });
    expect(result).toEqual({ email: { $notNull: true } });
  });

  it('parses ip filters the same as email', () => {
    const ipFilters = { ip: { $contains: '192.168' } };
    const result = parseAuditLogFilters({ filters: ipFilters });
    expect(result).toEqual({ ip: { $contains: '192.168' } });
  });

  it('parses createdAt $gte filter', () => {
    const result = parseAuditLogFilters({
      filters: { createdAt: { $gte: '2024-01-01T00:00:00.000Z' } },
    });
    expect(result).toEqual({ createdAt: { $gte: '2024-01-01T00:00:00.000Z' } });
  });

  it('parses createdAt $lt filter', () => {
    const result = parseAuditLogFilters({
      filters: { createdAt: { $lt: '2024-12-31T00:00:00.000Z' } },
    });
    expect(result).toEqual({ createdAt: { $lt: '2024-12-31T00:00:00.000Z' } });
  });

  it('parses createdAt $lte filter', () => {
    const result = parseAuditLogFilters({
      filters: { createdAt: { $lte: '2024-12-31T00:00:00.000Z' } },
    });
    expect(result).toEqual({ createdAt: { $lte: '2024-12-31T00:00:00.000Z' } });
  });

  it('parses createdAt $between filter with tuple', () => {
    const result = parseAuditLogFilters({
      filters: {
        createdAt: { $between: ['2024-01-01T00:00:00.000Z', '2024-12-31T00:00:00.000Z'] },
      },
    });
    expect(result).toEqual({
      createdAt: { $between: ['2024-01-01T00:00:00.000Z', '2024-12-31T00:00:00.000Z'] },
    });
  });

  it('parses createdAt $in filter with array', () => {
    const result = parseAuditLogFilters({
      filters: {
        createdAt: {
          $in: ['2024-01-01T00:00:00.000Z', '2024-01-15T00:00:00.000Z', '2024-01-31T00:00:00.000Z'],
        },
      },
    });
    expect(result).toEqual({
      createdAt: {
        $in: ['2024-01-01T00:00:00.000Z', '2024-01-15T00:00:00.000Z', '2024-01-31T00:00:00.000Z'],
      },
    });
  });

  it('parses multiple fields together', () => {
    const result = parseAuditLogFilters({
      filters: {
        action: { $eq: 'login_success' },
        email: { $contains: 'acme' },
        createdAt: { $gte: '2024-01-01T00:00:00.000Z' },
      },
    });
    expect(result).toEqual({
      action: { $eq: 'login_success' },
      email: { $contains: 'acme' },
      createdAt: { $gte: '2024-01-01T00:00:00.000Z' },
    });
  });

  it('throws for unknown field', () => {
    expect(() => parseAuditLogFilters({ filters: { unknownField: { $eq: 'value' } } })).toThrow(
      'Unknown filter field: "unknownField"',
    );
  });

  it('throws for unknown operator on action field', () => {
    expect(() => parseAuditLogFilters({ filters: { action: { $contains: 'login' } } })).toThrow(
      'Unknown operator "$contains" for field "action"',
    );
  });

  it('throws for unknown operator on email field', () => {
    expect(() => parseAuditLogFilters({ filters: { email: { $in: ['test'] } } })).toThrow(
      'Unknown operator "$in" for field "email"',
    );
  });

  it('throws for unknown operator on ip field', () => {
    expect(() => parseAuditLogFilters({ filters: { ip: { $in: ['1.1.1.1'] } } })).toThrow(
      'Unknown operator "$in" for field "ip"',
    );
  });

  it('throws for unknown operator on createdAt field', () => {
    expect(() => parseAuditLogFilters({ filters: { createdAt: { $contains: '2024' } } })).toThrow(
      'Unknown operator "$contains" for field "createdAt"',
    );
  });

  it('throws for non-AuditAction value in action $eq', () => {
    expect(() => parseAuditLogFilters({ filters: { action: { $eq: 'invalid_action' } } })).toThrow(
      'Invalid action value "invalid_action" — must be one of:',
    );
  });

  it('rejects removed action operators', () => {
    for (const op of ['$ne', '$notIn'] as const) {
      expect(() =>
        parseAuditLogFilters({ filters: { action: { [op]: 'login_success' } } }),
      ).toThrow(`Unknown operator "${op}" for field "action"`);
    }
  });

  it('rejects removed string-field operators', () => {
    for (const op of ['$ne', '$notContains', '$startsWith'] as const) {
      expect(() => parseAuditLogFilters({ filters: { email: { [op]: 'admin' } } })).toThrow(
        `Unknown operator "${op}" for field "email"`,
      );
    }
  });

  it('rejects removed createdAt operators', () => {
    for (const op of ['$eq', '$gt'] as const) {
      expect(() =>
        parseAuditLogFilters({ filters: { createdAt: { [op]: '2024-01-01T00:00:00.000Z' } } }),
      ).toThrow(`Unknown operator "${op}" for field "createdAt"`);
    }
  });

  it('throws for non-array in action $in', () => {
    expect(() => parseAuditLogFilters({ filters: { action: { $in: 'login_success' } } })).toThrow(
      'Operator "$in" for field "action" requires an array value',
    );
  });

  it('throws for non-AuditAction value in action $in array', () => {
    expect(() =>
      parseAuditLogFilters({ filters: { action: { $in: ['login_success', 'bad'] } } }),
    ).toThrow('Invalid action value "bad" — must be one of:');
  });

  it('throws for $between with non-tuple on createdAt', () => {
    expect(() =>
      parseAuditLogFilters({ filters: { createdAt: { $between: '2024-01-01T00:00:00.000Z' } } }),
    ).toThrow('Operator "$between" for field "createdAt" requires a tuple [start, end]');
  });

  it('throws for $between with wrong tuple length', () => {
    expect(() =>
      parseAuditLogFilters({ filters: { createdAt: { $between: ['2024-01-01T00:00:00.000Z'] } } }),
    ).toThrow('Operator "$between" for field "createdAt" requires a tuple [start, end]');
  });

  it('throws for $between with non-string tuple values', () => {
    expect(() =>
      parseAuditLogFilters({ filters: { createdAt: { $between: [2024, 2025] } } }),
    ).toThrow('Operator "$between" for field "createdAt" requires an ISO-8601 UTC datetime string');
  });

  it('throws for $between with date-only (non-ISO-UTC) strings', () => {
    expect(() =>
      parseAuditLogFilters({ filters: { createdAt: { $between: ['2024-01-01', '2024-12-31'] } } }),
    ).toThrow('Operator "$between" for field "createdAt" requires an ISO-8601 UTC datetime string');
  });

  it('throws for $in with non-array on createdAt', () => {
    expect(() =>
      parseAuditLogFilters({ filters: { createdAt: { $in: '2024-01-01T00:00:00.000Z' } } }),
    ).toThrow('Operator "$in" for field "createdAt" requires an array value');
  });

  it('throws for $in with a date-only (non-ISO-UTC) string in the array', () => {
    expect(() =>
      parseAuditLogFilters({
        filters: { createdAt: { $in: ['2024-01-01T00:00:00.000Z', '2024-01-15'] } },
      }),
    ).toThrow('Operator "$in" for field "createdAt" requires an ISO-8601 UTC datetime string');
  });

  it('throws for $null with non-boolean on email', () => {
    expect(() => parseAuditLogFilters({ filters: { email: { $null: 'yes' } } })).toThrow(
      'Operator "$null" for field "email" requires a boolean value',
    );
  });

  it('throws for $notNull with non-boolean on ip', () => {
    expect(() => parseAuditLogFilters({ filters: { ip: { $notNull: 1 } } })).toThrow(
      'Operator "$notNull" for field "ip" requires a boolean value',
    );
  });

  it('throws for non-string value on string operators', () => {
    expect(() => parseAuditLogFilters({ filters: { email: { $eq: 123 } } })).toThrow(
      'Operator "$eq" for field "email" requires a string value',
    );
  });

  it('throws for non-string value on createdAt operators', () => {
    expect(() => parseAuditLogFilters({ filters: { createdAt: { $gte: 2024 } } })).toThrow(
      'Operator "$gte" for field "createdAt" requires an ISO-8601 UTC datetime string',
    );
  });

  it('throws for date-only (non-ISO-UTC) string on createdAt operators', () => {
    expect(() => parseAuditLogFilters({ filters: { createdAt: { $gte: '2024-01-01' } } })).toThrow(
      'Operator "$gte" for field "createdAt" requires an ISO-8601 UTC datetime string',
    );
  });

  it('throws for non-UTC (local offset) ISO string on createdAt operators', () => {
    expect(() =>
      parseAuditLogFilters({ filters: { createdAt: { $lt: '2024-01-01T00:00:00+02:00' } } }),
    ).toThrow('Operator "$lt" for field "createdAt" requires an ISO-8601 UTC datetime string');
  });

  it('throws for non-object field value', () => {
    expect(() => parseAuditLogFilters({ filters: { action: 'login_success' } })).toThrow(
      'Filter field "action" must be an object of operators, got string',
    );
  });

  it('throws when unknown field is mixed with valid fields', () => {
    expect(() =>
      parseAuditLogFilters({
        filters: { action: { $eq: 'login_success' }, unknown: { $eq: 'x' } },
      } as Record<string, unknown>),
    ).toThrow('Unknown filter field: "unknown"');
  });

  it('handles __proto__ pollution attempt', () => {
    const malicious = { __proto__: { admin: true } };
    expect(() => parseAuditLogFilters({ filters: malicious })).toThrow();
  });

  it('handles constructor pollution attempt', () => {
    const malicious = { constructor: { prototype: { admin: true } } };
    expect(() => parseAuditLogFilters({ filters: malicious })).toThrow();
  });

  it('ignores fields that have empty operator objects', () => {
    const result = parseAuditLogFilters({
      filters: { action: {}, email: { $eq: 'test@example.com' } },
    });
    expect(result).toEqual({ email: { $eq: 'test@example.com' } });
  });

  it('AUDIT_ACTIONS contains all expected actions', () => {
    expect(AUDIT_ACTIONS).toContain('login_success');
    expect(AUDIT_ACTIONS).toContain('login_failure');
    expect(AUDIT_ACTIONS).toContain('missing_code');
    expect(AUDIT_ACTIONS).toContain('state_mismatch');
    expect(AUDIT_ACTIONS).toContain('nonce_mismatch');
    expect(AUDIT_ACTIONS).toContain('token_exchange_failed');
    expect(AUDIT_ACTIONS).toContain('whitelist_rejected');
    expect(AUDIT_ACTIONS).toContain('logout');
    expect(AUDIT_ACTIONS).toContain('session_expired');
    expect(AUDIT_ACTIONS).toContain('user_created');
  });
});
