import { z } from 'zod';
import { AUDIT_ACTIONS } from '../shared/audit-actions';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Strict ISO-8601 UTC datetime, exactly as produced by `Date.prototype.toISOString()`.
// We require this format (rather than any date-like string) so the DB comparison
// semantics are identical across SQL dialects.
const isoUtcDatetime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    'must be an ISO-8601 UTC datetime (e.g. "2024-01-15T00:00:00.000Z")',
  );

const actionFilterSchema = z
  .object({
    $eq: z.enum(AUDIT_ACTIONS).optional(),
    $in: z.array(z.enum(AUDIT_ACTIONS)).optional(),
  })
  .strict();

const stringFilterSchema = z
  .object({
    $eq: z.string().optional(),
    $contains: z.string().optional(),
    $endsWith: z.string().optional(),
    $null: z.boolean().optional(),
    $notNull: z.boolean().optional(),
  })
  .strict();

const createdAtFilterSchema = z
  .object({
    $gte: isoUtcDatetime.optional(),
    $lt: isoUtcDatetime.optional(),
    $lte: isoUtcDatetime.optional(),
    $between: z.tuple([isoUtcDatetime, isoUtcDatetime]).optional(),
    $in: z.array(isoUtcDatetime).optional(),
  })
  .strict();

const auditLogQuerySchema = z
  .object({
    filters: z
      .object({
        action: actionFilterSchema.optional(),
        email: stringFilterSchema.optional(),
        ip: stringFilterSchema.optional(),
        createdAt: createdAtFilterSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .passthrough();

export type AuditLogFilters = NonNullable<z.infer<typeof auditLogQuerySchema>['filters']>;

export function parseAuditLogFilters(query: unknown): AuditLogFilters {
  const result = auditLogQuerySchema.safeParse(query);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length ? ` at "${issue.path.join('.')}"` : '';
    throw new ValidationError(`${issue.message}${path}`);
  }
  return result.data.filters ?? {};
}
