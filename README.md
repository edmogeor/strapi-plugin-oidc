<div align="center">
  <img src="https://raw.githubusercontent.com/edmogeor/strapi-plugin-oidc/main/assets/icon.png" width="140" alt="OIDC Login for Strapi Logo"/>
  <h1>OIDC Login for Strapi</h1>
  <p>
    <a href="https://www.npmjs.com/package/strapi-plugin-oidc">
      <img src="https://img.shields.io/npm/v/strapi-plugin-oidc.svg" alt="npm version">
    </a>
    <a href="https://github.com/edmogeor/strapi-plugin-oidc/actions/workflows/ci.yml">
      <img src="https://github.com/edmogeor/strapi-plugin-oidc/actions/workflows/ci.yml/badge.svg" alt="CI"/>
    </a>
    <a href="./LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"/>
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
      // Required — find these in your provider's OIDC discovery document
      OIDC_CLIENT_ID: env('OIDC_CLIENT_ID'),
      OIDC_CLIENT_SECRET: env('OIDC_CLIENT_SECRET'),
      OIDC_REDIRECT_URI: env('OIDC_REDIRECT_URI'), // https://your-strapi.com/strapi-plugin-oidc/oidc/callback
      OIDC_AUTHORIZATION_ENDPOINT: env('OIDC_AUTHORIZATION_ENDPOINT'),
      OIDC_TOKEN_ENDPOINT: env('OIDC_TOKEN_ENDPOINT'),
      OIDC_USERINFO_ENDPOINT: env('OIDC_USERINFO_ENDPOINT'),

      // Optional — defaults shown
      OIDC_SCOPE: 'openid profile email',
      OIDC_GRANT_TYPE: 'authorization_code',
      OIDC_FAMILY_NAME_FIELD: 'family_name',
      OIDC_GIVEN_NAME_FIELD: 'given_name',
      OIDC_END_SESSION_ENDPOINT: '', // Provider end-session URL for RP-initiated logout
      OIDC_SSO_BUTTON_TEXT: 'Login via SSO',
      OIDC_ENFORCE: null, // null = use Admin UI toggle; true/false = override in config
      REMEMBER_ME: false, // Persist session across browser restarts
      AUDIT_LOG_RETENTION_DAYS: 90, // Set to 0 to disable audit logging; otherwise entries older than this many days are purged daily at midnight
      OIDC_GROUP_FIELD: 'groups', // OIDC claim field containing group membership
      OIDC_GROUP_ROLE_MAP: '{}', // JSON map of group names to Strapi role names
    },
  },
});
```

All required values come from your provider's OIDC discovery document, typically available at `https://your-provider/.well-known/openid-configuration`.

## Login

Navigate to `/strapi-plugin-oidc/oidc` to start the OIDC flow, or click the **Login via SSO** button injected into the Strapi login page.

## Logout

When `OIDC_END_SESSION_ENDPOINT` is set, clicking logout in Strapi redirects the browser to the provider's end-session URL (RP-initiated logout). If the provider session has already expired, Strapi skips the redirect and goes straight to the login page.

## Admin Settings

Manage the plugin under **Settings → OIDC Plugin**.

**Default Roles** — Select which Strapi admin role(s) are assigned to new users on first login.

**Whitelist** — Restrict access to specific email addresses. When enabled, only listed emails can log in. When empty, any successfully authenticated OIDC user gets an account. The whitelist supports:

- Adding individual emails with optional role overrides
- JSON import / export (see [format](#import-format) below)
- Bulk delete with confirmation
- Unsaved changes are held in the UI until **Save Changes** is clicked

**Audit Logs** — Every authentication event is recorded in the plugin's audit log table and visible in the **Audit Logs** section at the bottom of the settings page. A **Download** button exports all records as JSON, compatible with SIEM tools and log processors. Setting `AUDIT_LOG_RETENTION_DAYS` to `0` disables audit logging entirely. Otherwise records older than the configured value (default: 90 days) are automatically purged by a daily cron job. The audit log is also accessible [via API](#audit-log-api).

**Enforce OIDC Login** — Removes the standard email/password fields from the login page and blocks direct login API calls server-side. Automatically disabled when the whitelist is empty to prevent lockout.

- The toggle is grayed out and locked when `OIDC_ENFORCE` is set in config.
- **Lockout recovery**: set `OIDC_ENFORCE: false` in your plugin config and restart Strapi. This writes through to the database so removing the variable afterwards keeps the setting.

## Group-to-Role Mapping

When your OIDC provider includes group membership in the userinfo response (e.g. a `groups` claim containing `["strapi-admins", "strapi-editors"]`), you can automatically assign Strapi roles based on group membership.

| Setting               | Default    | Description                                               |
| --------------------- | ---------- | --------------------------------------------------------- |
| `OIDC_GROUP_FIELD`    | `'groups'` | OIDC claim field that contains the group membership array |
| `OIDC_GROUP_ROLE_MAP` | `'{}'`     | JSON map of group names → Strapi role names               |

### Example configuration

```javascript
module.exports = ({ env }) => ({
  'strapi-plugin-oidc': {
    enabled: true,
    config: {
      // ... other OIDC config ...
      OIDC_GROUP_FIELD: 'groups',
      OIDC_GROUP_ROLE_MAP: JSON.stringify({
        'strapi-admins': ['Super Admin'],
        'strapi-editors': ['Editor'],
        'strapi-authors': ['Editor', 'Author'],
      }),
    },
  },
});
```

Role names are the **display names** shown in **Settings → Roles** (e.g. `"Editor"`, `"Super Admin"`, `"Author"`). IDs are not supported — use names for clarity.

### Role assignment precedence

1. **User's OIDC groups match `OIDC_GROUP_ROLE_MAP`** → use the mapped Strapi roles
2. **No group match or no mapping configured** → use the default OIDC roles (new users only — see below)

### Role updates on subsequent logins

- **New users** — Roles are always assigned on first login: group-mapped roles if a match is found, otherwise the configured default OIDC roles.
- **Existing users with a group mapping match** — Roles are updated to reflect the current mapping. If a user's groups change between logins, their Strapi roles are updated accordingly.
- **Existing users with no group mapping match** — Roles are left unchanged, regardless of what the default OIDC roles are set to. Manually-assigned roles are never overwritten by a default fallback.

## Whitelist API

The whitelist can be managed programmatically using a Strapi **API token** (Settings → API Tokens → Full Access). All endpoints are under `/api/strapi-plugin-oidc` and require `Authorization: Bearer <token>`.

| Method   | Path                                       | Description            |
| -------- | ------------------------------------------ | ---------------------- |
| `GET`    | `/api/strapi-plugin-oidc/whitelist`        | List all entries       |
| `GET`    | `/api/strapi-plugin-oidc/whitelist/export` | Export as JSON         |
| `POST`   | `/api/strapi-plugin-oidc/whitelist`        | Add one or more emails |
| `POST`   | `/api/strapi-plugin-oidc/whitelist/import` | Bulk import            |
| `DELETE` | `/api/strapi-plugin-oidc/whitelist/:email` | Remove by email        |
| `DELETE` | `/api/strapi-plugin-oidc/whitelist`        | Remove all entries     |

API calls write directly to the database — there is no unsaved state.

### Import format

Accepted by both the API import endpoint and the Admin UI import button. If the email already exists as a Strapi admin user, their current roles are used automatically.

```json
[{ "email": "alice@example.com" }, { "email": "bob@example.com" }]
```

Duplicate emails within the payload and emails already in the whitelist are silently skipped.

### Examples

```bash
# List
curl -H "Authorization: Bearer <token>" \
  http://localhost:1337/api/strapi-plugin-oidc/whitelist

# Export
curl -H "Authorization: Bearer <token>" \
  http://localhost:1337/api/strapi-plugin-oidc/whitelist/export \
  -o whitelist.json

# Add
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}' \
  http://localhost:1337/api/strapi-plugin-oidc/whitelist

# Bulk import
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"users": [{"email": "a@example.com"}, {"email": "b@example.com"}]}' \
  http://localhost:1337/api/strapi-plugin-oidc/whitelist/import

# Delete one (by email)
curl -X DELETE -H "Authorization: Bearer <token>" \
  "http://localhost:1337/api/strapi-plugin-oidc/whitelist/user%40example.com"

# Delete all
curl -X DELETE -H "Authorization: Bearer <token>" \
  http://localhost:1337/api/strapi-plugin-oidc/whitelist
```

## Audit Log API

Audit log entries can be fetched programmatically using a Strapi **API token** (Settings → API Tokens → Full Access). Endpoints are under `/api/strapi-plugin-oidc` and require `Authorization: Bearer <token>`.

| Method | Path                                        | Description                   |
| ------ | ------------------------------------------- | ----------------------------- |
| `GET`  | `/api/strapi-plugin-oidc/audit-logs`        | Paginated list of log entries |
| `GET`  | `/api/strapi-plugin-oidc/audit-logs/export` | All records as JSON download  |

### Query parameters (`GET /audit-logs`)

| Parameter  | Default | Description      |
| ---------- | ------- | ---------------- |
| `page`     | `1`     | Page number      |
| `pageSize` | `25`    | Results per page |

Results are sorted newest-first. The response shape is:

```json
{
  "results": [
    {
      "datetime": "2026-04-08T12:00:00.000Z",
      "action": "login_success",
      "email": "alice@example.com",
      "ip": "203.0.113.42"
    }
  ],
  "pagination": { "page": 1, "pageSize": 25, "total": 1, "pageCount": 1 }
}
```

### Recorded actions

| Action                  | Trigger                                             |
| ----------------------- | --------------------------------------------------- |
| `login_success`         | Successful OIDC authentication                      |
| `user_created`          | New Strapi admin user created during login          |
| `login_failure`         | Generic authentication error (missing code, etc.)   |
| `state_mismatch`        | CSRF state cookie does not match callback parameter |
| `nonce_mismatch`        | ID token nonce does not match the session nonce     |
| `token_exchange_failed` | Provider returned an error during token exchange    |
| `whitelist_rejected`    | Email not present in the active whitelist           |
| `logout`                | User logged out via `/logout`                       |
| `session_expired`       | Logout attempted but provider session already stale |

Each event is also emitted on Strapi's internal eventHub as `strapi-plugin-oidc::auth.<action>`, which Enterprise audit log listeners pick up automatically.

### Examples

```bash
# Paginated list
curl -H "Authorization: Bearer <token>" \
  "http://localhost:1337/api/strapi-plugin-oidc/audit-logs?page=1&pageSize=50"

# JSON export
curl -H "Authorization: Bearer <token>" \
  http://localhost:1337/api/strapi-plugin-oidc/audit-logs/export \
  -o oidc-audit-log.json
```

## Credits & Changes

This plugin is a hard fork of [`strapi-plugin-sso`](https://github.com/yasudacloud/strapi-plugin-sso) by **yasudacloud**. Huge thanks to them for creating the foundation of this plugin!

### Changes from the original:

- Removed alternative SSO methods to focus solely on OIDC.
- Redesigned the Whitelist and Role management UI using native Strapi components.
- Added OIDC enforcement with an admin toggle and config override (`OIDC_ENFORCE`).
- Added RP-initiated logout with smart session detection — skips the provider redirect if the session is already expired.
- Migrated to Vitest with comprehensive e2e test coverage.
- Config variable names aligned with OIDC discovery document field names (`OIDC_SCOPE`, `OIDC_USERINFO_ENDPOINT`, `OIDC_END_SESSION_ENDPOINT`).
- Always injects a **Login via SSO** button on the Strapi login page. Button text is configurable via `OIDC_SSO_BUTTON_TEXT`.
- Whitelist: programmatic REST API with JSON import/export, bulk delete, delete by email, and unsaved changes guard.
- Hardened OIDC flow: server-generated state and nonce, PKCE, Bearer token auth for userinfo, and generic error messages on failure.
- Audit log: records all auth events to a queryable table with Admin UI, JSON export, and REST API. API responses use a single `datetime` field and omit framework metadata (id, documentId, locale, publishedAt, etc.). A separate `user_created` event is emitted when a Strapi admin is provisioned during login.

## License

[MIT](./LICENSE)
