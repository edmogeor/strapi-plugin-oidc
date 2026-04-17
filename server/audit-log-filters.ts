// fallow-ignore-next-line unused-type
import type { AuditAction } from './types';

// fallow-ignore-next-line unused-type
export type { AuditAction } from './types';

export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'login_success',
  'login_failure',
  'missing_code',
  'state_mismatch',
  'nonce_mismatch',
  'token_exchange_failed',
  'whitelist_rejected',
  'logout',
  'session_expired',
  'user_created',
];

type StringOperator =
  | '$eq'
  | '$ne'
  | '$contains'
  | '$notContains'
  | '$startsWith'
  | '$endsWith'
  | '$null'
  | '$notNull';

type DateOperator = '$eq' | '$gt' | '$gte' | '$lt' | '$lte' | '$between';

type EnumOperator = '$eq' | '$ne' | '$in' | '$notIn';

// fallow-ignore-next-line unused-type
export interface AuditLogFilters {
  action?: Partial<Record<EnumOperator, AuditAction | AuditAction[]>>;
  email?: Partial<Record<StringOperator, string | boolean>>;
  ip?: Partial<Record<StringOperator, string | boolean>>;
  createdAt?: Partial<Record<DateOperator, string | [string, string]>>;
  q?: string;
}

const ALLOWED_FIELDS = new Set(['action', 'email', 'ip', 'createdAt', 'q']);
const STRING_OPERATORS = new Set<StringOperator>([
  '$eq',
  '$ne',
  '$contains',
  '$notContains',
  '$startsWith',
  '$endsWith',
  '$null',
  '$notNull',
]);
const DATE_OPERATORS = new Set<DateOperator>(['$eq', '$gt', '$gte', '$lt', '$lte', '$between']);
const ENUM_OPERATORS = new Set<EnumOperator>(['$eq', '$ne', '$in', '$notIn']);

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

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// fallow-ignore-next-line complexity
export function parseAuditLogFilters(query: unknown): AuditLogFilters {
  if (!isPlainObject(query)) return {};

  const filters: AuditLogFilters = {};

  for (const [field, fieldValue] of Object.entries(query)) {
    if (!ALLOWED_FIELDS.has(field)) {
      throw new ValidationError(`Unknown filter field: "${field}"`);
    }

    if (field === 'q') {
      if (typeof fieldValue === 'string') {
        const trimmed = fieldValue.trim();
        if (trimmed) filters.q = trimmed;
      }
      continue;
    }

    if (!isPlainObject(fieldValue)) {
      throw new ValidationError(
        `Filter field "${field}" must be an object of operators, got ${typeof fieldValue}`,
      );
    }

    const operatorEntries = Object.entries(fieldValue);
    if (operatorEntries.length === 0) continue;

    const parsedOperators: Record<string, unknown> = {};

    for (const [op, opValue] of operatorEntries) {
      if (field === 'action') {
        if (!isEnumOperator(op)) {
          throw new ValidationError(`Unknown operator "${op}" for field "${field}"`);
        }
        if (op === '$in' || op === '$notIn') {
          if (!Array.isArray(opValue)) {
            throw new ValidationError(
              `Operator "${op}" for field "${field}" requires an array value`,
            );
          }
          for (const v of opValue) {
            if (!isAuditAction(v)) {
              throw new ValidationError(
                `Invalid action value "${v}" — must be one of: ${AUDIT_ACTIONS.join(', ')}`,
              );
            }
          }
          parsedOperators[op] = opValue;
        } else {
          if (!isAuditAction(opValue)) {
            throw new ValidationError(
              `Invalid action value "${opValue}" — must be one of: ${AUDIT_ACTIONS.join(', ')}`,
            );
          }
          parsedOperators[op] = opValue;
        }
      } else if (field === 'createdAt') {
        if (!isDateOperator(op)) {
          throw new ValidationError(`Unknown operator "${op}" for field "${field}"`);
        }
        if (op === '$between') {
          if (!Array.isArray(opValue) || opValue.length !== 2) {
            throw new ValidationError(
              `Operator "${op}" for field "${field}" requires a tuple [start, end]`,
            );
          }
          if (typeof opValue[0] !== 'string' || typeof opValue[1] !== 'string') {
            throw new ValidationError(
              `Operator "${op}" for field "${field}" requires string values in the tuple`,
            );
          }
          parsedOperators[op] = opValue as [string, string];
        } else {
          if (typeof opValue !== 'string') {
            throw new ValidationError(
              `Operator "${op}" for field "${field}" requires a string value`,
            );
          }
          parsedOperators[op] = opValue;
        }
      } else {
        if (!isStringOperator(op)) {
          throw new ValidationError(`Unknown operator "${op}" for field "${field}"`);
        }
        if (op === '$null' || op === '$notNull') {
          if (typeof opValue !== 'boolean') {
            throw new ValidationError(
              `Operator "${op}" for field "${field}" requires a boolean value`,
            );
          }
          parsedOperators[op] = opValue;
        } else {
          if (typeof opValue !== 'string') {
            throw new ValidationError(
              `Operator "${op}" for field "${field}" requires a string value`,
            );
          }
          parsedOperators[op] = opValue;
        }
      }
    }

    if (Object.keys(parsedOperators).length > 0) {
      (filters as Record<string, unknown>)[field] = parsedOperators;
    }
  }

  return filters;
}
