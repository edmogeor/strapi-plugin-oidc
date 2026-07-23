# Tests

This directory contains the unit and End-to-End (E2E) test suites for the `strapi-plugin-oidc` plugin.

Unit tests run against mocked Strapi contexts and cover pure utility logic. E2E tests boot real Strapi instances in forked Vitest workers with per-worker SQLite databases.

## Running tests

```bash
# Fast unit lane (no Strapi boot required)
npm run test:unit

# E2E lane — first ensure the test app dependencies are installed and built
cd test-app
npm install
npm run build
cd ..
npm run test:e2e

# Full CI lane (typecheck + unit + E2E)
npm run test
```

### Test coverage

To run the tests and generate a coverage report, append the `--coverage` flag:

```bash
npm run test:unit -- --coverage
npm run test:e2e -- --coverage
npm run test -- --coverage
```

This runs Vitest with the V8 coverage provider and generates a text summary in the console plus a detailed HTML report in the `coverage` directory.

## Test app accounts

The `test-app` uses a SQLite database with a super admin account for testing purposes. Credentials are defined in `test-app/.env` and should be set up locally before running E2E tests.
