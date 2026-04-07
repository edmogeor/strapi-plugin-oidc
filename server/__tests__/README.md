# Tests

This directory contains the End-to-End (E2E) tests for the `strapi-plugin-oidc` plugin.

## Running Tests

To run the tests, you should first ensure the test app is built and dependencies are installed.

```bash
cd test-app
npm install
npm run build
cd ..
npm run test
```

### Test Coverage

To run the tests and generate a coverage report, you can append the `--coverage` flag to the test command:

```bash
npm run test -- --coverage
```

This will run Vitest with the V8 coverage provider and generate a text summary in the console as well as a more detailed HTML report in the `coverage` directory.

## Test App Accounts

The `test-app` uses a SQLite database with a super admin account for testing purposes. Credentials are defined in `test-app/.env` and should be set up locally before running tests.
