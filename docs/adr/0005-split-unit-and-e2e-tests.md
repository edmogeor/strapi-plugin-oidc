# ADR 0005: Split tests into unit and parallel E2E lanes

## Status

Accepted

## Context

The E2E suite originally ran all tests sequentially against a single booted
Strapi instance and took roughly 4-5 minutes. Many of the tests exercised pure
utility functions (config parsing, cookie helpers, IP extraction, string
interpolation) and did not need a real HTTP stack or database. Running them
inside the E2E lane wasted wall-clock time and made the feedback loop slow.

In addition, because E2E tests ran serially in one process, they could not take
advantage of available CPU cores. The test setup also shared a single SQLite
file, which would conflict under parallel workers.

## Decision

Split the test suite into two lanes and parallelize the slow lane:

1. **Unit lane** — Fast tests against mocked Strapi contexts.
   - Create a minimal `mock-strapi.ts` factory.
   - Move config-only, cookie, IP, enforce-OIDC, and skip-login-page utility
     tests from E2E to unit.
2. **E2E lane** — Real Strapi instances, run in forked Vitest workers with
   `fileParallelism: true` and `pool: 'forks'`.
   - Assign each worker its own SQLite database file using
     `VITEST_WORKER_ID` (`.tmp/test-${workerId}.db`).
   - Clean up the worker's database files in `afterAll`.
3. **Scripts** — `npm test` runs typecheck, then unit, then E2E. Dedicated
   `test:unit` and `test:e2e` scripts are provided.
4. **Typecheck** — Add `tsconfig.test.json` so test files are typechecked on CI.

## Consequences

- **Faster feedback.** Unit tests run in seconds; E2E wall-clock time drops
  significantly because files run in parallel.
- **No shared database corruption.** Per-worker SQLite files eliminate write
  conflicts between parallel tests.
- **Cleaner separation of concerns.** Utility logic is tested without booting
  Strapi; integration behavior is tested against real Strapi instances.
- **Memory cost.** Each forked worker boots its own Strapi process, so peak
  memory scales with worker count. This is mitigated by capping workers on
  resource-constrained machines.
- **Tests must be hermetic.** Tests cannot rely on global state from previous
  files because the execution order is non-deterministic.
