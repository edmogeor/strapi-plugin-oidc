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

## Test App Accounts

The `test-app` includes a pre-configured SQLite database with a super admin account for testing purposes.

**Super Admin Login Details:**
- **Email:** `admin@strapi.test`
- **Password:** `SuperAdmin123`
