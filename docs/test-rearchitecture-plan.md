# Test Setup Rearchitecture Plan

## Goal

E2E suite currently takes **~283s (4.7 min)** sequentially. Target: **~60-90s** via
parallel workers, plus a fast unit lane that catches most regressions in seconds.

## Already Done

**New coverage (all passing):**

- `server/__tests__/unit/shared-utils.test.ts` — 19 tests for `escapeHtml`,
  `toMessage`, `interpolate`
- `server/__tests__/unit/resolveRedirectUri.test.ts` — 7 tests for redirect URI
  resolution
- `server/__tests__/e2e/backchannel-logout.e2e.test.ts` — 10 tests (JTI replay,
  wrong issuer/audience, missing event/sub, unknown sub, no-jti)
- skipLoginPage config-flag tests added to `utils.e2e.test.ts`
- Fixed pre-existing failure: `config.test.ts` expected stale
  `OIDC_SSO_BUTTON_TEXT` default

**Source refactor for testability (dependency injection, TS compiles clean):**

- `pluginConfig.ts`: `getPluginConfig`/`getRetentionDays`/`isAuditLogEnabled` now
  take `strapi` param (was global)
- `ip.ts`: `getClientIp` now takes `strapi` param
- `cookies.ts`: `shouldMarkSecure` threads `strapi` into `getPluginConfig`
- All 10 caller files updated (whitelist, logout, shared, errors,
  backchannelLogout, callback, bootstrap, auditLog service, routes)

## Remaining Work

### 1. Fix `utils.e2e.test.ts` call sites (BLOCKER — currently broken)

The refactor changed signatures but this test file still calls
`pluginConfig.getRetentionDays()` etc. **without** the `strapi` arg. Must update
or these tests fail at runtime.

### 2. Create `mock-strapi.ts` factory (unit lane)

Minimal fake: `config.get/set` backed by a `Map`, plus a no-op `log`. Enough for
every test that only needs `strapi.config`.

### 3. Move config-only tests from e2e to unit lane

Candidates in `utils.e2e.test.ts` that need zero HTTP/DB:

- `pluginConfig utils` (`getRetentionDays`, `isAuditLogEnabled`,
  `OIDC_SKIP_LOGIN_PAGE` parsing)
- `enforceOIDC utils` + the new `skipLoginPage utils` block
- `getClientIp` (mock ctx already)
- `shouldMarkSecure` + `clearAuthCookies` (mock ctx already)

Only the **rate-limit map bounding** tests stay in e2e (they need real HTTP
through the middleware). Deleting the moved tests from `utils.e2e.test.ts`
shrinks the e2e lane and moves ~50 tests into the ~5s unit lane.

### 4. Enable `fileParallelism: true` in `vitest.config.e2e.ts`

With `pool: 'forks'`, each worker boots its own Strapi in parallel. Expected
~3-5x wall-clock speedup (283s to ~60-90s on 4-8 workers).

**Requirements:**

- **Per-worker SQLite files** in `setup.ts`:
  `DATABASE_FILENAME=.tmp/test-${process.env.VITEST_WORKER_ID}.db` via env passed
  through `dotenv.config` override or `process.env` set before `createStrapi`.
  Without this, workers share `data.db`, causing write conflicts and flaky tests.
- **No port conflict**: verified `mount()` never calls `listen()`; supertest
  binds ephemeral ports. Safe.
- **In-memory state is per-worker** (rate limiter maps, OIDC config cache, JTI
  Map) — already process-local, no change needed.
- **Cleanup**: `afterAll` should unlink the worker's DB file to avoid `.tmp/`
  accumulating stale files across runs.

### 5. Stop running unit tests twice

`vitest.config.e2e.ts` currently includes `server/__tests__/unit/**` — they
re-execute inside the slow e2e run. Remove that `include` entry; `npm run
test:unit` owns them. The `test` script can chain both configs.

### 6. Update scripts in `package.json`

- `test` → run unit config then e2e config (or keep `test` as e2e-only and
  document `test:unit` + `test` as the full suite)
- Optionally add `test:e2e` alias for clarity

### 7. Verify + measure

- Run full unit lane (expect ~5-8s, ~160 tests after moves)
- Run full e2e lane with parallelism (expect ~60-90s)
- Confirm no cross-file flakes: run e2e 3x consecutively

## Risks / Watch Items

- **SQLite under parallel writers**: mitigated by per-worker files; in-file
  tests stay serial (vitest default), so no intra-file races.
- **Worker memory**: 8 Strapi instances is roughly 8 x 300-500MB. If the machine
  is constrained, cap with `--maxWorkers=4`.
- **Shared fixture side-effects**: `afterAll` in `setup.ts` deletes fixture
  users by email domain — with per-worker DBs this is naturally isolated, but
  the pattern stays as belt-and-braces within a file.
- **`backchannel-logout` rate-limit test**: currently only asserts a single
  request passes; a real 429 test needs 31+ requests and belongs in e2e (fine
  under parallelism since the limiter is per-worker).

## Execution Order

1 to 2 to 3 (unblocks unit lane), then 4 to 5 to 6 (parallelism), then 7
(verification). Steps 1-3 are independent of 4-6 and can land first as a safe
intermediate commit.
