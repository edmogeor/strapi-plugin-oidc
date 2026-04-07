<div align="center">
  <img src="https://raw.githubusercontent.com/edmogeor/strapi-plugin-oidc/main/assets/icon.png" width="140" alt="OIDC Login for Strapi Logo"/>
  <h1>OIDC Login for Strapi</h1>
  <p>
    <a href="https://www.npmjs.com/package/strapi-plugin-oidc">
      <img src="https://img.shields.io/npm/v/strapi-plugin-oidc.svg" alt="npm version">
    </a>
    <a href="https://github.com/edmogeor/strapi-plugin-oidc/actions/workflows/test.yml">
      <img src="https://github.com/edmogeor/strapi-plugin-oidc/actions/workflows/test.yml/badge.svg?branch=main" alt="Tests">
    </a>
  </p>
</div>

A Strapi plugin that provides OpenID Connect (OIDC) authentication for the Strapi Admin Panel. Supports Keycloak, Auth0, Okta, Azure AD, Authentik, Authelia, and any other OpenID Connect provider.

## Installation

```bash
npm install strapi-plugin-oidc
```

## Configuration

Add the plugin to `config/plugins.js` (or `.ts`):

```javascript
module.exports = ({ env }) => ({
  'strapi-plugin-oidc': {
    enabled: true,
    config: {
      // Required
      OIDC_CLIENT_ID: env('OIDC_CLIENT_ID'),
      OIDC_CLIENT_SECRET: env('OIDC_CLIENT_SECRET'),
      OIDC_REDIRECT_URI: env('OIDC_REDIRECT_URI'), // https://your-strapi.com/strapi-plugin-oidc/oidc/callback
      OIDC_AUTHORIZATION_ENDPOINT: env('OIDC_AUTHORIZATION_ENDPOINT'),
      OIDC_TOKEN_ENDPOINT: env('OIDC_TOKEN_ENDPOINT'),
      OIDC_USERINFO_ENDPOINT: env('OIDC_USERINFO_ENDPOINT'),

      // Optional
      OIDC_SCOPE: 'openid profile email',
      OIDC_GRANT_TYPE: 'authorization_code',
      OIDC_FAMILY_NAME_FIELD: 'family_name',
      OIDC_GIVEN_NAME_FIELD: 'given_name',
      OIDC_SSO_BUTTON_TEXT: 'Login via SSO',
      OIDC_ENFORCE: null, // null = use Admin UI toggle; true/false = override
      REMEMBER_ME: false,

      // Optional — RP-Initiated Logout
      // Redirects the browser to the provider's end-session page on logout.
      // Both found in your provider's /.well-known/openid-configuration.
      OIDC_END_SESSION_ENDPOINT: env('OIDC_END_SESSION_ENDPOINT', ''),
      OIDC_POST_LOGOUT_REDIRECT_URI: env('OIDC_POST_LOGOUT_REDIRECT_URI', ''),

      // Optional — Backchannel Logout
      // Allows the provider to revoke Strapi sessions server-to-server.
      // Set your provider's logout URI to: https://your-strapi.com/strapi-plugin-oidc/logout
      // Both found in your provider's /.well-known/openid-configuration.
      OIDC_ISSUER: env('OIDC_ISSUER', ''),
      OIDC_JWKS_URI: env('OIDC_JWKS_URI', ''),
    },
  },
});
```

## Login

Navigate to `/strapi-plugin-oidc/oidc` to start the OIDC flow, or click the **Login via SSO** button that is always injected into the Strapi login page.

## Admin Settings

Manage the plugin under **Settings → OIDC Plugin**.

**Default Roles** — Select which Strapi admin role(s) are assigned to new users on first login.

**Whitelist** — Restrict access to specific email addresses. When the whitelist is enabled, only listed emails can log in. When empty, any successfully authenticated OIDC user gets an account. The whitelist supports:

- Adding individual emails with optional role overrides
- JSON import / export (see [format](#import-format) below)
- Bulk delete with confirmation
- Unsaved changes are held in the UI until **Save Changes** is clicked

**Enforce OIDC Login** — Removes the standard email/password fields from the login page and blocks direct login API calls server-side. Automatically disabled when the whitelist is empty to prevent lockout.

- The toggle is grayed out and locked when `OIDC_ENFORCE` is set in config.
- **Lockout recovery**: set `OIDC_ENFORCE: false` in your plugin config and restart Strapi. This writes through to the database so removing the variable afterwards keeps the setting.

## Whitelist API

The whitelist can be managed programmatically using a Strapi **API token** (Settings → API Tokens → Full Access). All endpoints are under `/api/strapi-plugin-oidc` and require `Authorization: Bearer <token>`.

| Method   | Path                                       | Description            |
| -------- | ------------------------------------------ | ---------------------- |
| `GET`    | `/api/strapi-plugin-oidc/whitelist`        | List all entries       |
| `POST`   | `/api/strapi-plugin-oidc/whitelist`        | Add one or more emails |
| `POST`   | `/api/strapi-plugin-oidc/whitelist/import` | Bulk import            |
| `DELETE` | `/api/strapi-plugin-oidc/whitelist/:id`    | Remove by ID           |
| `DELETE` | `/api/strapi-plugin-oidc/whitelist`        | Remove all entries     |

API calls write directly to the database — there is no unsaved state.

### Import format

Accepted by both the API import endpoint and the Admin UI import button. `roles` is optional and accepts role **names** (recommended) or numeric IDs. If the email already exists as a Strapi admin user, their current roles are used automatically.

```json
[
  { "email": "alice@example.com", "roles": ["Editor"] },
  { "email": "bob@example.com", "roles": ["Editor", "Author"] },
  { "email": "carol@example.com" }
]
```

Duplicate emails within the payload and emails already in the whitelist are silently skipped.

### Examples

```bash
# List
curl -H "Authorization: Bearer <token>" \
  http://localhost:1337/api/strapi-plugin-oidc/whitelist

# Add
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "roles": ["Editor"]}' \
  http://localhost:1337/api/strapi-plugin-oidc/whitelist

# Bulk import
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"users": [{"email": "a@example.com", "roles": ["Editor"]}, {"email": "b@example.com"}]}' \
  http://localhost:1337/api/strapi-plugin-oidc/whitelist/import

# Delete one
curl -X DELETE -H "Authorization: Bearer <token>" \
  http://localhost:1337/api/strapi-plugin-oidc/whitelist/42

# Delete all
curl -X DELETE -H "Authorization: Bearer <token>" \
  http://localhost:1337/api/strapi-plugin-oidc/whitelist
```

## Credits & Changes

This plugin is a hard fork of [`strapi-plugin-sso`](https://github.com/yasudacloud/strapi-plugin-sso) by **yasudacloud**. Huge thanks to them for creating the foundation of this plugin!

### Changes made to the original codebase:

- Removed alternative SSO methods to simplify the plugin.
- Redesigned the Whitelist and Role management UI (switched to native Strapi cards, added pagination, etc.).
- Added an option to "Enforce OIDC login" with an admin toggle (automatically disabled if the whitelist is empty).
- Migrated the testing framework to Vitest and added comprehensive test coverage for controllers and services.
- Cleaned up dead code and unused dependencies to improve maintainability.
- Upgraded to use newer versions of Node.js.
- Added styled success and error pages.
- Always injects a "Login via SSO" button on the Strapi login page. Button text is configurable via `OIDC_SSO_BUTTON_TEXT`. When enforcement is on, standard login fields are hidden so only the SSO button is visible.
- Whitelist improvements:
  - JSON import and export (uses human-readable role names).
  - Bulk delete all entries with a confirmation dialog.
  - Unsaved changes confirmation when navigating away from the settings page.
  - Programmatic API for managing the whitelist via Strapi API tokens (list, register, import, delete, delete all).
- **RP-Initiated Logout** (OpenID Connect RP-Initiated Logout 1.0): on logout, Strapi redirects the browser to the provider's end-session endpoint with `id_token_hint` and `post_logout_redirect_uri`, cleanly terminating the SSO session. Configured via `OIDC_END_SESSION_ENDPOINT` and `OIDC_POST_LOGOUT_REDIRECT_URI`.
- **Backchannel Logout** (OIDC Back-Channel Logout 1.0): `POST /strapi-plugin-oidc/logout` accepts a signed logout token from the provider, validates it, and revokes the user's Strapi admin session — keeping Strapi in sync when a user logs out elsewhere. Configured via `OIDC_ISSUER` and `OIDC_JWKS_URI`.
- Renamed config keys to match OIDC discovery document field names: `OIDC_LOGOUT_URL` → `OIDC_END_SESSION_ENDPOINT`, `OIDC_USER_INFO_ENDPOINT` → `OIDC_USERINFO_ENDPOINT`, `OIDC_SCOPES` → `OIDC_SCOPE`.
- Security hardening: PKCE (`S256`), server-side `state` generation (CSRF protection), nonce validation (ID token replay prevention), `Authorization: Bearer` header for userinfo requests, generic error messages on callback failure.
- Added misc. quality of life improvements and bug fixes.
