# strapi-plugin-oidc — Refactor Plan

## Context

Prior `/simplify` pass applied low-risk cleanups (dead code removal, shared `EMAIL_REGEX`, `structuredClone`, memoized `isDirty`, parallelized PUTs, cookie-clear loop, removed dead uppercase-email branch). This plan covers the remaining refactors. Each one is **intended to be behavior-preserving**; care is required at each site. The plan is written so another model can execute it end-to-end without re-exploring the codebase.

Repo: `/home/george/Code/strapi-plugin-oidc`. Branch: `main`. Working tree must be clean before starting. After each numbered task, run `npx tsc --noEmit` and `npm run lint` and fix before proceeding. Run `npm test` at the end of each task to confirm the task is self-contained.

## Commit independence

Each numbered task below MUST land as a standalone commit whose correctness does not depend on any other task in this plan being applied. Concretely:

- No task may import symbols introduced by another task in this plan.
- No task may assume a refactor from another task has happened first.
- When two tasks touch the same file, the second task's diff must apply cleanly against either the pre- or post-state of the first task — keep edits additive and localized, not sweeping rewrites that overlap.
- Tests added or updated in Task 8 must also work against the pre-refactor code where semantics are unchanged (they assert behavior, not implementation).

The tasks are independent by construction — none references another's new files or helpers. Execute in any order.

---

## Task 1 — Typed plugin-service accessors

**Problem:** ~10 inline `strapi.plugin('strapi-plugin-oidc').service('X') as Y` casts across controllers and bootstrap.

**Create `server/utils/services.ts`:**

```ts
import type {
  OAuthService,
  RoleService,
  WhitelistService,
  AuditLogService,
  AdminUserService,
} from '../types';

export const PLUGIN_NAME = 'strapi-plugin-oidc';

export const getOauthService = (): OAuthService =>
  strapi.plugin(PLUGIN_NAME).service('oauth') as OAuthService;

export const getRoleService = (): RoleService =>
  strapi.plugin(PLUGIN_NAME).service('role') as RoleService;

export const getWhitelistService = (): WhitelistService =>
  strapi.plugin(PLUGIN_NAME).service('whitelist') as WhitelistService;

export const getAuditLogService = (): AuditLogService =>
  strapi.plugin(PLUGIN_NAME).service('auditLog') as AuditLogService;

export const getAdminUserService = (): AdminUserService =>
  strapi.service('admin::user') as AdminUserService;
```

**Callsites to update:**

- `server/controllers/oidc.ts:347-353` — replace the four casts.
- `server/controllers/oidc.ts:463` (inside `logout`) — replace the `auditLog` cast.
- `server/controllers/role.ts:2, 19` — replace both lookups.
- `server/controllers/whitelist.ts:6-8` — delete local `getWhitelistService`, import from utils.
- `server/controllers/auditLog.ts:13-15` — delete local `getAuditLogService`, import from utils.
- `server/bootstrap.ts:18, 73, 111` — replace the three calls.

**Do NOT change** test files — they exercise Strapi's real plugin surface; inline casts are fine there.

---

## Task 2 — Extract JSON attachment / download helpers

**Server side — new `server/utils/http.ts`:**

```ts
import type { StrapiContext } from '../types';
import { formatDatetimeForFilename } from './datetime';

export function setJsonAttachmentHeaders(ctx: StrapiContext, basename: string): void {
  const datetime = formatDatetimeForFilename(new Date());
  ctx.set('Content-Type', 'application/json');
  ctx.set('Content-Disposition', `attachment; filename="${basename}-${datetime}.json"`);
}
```

**Callsites to update:**

- `server/controllers/auditLog.ts:24-26` → `setJsonAttachmentHeaders(ctx, 'strapi-oidc-audit-log');`.
- `server/controllers/whitelist.ts:92-94` → `setJsonAttachmentHeaders(ctx, 'strapi-oidc-whitelist');`.

**Admin side — new `admin/src/utils/download.ts`:**

```ts
import { formatDatetimeForFilename } from './datetime';

export function downloadJson(basename: string, data: unknown): void {
  const datetime = formatDatetimeForFilename(new Date());
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${basename}-${datetime}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Callsite to update:**

- `admin/src/pages/HomePage/useOidcSettings.ts:87-98` (`onExport`) — replace the blob/url/anchor dance with `downloadJson('strapi-oidc-whitelist', data)`. Can then drop the `formatDatetimeForFilename` import from this file.

**Out of scope:** `AuditLog/index.tsx` export (NDJSON, different shape).

---

## Task 3 — Logout userinfo fetch timeout

**Problem:** `server/controllers/oidc.ts:478-481` — `fetch` inside `logout` has no timeout; a hung IdP stalls logout indefinitely. The existing `catch` already treats fetch failure as session-expired.

**Fix:**

```ts
const LOGOUT_USERINFO_TIMEOUT_MS = 3000;

// inside logout:
try {
  const response = await fetch(config.OIDC_USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(LOGOUT_USERINFO_TIMEOUT_MS),
  });
  // ...existing branches unchanged
} catch {
  if (userEmail) await auditLog.log({ action: 'session_expired', email: userEmail, ip: ctx.ip });
  return ctx.redirect(`${adminPanelUrl}/auth/login`);
}
```

`AbortSignal.timeout` requires Node ≥17.3; Strapi v5 requires Node ≥18, so safe.

---

## Task 4 — Service-layer encapsulation of whitelist DB access

**Problem:** `server/controllers/whitelist.ts` bypasses `whitelistService` and calls `strapi.query('admin::user')` / `strapi.query('plugin::strapi-plugin-oidc.whitelists')` directly (lines 62-69, 87).

**Add to `server/services/whitelist.ts`:**

```ts
async hasUser(email: string): Promise<boolean> {
  const row = await getWhitelistQuery().findOne({ where: { email }, select: ['id'] });
  return !!row;
},
async deleteAllUsers(): Promise<void> {
  await getWhitelistQuery().deleteMany({});
},
async countAdminUsersByEmails(emails: string[]): Promise<number> {
  if (emails.length === 0) return 0;
  const rows = await strapi.query('admin::user').findMany({
    where: { email: { $in: emails } },
    select: ['id'],
  });
  return rows.length;
},
```

**Update `WhitelistService` interface in `server/types.ts`** with the three new methods.

**Edit `server/controllers/whitelist.ts`:**

- `register` (lines 49-77): replace the per-email direct queries with `whitelistService.countAdminUsersByEmails(emailList)` (for matched count) + per-email `whitelistService.hasUser(email)` before `registerUser(email)`.
- `deleteAll` (lines 86-89): replace `strapi.query(...).deleteMany({})` with `whitelistService.deleteAllUsers()`.

---

## Task 5 — Targeted admin-role query per login

**Problem:** `server/controllers/oidc.ts:264` calls `strapi.db.query('admin::role').findMany()` (no filter, no select) on every OIDC callback, then uses `Array.find` inside nested loops.

**Fix strategy:**

1. Extract a pure helper `collectGroupMapRoleNames(userInfo, config): string[]` that parses `OIDC_GROUP_ROLE_MAP` and returns the union of role names mapped from the user's groups (no DB access).
2. In `handleUserAuthentication`:
   - `candidateNames = collectGroupMapRoleNames(userInfo, config)`.
   - If non-empty: `findMany({ where: { name: { $in: candidateNames } }, select: ['id','name'] })` → build `Map<name, id>` for O(1) lookups.
   - Else: fall back to `roleService.oidcRoles()`; if it returns IDs, narrow-query by ID to recover `resolvedRoleNames`.
3. Delete the old `resolveRoles` / `resolveRolesFromGroups` helpers; inline the branches into `handleUserAuthentication`.
4. Drop the unused `AdminRole[]` import if no other reference remains.

**Behavior equivalence:**

- Empty `candidateNames` → falls through to `oidcRoles()` — matches current behavior.
- `resolvedRoleNames` order may differ (narrow query vs. DB iteration order). Only used as a join-with-comma string in audit log — acceptable.

---

## Task 6 — Typed OIDC error class

**Problem:** `classifyOidcError` (`server/controllers/oidc.ts:302-342`) recovers semantics via substring matching on error messages produced elsewhere in the same file. Changing a message silently changes dispatch.

**New file `server/oidc-errors.ts`:**

```ts
import { errorCodes, type ErrorCode } from './error-strings';
import type { AuditAction } from './types';

export type OidcErrorKind =
  | 'nonce_mismatch'
  | 'token_exchange_failed'
  | 'id_token_parse_failed'
  | 'userinfo_fetch_failed'
  | 'user_creation_failed'
  | 'whitelist_rejected'
  | 'invalid_email'
  | 'unknown';

export class OidcError extends Error {
  readonly kind: OidcErrorKind;
  readonly cause?: unknown;
  constructor(kind: OidcErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'OidcError';
    this.kind = kind;
    this.cause = cause;
  }
}

export const OIDC_ERROR_DISPATCH: Record<
  OidcErrorKind,
  { action: AuditAction; code: ErrorCode; key?: string }
> = {
  nonce_mismatch: { action: 'nonce_mismatch', code: errorCodes.NONCE_MISMATCH },
  token_exchange_failed: {
    action: 'token_exchange_failed',
    code: errorCodes.TOKEN_EXCHANGE_FAILED,
  },
  id_token_parse_failed: {
    action: 'login_failure',
    code: errorCodes.ID_TOKEN_PARSE_FAILED,
    key: 'id_token_parse_failed',
  },
  userinfo_fetch_failed: {
    action: 'login_failure',
    code: errorCodes.USERINFO_FETCH_FAILED,
    key: 'userinfo_fetch_failed',
  },
  user_creation_failed: {
    action: 'login_failure',
    code: errorCodes.USER_CREATION_FAILED,
    key: 'user_creation_failed',
  },
  whitelist_rejected: {
    action: 'whitelist_rejected',
    code: errorCodes.WHITELIST_CHECK_FAILED,
    key: 'whitelist_rejected',
  },
  invalid_email: {
    action: 'login_failure',
    code: errorCodes.TOKEN_EXCHANGE_FAILED,
    key: 'sign_in_unknown',
  },
  unknown: {
    action: 'login_failure',
    code: errorCodes.TOKEN_EXCHANGE_FAILED,
    key: 'sign_in_unknown',
  },
};
```

Export `ErrorCode` from `server/error-strings.ts` if absent: `export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];`.

**Throw-site replacements** — convert `throw new Error(errorMessages.X)` to `throw new OidcError(kind, errorMessages.X)`:

- `oidc.ts:102` → `token_exchange_failed`
- `oidc.ts:119` → `nonce_mismatch`
- `oidc.ts:123` → `id_token_parse_failed` (pass `e` as cause)
- `oidc.ts:122` — replace `(e as Error).message === 'Nonce mismatch'` check with `e instanceof OidcError && e.kind === 'nonce_mismatch'`.
- `oidc.ts:134` → `userinfo_fetch_failed`
- `oidc.ts:259` → `invalid_email`
- `services/whitelist.ts:48` → `whitelist_rejected`
- `oidc.ts:278` — wrap the `registerNewUser` call with try/catch converting bubble-ups into `new OidcError('user_creation_failed', msg, e)`.

**Rewrite `classifyOidcError`** to accept `e: unknown`, dispatch via `OIDC_ERROR_DISPATCH[e instanceof OidcError ? e.kind : 'unknown']`, and attach `params` per kind (`id_token_parse_failed`, `user_creation_failed`, `unknown`). Update the catch block at `oidc.ts:439-457` to pass `e` instead of `msg`. Preserve audit-log and `strapi.log.error` shapes.

**After rewrite**, grep for any remaining `message === '...'` or `msg.includes('whitelist'|'createUser')` patterns and confirm none remain.

---

## Task 7 — Reducer-based state model in `useOidcSettings.ts`

**Problem:** 12 paired `useState`s (`initialX`/`X`), ad-hoc `structuredClone` scattered across refreshes, `JSON.stringify`-based `isDirty`.

**Design:**

```ts
type SettingsSnapshot = {
  oidcRoles: OIDCRole[];
  users: WhitelistUser[];
  useWhitelist: boolean;
  enforceOIDC: boolean;
};

type State = {
  current: SettingsSnapshot;
  initial: SettingsSnapshot;
  roles: RoleDef[];
  enforceOIDCConfig: boolean | null;
  auditLogEnabled: boolean;
  loading: boolean;
  showSuccess: boolean;
  showError: boolean;
};

type Action =
  | { type: 'hydrate/roles'; roles: RoleDef[] }
  | { type: 'hydrate/oidcRoles'; oidcRoles: OIDCRole[] }
  | {
      type: 'hydrate/whitelist';
      snapshot: Partial<SettingsSnapshot>;
      enforceOIDCConfig: boolean | null;
      auditLogEnabled: boolean;
    }
  | { type: 'patch/oidcRole'; oidcId: string; values: string[] }
  | { type: 'user/add'; email: string }
  | { type: 'user/delete'; email: string }
  | { type: 'users/clear' }
  | { type: 'users/replace'; users: WhitelistUser[] }
  | { type: 'toggle/useWhitelist'; value: boolean }
  | { type: 'toggle/enforceOIDC'; value: boolean }
  | { type: 'commit'; snapshot?: Partial<SettingsSnapshot> }
  | { type: 'loading'; value: boolean }
  | { type: 'flash/success' }
  | { type: 'flash/error' }
  | { type: 'flash/clear'; kind: 'success' | 'error' };
```

**Reducer rules:**

- `hydrate/*`: populate `current` and a `structuredClone`d `initial`.
- `patch/oidcRole`, `user/*`, `toggle/*`: mutate only `current`; encode existing side-effect rules (e.g. zeroing `enforceOIDC` when users list empties while `useWhitelist` is on) inside the reducer, not callbacks.
- `commit`: `initial = structuredClone(snapshot ?? current)`.

**`isDirty`** memoized outside reducer: primitive compare + `JSON.stringify` for the two arrays.

**Callback rewrites:** each existing callback dispatches a single action. `onSaveAll`: after the three PUTs, refetch whitelist and dispatch `hydrate/whitelist` so the server response becomes the new `initial`. Remove the dangling `get().then(...)` race after `setLoading(false)`.

**Return shape unchanged** — `HomePage/index.tsx` consumes: `loading`, `showSuccess`, `showError`, `oidcRoles`, `roles`, `useWhitelist`, `enforceOIDC`, `enforceOIDCConfig`, `initialEnforceOIDC`, `users`, `isDirty`, `auditLogEnabled`.

---

## Task 8 — Tests: rewrite where behavior reshuffles, add where coverage is missing

Do this task last, but make the test changes commit-standalone: new/updated tests should assert behavior that holds in the _current_ codebase as well. Where a test encodes a specific message string that Task 6 changes, update the test to assert on the typed error `kind` _and_ the error message in parallel so it passes both before and after Task 6 (bridge pattern: accept either representation). Where a test hits a DB shape that Task 4 encapsulates behind service methods, have the test call the service — this works before and after because the service pre-existed.

### 8a. Audit existing e2e tests and update where implementation-coupled

Files: `server/__tests__/e2e/*.test.ts`. For each file, skim and flag assertions that:

- Compare raw `strapi.query(...)` results against controller behavior (Task 4 candidates — route through service).
- Assert specific error message strings for OIDC flows (Task 6 candidates — assert `action` audit value instead, or accept both `kind` and message).
- Test the `JSON.parse(JSON.stringify)` deep clone or `isDirty` internals (Task 7 — should only test observable behavior: "save button enabled after edit").

### 8b. Add missing coverage (each bullet = one test case)

These are regressions the refactors could introduce. Add them _before_ each task that could break them so the commit that introduces behavior change also contains the test proving it didn't.

**For Task 3 (logout timeout):**

- `oidc.e2e.test.ts` — logout with an unreachable `OIDC_USERINFO_ENDPOINT` (point at an IP that DROPs) completes in under 5s and emits `session_expired` audit entry, then redirects to `/auth/login`. If a full network-drop mock is infeasible, mock `fetch` at module boundary with `vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))` and verify `AbortError` path is reached.

**For Task 4 (whitelist service encapsulation):**

- `services.e2e.test.ts` — `whitelistService.hasUser(email)` returns true for a registered email, false otherwise.
- `services.e2e.test.ts` — `whitelistService.deleteAllUsers()` empties the table.
- `services.e2e.test.ts` — `whitelistService.countAdminUsersByEmails([...])` returns the number of admin users matching the given emails (test with 0 matches, partial matches, full matches).

**For Task 5 (narrow role query):**

- `oidc.e2e.test.ts` — login with an `OIDC_GROUP_ROLE_MAP` containing a role name that does NOT exist in admin roles: user is still created/logged in with the fallback `oidcRoles()` roles, no crash. (Current code silently skips unmatched names; preserve that.)
- `oidc.e2e.test.ts` — login with a user whose groups field is missing / not an array: falls back to `oidcRoles()`.
- `oidc.e2e.test.ts` — login with a group-mapped role: audit log `user_created` entry's `details` includes the mapped role name.

**For Task 6 (typed OIDC errors):**

- `oidc.e2e.test.ts` — each error branch (`token_exchange_failed`, `nonce_mismatch`, `userinfo_fetch_failed`, `id_token_parse_failed`, `user_creation_failed`, `whitelist_rejected`, `invalid_email`) produces the corresponding audit-log `action` value. Assert on `action`, not on message strings.
- Unit-test `OIDC_ERROR_DISPATCH` completeness: for every `OidcErrorKind` there is an entry (TypeScript `Record` type already enforces this at compile time; keep the runtime check as a `Object.keys(OIDC_ERROR_DISPATCH)` cardinality assertion).

**For Task 7 (reducer state):**

- No e2e coverage needed — admin-side behavior. Skip unless the project already has admin-side component tests (grep `admin/src/**/*.test.*` — currently none; do not introduce a new test framework for this).

**For Task 1 (service accessors) and Task 2 (helpers):**

- Pure refactors with no new surface; existing tests cover them. No new tests.

### 8c. Test helper updates

`server/__tests__/e2e/test-helpers.ts`:

- `loginAndFetchUser` (:114-127) duplicates `fetchUserWithRoles` (:184-188). Route the former through the latter.
- `loginWithGroups` (:88-100), `applyRoleMapConfig` (:102-110), `setupGroupRoleMapping` (:175-182) all do the same `{ ...MOCK_OIDC_CONFIG, OIDC_GROUP_ROLE_MAP: JSON.stringify(map) }` + `strapi.config.set(...)` pattern. Extract `setGroupRoleMap(strapi, map)` and rebuild the three callers. Delete `loginWithGroups` if its ignored `_email`/`_groups` parameters confirm it's fully replaceable by `applyRoleMap` + `initiateLoginAndCallback`.

### 8d. Verification

Run `npm test` after this task — all existing and new tests must pass.

---

## Critical files

- `server/utils/services.ts` _(new — Task 1)_
- `server/utils/http.ts` _(new — Task 2)_
- `admin/src/utils/download.ts` _(new — Task 2)_
- `server/oidc-errors.ts` _(new — Task 6)_
- `server/controllers/oidc.ts` — edited by Tasks 1, 3, 5, 6
- `server/controllers/whitelist.ts` — edited by Tasks 1, 2, 4
- `server/controllers/auditLog.ts` — edited by Tasks 1, 2
- `server/controllers/role.ts` — edited by Task 1
- `server/services/whitelist.ts` — edited by Tasks 4, 6
- `server/bootstrap.ts` — edited by Task 1
- `server/types.ts` — edited by Task 4 (WhitelistService interface)
- `server/error-strings.ts` — edited by Task 6 (export `ErrorCode` alias if absent)
- `admin/src/pages/HomePage/useOidcSettings.ts` — edited by Tasks 2, 7
- `server/__tests__/e2e/*.test.ts` — edited/extended by Task 8
- `server/__tests__/e2e/test-helpers.ts` — edited by Task 8

## Out of scope

- Bulk DB ops in whitelist controller (changes atomicity).
- Streaming audit-log export (changes response content-type).
- Unifying `AuditLog/index.tsx` NDJSON export with `downloadJson` (different shape).
- Admin `useFetchClient` migration for `AuditLog` export.
- Introducing a new admin-side component test framework.

## Verification

1. `npx tsc --noEmit` — clean.
2. `npm run lint` — clean.
3. `npm test` — all e2e suites pass.
4. Manual smoke (optional, with `test-app`):
   - OIDC login with a group mapped to a role → correct role assigned (Task 5).
   - Logout with a blackholed IdP → completes under 3s (Task 3).
   - Admin Settings → OIDC → edit + Save → no unsaved-changes prompt (Task 7).
