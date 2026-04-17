# Audit Log Filtering — Implementation Plan

Add filter controls to the OIDC Audit Log page (admin + API) that match Strapi's
native filtering UX and are fully typed end-to-end.

## Goals

- Filter audit log entries by `action`, `email`, `ip`, and `createdAt`.
- Use Strapi's own `Filters` primitives and `SearchInput` so the UX matches the
  Content Manager.
- Preserve existing behaviours: pagination, NDJSON export, clear-all. Export
  and the entry-count header must reflect the active filters.
- No `any` / `unknown` leaks in the handler, service, or component.

## Non-goals

- No saved / named filters.
- No free-text search over `details` (derived field, not persisted).
- No URL persistence of filter state in the first pass (can follow later
  using `useQueryParams` from `@strapi/strapi/admin`).

---

## 1. Filter surface

| Field       | Operators                                                                                  | Input                                   |
| ----------- | ------------------------------------------------------------------------------------------ | --------------------------------------- |
| `action`    | `$eq`, `$ne`, `$in`, `$notIn`                                                              | `Combobox` over the `AuditAction` union |
| `email`     | `$eq`, `$ne`, `$contains`, `$notContains`, `$startsWith`, `$endsWith`, `$null`, `$notNull` | text                                    |
| `ip`        | same as `email`                                                                            | text                                    |
| `createdAt` | `$eq`, `$gt`, `$gte`, `$lt`, `$lte`, `$between`                                            | date / datetime picker                  |

Free-text search via `SearchInput` above the table — maps to
`$or: [{ email: { $containsi } }, { ip: { $containsi } }]`.

---

## 2. Shared filter contract (`server/audit-log-filters.ts`)

New module shared by server + admin. Defines the wire format so the client and
server agree on one type.

```ts
import type { AuditAction } from './types';

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

export type StringOperator =
  | '$eq'
  | '$ne'
  | '$contains'
  | '$notContains'
  | '$startsWith'
  | '$endsWith'
  | '$null'
  | '$notNull';

export type DateOperator = '$eq' | '$gt' | '$gte' | '$lt' | '$lte' | '$between';

export type EnumOperator = '$eq' | '$ne' | '$in' | '$notIn';

export interface AuditLogFilters {
  action?: Partial<Record<EnumOperator, AuditAction | AuditAction[]>>;
  email?: Partial<Record<StringOperator, string | boolean>>;
  ip?: Partial<Record<StringOperator, string | boolean>>;
  createdAt?: Partial<Record<DateOperator, string | [string, string]>>;
  q?: string; // free-text search
}
```

A single `parseAuditLogFilters(query: unknown): AuditLogFilters` lives here and
is reused by `find` and `export`. It rejects unknown fields / operators and
coerces values, so the controller never passes raw `ctx.query` into the DB.

---

## 3. Server changes

### 3.1 `server/controllers/auditLog.ts`

- `find(ctx)`: parse `ctx.query.filters` + `ctx.query.q` via
  `parseAuditLogFilters`, forward to `service.find({ page, pageSize, filters })`.
- `exportLogs(ctx)`: same parsing; pass filters into the `ndjsonRowStream`
  paginator so the export honours the current view.
- Drop the ad-hoc `service` parameter type on the NDJSON helpers; import
  `AuditLogService` from `../types` instead (removes the inline shape duplication
  introduced in the last refactor).

### 3.2 `server/services/auditLog.ts`

- Extend `find` signature:
  ```ts
  find(opts?: { page?: number; pageSize?: number; filters?: AuditLogFilters })
  ```
- Build the Strapi `where` clause from `AuditLogFilters`:
  - Each field → `{ [field]: { [op]: value } }`.
  - `q` → `$or` over `email` / `ip` with `$containsi`.
  - Combine via `$and` so field + search coexist.
- Extend `AuditLogService.find` in `server/types.ts` to accept `filters`.
- `clearAll` stays unfiltered (destructive; UI still confirms).

### 3.3 Routes

No route changes — `GET /audit-logs` and `/audit-logs/export` already accept
query params. Both admin and content-api route lists pick up the new params
automatically.

### 3.4 Server tests

All server tests live under `server/__tests__/e2e` and use the existing Vitest

- supertest + real-Strapi harness (`auditlog.e2e.test.ts`,
  `controllers.e2e.test.ts`, `test-helpers.ts`). Extend those files rather than
  creating a new suite.

**Parser (`parseAuditLogFilters`) — pure unit tests**
Run these in a new `server/__tests__/audit-log-filters.test.ts` so they don't
need a Strapi instance:

- Empty / missing query → `{}`.
- Each allowed `(field, operator)` pair round-trips to the typed output.
- Enum operator with a non-`AuditAction` value → throws `ValidationError`.
- Unknown field → throws.
- Unknown operator for a known field → throws.
- `createdAt $between` with a non-tuple value → throws.
- `q` is trimmed; empty string is dropped.
- Nested / prototype-pollution payloads (`__proto__`, arrays where objects
  expected) → throws, no mutation of `Object.prototype`.

**Service (`auditLogService.find`) — e2e**
Seed a deterministic fixture (≥3 rows spanning actions, emails, ips, and
`createdAt` values) in `beforeEach`, then assert:

- `filters: { action: { $eq: 'login_success' } }` returns only that action.
- `filters: { action: { $in: [...] } }` returns the union.
- `filters: { email: { $contains: 'acme' } }` is case-insensitive and
  matches partial strings (document `$containsi` vs `$contains` decision here).
- `filters: { email: { $null: true } }` returns only rows with null email
  (e.g. `logout`).
- `filters: { createdAt: { $between: [iso1, iso2] } }` is inclusive / matches
  documented bounds.
- Combined filters AND together (e.g. `action $eq` + `email $contains`).
- `q: 'foo'` matches either email or ip (`$or`) and composes with filters
  via `$and`.
- Pagination metadata (`total`, `pageCount`) reflects the filtered set, not
  the full table.
- Sort remains `createdAt desc` regardless of filters.

**Controller (`auditLog.find`, `auditLog.export`) — e2e via supertest**

- `GET /audit-logs?filters[action][$eq]=login_success` returns 200 with
  only matching rows.
- Malformed filter payload → 400 with a JSON error body; no stack trace
  leaked.
- `GET /audit-logs/export?filters[...]` streams NDJSON containing only
  filtered rows; line count matches the filtered service result. Reuse
  `exportAndCountLines` / `assertNdjsonFormat` helpers.
- Export honours filters across `EXPORT_PAGE_SIZE` boundary: seed >500 rows,
  apply a filter that keeps ~50, assert exact count.
- `clearAll` ignores filters (deletes everything) — explicit test to lock
  this in.
- Rate-limit middleware still applies to filtered requests (one sanity case).

### 3.5 Admin tests

Add `admin/src/components/AuditLog/__tests__/AuditLog.test.tsx` using the
same stack already configured for Vitest + React Testing Library (set up
`vitest.config.ts` if no admin tests exist yet — confirm during
implementation; create only if missing).

- Renders the Strapi `Filters` trigger and `SearchInput` in the toolbar.
- Selecting an `action` filter issues a request whose URL contains
  `filters[action][$eq]=login_success` (assert via `msw` or a
  `useFetchClient` mock).
- Typing in `SearchInput` (debounced) sends `q=<value>` and resets `page`
  to 1.
- Clearing a filter chip removes it from the subsequent request.
- Empty-state message switches from "no entries" to
  `auditlog.filters.empty` when filters are active and results are empty.
- Export button's href / click-handler includes the current filter query
  string.
- Entry-count header shows filtered total.

**Type-level assertions**

- `expectTypeOf<AuditLogFilters['action']>().toEqualTypeOf<...>()` style
  checks in a `*.type-test.ts` file to lock the shared contract against the
  server `AuditAction` union. Prevents a silent drift if a new action is
  added without updating `AUDIT_ACTIONS`.

---

## 4. Admin changes

### 4.1 `admin/src/components/AuditLog/filters.ts` (new)

Builds the `Filters.Filter[]` config once, typed against the Strapi
`Filters` namespace:

```ts
import type { Filters } from '@strapi/strapi/admin';
import { AUDIT_ACTIONS } from '../../../../server/audit-log-filters';
// …
export const auditLogFilters: Filters.Filter[] = [
  {
    name: 'action',
    label: 'Action',
    type: 'enumeration',
    options: AUDIT_ACTIONS.map((value) => ({ value, label: value })),
  },
  { name: 'email', label: 'Email', type: 'string' },
  { name: 'ip', label: 'IP address', type: 'string' },
  { name: 'createdAt', label: 'Timestamp', type: 'datetime' },
];
```

### 4.2 `admin/src/components/AuditLog/index.tsx`

- Import `Filters, SearchInput` from `@strapi/strapi/admin`.
- Toolbar row above the table (left side): `<Filters.Root …><Filters.Trigger />
<Filters.Popover /></Filters.Root>` + `<Filters.List />` chip strip +
  `<SearchInput />`. Existing Export / Clear buttons stay on the right.
- Local state:
  ```ts
  const [filters, setFilters] = useState<Filters.Query['filters']>();
  const [q, setQ] = useState('');
  ```
  Reset `page` to 1 whenever filters or `q` change.
- Serialise with `qs.stringify({ filters, q, page, pageSize }, { encodeValuesOnly: true })`
  (`qs` is already a transitive dep via `@strapi/strapi`; add a direct
  dependency if not — TBD during implementation).
- Export button builds the same query string and appends it to
  `/audit-logs/export`.
- Entry count header uses the post-filter `pagination.total`; add an
  "X of Y total" display when filters are active (optional).

### 4.3 Types

- Reuse `AuditLogFilters` from the shared module for the typed payload given
  to `fetchLogs`.
- The `AuditLogRecord` interface already local to the component moves next to
  `filters.ts` so the whole feature has a single type surface.

### 4.4 Translations (`translations/locales/*.json`)

Add:

- `auditlog.filters.action`, `.email`, `.ip`, `.createdAt`
- `auditlog.search.placeholder`
- `auditlog.filters.empty` (no results for filters)
- One label per `AuditAction` (already present under `auditlog.action.*`; reuse).

---

## 5. Rollout

1. Shared filter module + server parser + service `where` builder + tests.
2. Controller wiring + export streaming with filters.
3. Admin toolbar (Filters + SearchInput) reading/writing local state.
4. Export + entry-count parity with active filters.
5. Translations + CHANGELOG entry.

## 6. Open questions

- Do we want URL-persisted filters via `useQueryParams` now or defer? Deferring
  keeps the first change small; revisit once the shared contract lands.
- Should `clearAll` gain a "clear filtered only" mode? Out of scope for this
  plan — call out in the PR if users ask.
