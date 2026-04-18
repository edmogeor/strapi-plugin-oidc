import { AUDIT_ACTIONS, type AuditAction } from '../shared/audit-actions';

type StringOperator = '$eq' | '$contains' | '$endsWith' | '$null' | '$notNull';

type DateOperator = '$gte' | '$lt' | '$lte' | '$between' | '$in';

// Strict ISO-8601 UTC datetime, exactly as produced by `Date.prototype.toISOString()`.
// We require this format (rather than any date-like string) so the DB comparison
// semantics are identical across SQL dialects.
const ISO_UTC_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isIsoUtcDatetime(value: unknown): value is string {
  return typeof value === 'string' && ISO_UTC_DATETIME.test(value);
}

type EnumOperator = '$eq' | '$in';

// fallow-ignore-next-line unused-type
export interface AuditLogFilters {
  action?: Partial<Record<EnumOperator, AuditAction | AuditAction[]>>;
  email?: Partial<Record<StringOperator, string | boolean>>;
  ip?: Partial<Record<StringOperator, string | boolean>>;
  createdAt?: Partial<Record<DateOperator, string | string[]>>;
}

const ALLOWED_FIELDS = new Set(['action', 'email', 'ip', 'createdAt']);
const STRING_OPERATORS = new Set<StringOperator>([
  '$eq',
  '$contains',
  '$endsWith',
  '$null',
  '$notNull',
]);
const DATE_OPERATORS = new Set<DateOperator>(['$gte', '$lt', '$lte', '$between', '$in']);
const ENUM_OPERATORS = new Set<EnumOperator>(['$eq', '$in']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isStringOperator(op: string): op is StringOperator {
  return STRING_OPERATORS.has(op as StringOperator);
}

function isDateOperator(op: string): op is DateOperator {
  return DATE_OPERATORS.has(op as DateOperator);
}

function isEnumOperator(op: string): op is EnumOperator {
  return ENUM_OPERATORS.has(op as EnumOperator);
}

function isAuditAction(value: unknown): value is AuditAction {
  return AUDIT_ACTIONS.includes(value as AuditAction);
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function requireType(field: string, op: string, value: unknown, check: boolean, expected: string) {
  if (!check) {
    throw new ValidationError(`Operator "${op}" for field "${field}" requires ${expected}`);
  }
  return value;
}

function parseActionOperator(op: string, opValue: unknown): unknown {
  if (!isEnumOperator(op)) {
    throw new ValidationError(`Unknown operator "${op}" for field "action"`);
  }
  if (op === '$in') {
    requireType('action', op, opValue, Array.isArray(opValue), 'an array value');
    for (const v of opValue as unknown[]) {
      if (!isAuditAction(v)) {
        throw new ValidationError(
          `Invalid action value "${v}" — must be one of: ${AUDIT_ACTIONS.join(', ')}`,
        );
      }
    }
    return opValue;
  }
  if (!isAuditAction(opValue)) {
    throw new ValidationError(
      `Invalid action value "${opValue}" — must be one of: ${AUDIT_ACTIONS.join(', ')}`,
    );
  }
  return opValue;
}

function parseCreatedAtOperator(op: string, opValue: unknown): unknown {
  if (!isDateOperator(op)) {
    throw new ValidationError(`Unknown operator "${op}" for field "createdAt"`);
  }
  const expected = 'an ISO-8601 UTC datetime string (e.g. "2024-01-15T00:00:00.000Z")';
  if (op === '$between') {
    const isTuple = Array.isArray(opValue) && opValue.length === 2;
    requireType('createdAt', op, opValue, isTuple, 'a tuple [start, end]');
    const [a, b] = opValue as unknown[];
    requireType('createdAt', op, opValue, isIsoUtcDatetime(a) && isIsoUtcDatetime(b), expected);
    return opValue as [string, string];
  }
  if (op === '$in') {
    requireType('createdAt', op, opValue, Array.isArray(opValue), 'an array value');
    for (const v of opValue as unknown[]) {
      requireType('createdAt', op, v, isIsoUtcDatetime(v), expected);
    }
    return opValue as string[];
  }
  return requireType('createdAt', op, opValue, isIsoUtcDatetime(opValue), expected);
}

function parseStringFieldOperator(field: string, op: string, opValue: unknown): unknown {
  if (!isStringOperator(op)) {
    throw new ValidationError(`Unknown operator "${op}" for field "${field}"`);
  }
  if (op === '$null' || op === '$notNull') {
    return requireType(field, op, opValue, typeof opValue === 'boolean', 'a boolean value');
  }
  return requireType(field, op, opValue, typeof opValue === 'string', 'a string value');
}

function parseFieldOperators(field: string, fieldValue: unknown): Record<string, unknown> | null {
  if (!isPlainObject(fieldValue)) {
    throw new ValidationError(
      `Filter field "${field}" must be an object of operators, got ${typeof fieldValue}`,
    );
  }

  const parsed: Record<string, unknown> = {};
  for (const [op, opValue] of Object.entries(fieldValue)) {
    if (field === 'action') parsed[op] = parseActionOperator(op, opValue);
    else if (field === 'createdAt') parsed[op] = parseCreatedAtOperator(op, opValue);
    else parsed[op] = parseStringFieldOperator(field, op, opValue);
  }

  return Object.keys(parsed).length > 0 ? parsed : null;
}

export function parseAuditLogFilters(query: unknown): AuditLogFilters {
  if (!isPlainObject(query)) return {};

  const result: AuditLogFilters = {};

  const filters = query.filters;
  if (filters === undefined) return result;
  if (!isPlainObject(filters)) {
    throw new ValidationError(`"filters" must be an object, got ${typeof filters}`);
  }

  for (const [field, fieldValue] of Object.entries(filters)) {
    if (!ALLOWED_FIELDS.has(field)) {
      throw new ValidationError(`Unknown filter field: "${field}"`);
    }
    const parsed = parseFieldOperators(field, fieldValue);
    if (parsed) (result as Record<string, unknown>)[field] = parsed;
  }

  return result;
}
