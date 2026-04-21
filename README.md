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
      // Required
      OIDC_DISCOVERY_URL: env('OIDC_DISCOVERY_URL'), // https://your-provider/.well-known/openid-configuration
      OIDC_CLIENT_ID: env('OIDC_CLIENT_ID'),
      OIDC_CLIENT_SECRET: env('OIDC_CLIENT_SECRET'),
      OIDC_REDIRECT_URI: env('OIDC_REDIRECT_URI'), // https://your-strapi.com/strapi-plugin-oidc/oidc/callback

      // Optional — defaults shown
      OIDC_SCOPE: 'openid profile email',
      OIDC_FAMILY_NAME_FIELD: 'family_name',
      OIDC_GIVEN_NAME_FIELD: 'given_name',
      OIDC_SSO_BUTTON_TEXT: 'Login via SSO',
      OIDC_ENFORCE: null, // null = use Admin UI toggle; true/false = override in config
      REMEMBER_ME: false, // Persist session across browser restarts
      AUDIT_LOG_RETENTION_DAYS: 90, // Set to 0 to disable audit logging; otherwise entries older than this many days are purged daily at midnight
      OIDC_GROUP_FIELD: 'groups', // OIDC claim field containing group membership
      OIDC_GROUP_ROLE_MAP: '{}', // JSON map of group names to Strapi role names
      OIDC_REQUIRE_EMAIL_VERIFIED: true, // Reject logins when provider does not report email_verified=true (set false to disable)
      OIDC_TRUSTED_IP_HEADER: '', // Optional: 'cf-connecting-ip' for Cloudflare; read only when Strapi trusts the proxy
      OIDC_FORCE_SECURE_COOKIES: false, // Set true when behind a trusted HTTPS proxy that Strapi can't auto-detect
    },
  },
});
```

`OIDC_DISCOVERY_URL` is the URL of your provider's OpenID Connect discovery document (`/.well-known/openid-configuration`). The plugin fetches it at startup and automatically configures all endpoints, JWKS URI, and issuer.

### Security features

- **ID token verification** — Enabled automatically when the discovery document includes a `jwks_uri`. Validates signature, issuer, audience, and expiry via [`jose`](https://github.com/panva/jose)
- **Email verification** — `OIDC_REQUIRE_EMAIL_VERIFIED: true` (default) rejects unverified emails
- **CSRF protection** — OIDC state/nonce and POST-only logout endpoint
- **Rate limiting** — 1 000 req/min per IP+UA (in-process; use a reverse-proxy-level limiter for multi-node)
- **Secure cookies** — `OIDC_FORCE_SECURE_COOKIES` ensures cookies are marked Secure

### Client IP attribution and reverse proxies

The plugin logs client IPs for rate-limit buckets and audit logs. When Strapi runs behind a reverse proxy, **set `server.proxy: true`** so Koa trusts `X-Forwarded-For`; otherwise all IPs will be the proxy's.

Set `OIDC_TRUSTED_IP_HEADER: 'cf-connecting-ip'` when behind Cloudflare. The header is only honoured when `server.proxy: true` is set.

## Login

Navigate to `/strapi-plugin-oidc/oidc` to start the OIDC flow, or click the **Login via SSO** button injected into the Strapi login page.

## Logout

When the discovery document includes an `end_session_endpoint`, clicking logout redirects to the provider's end-session URL (RP-initiated logout). If the provider session has already expired, Strapi skips the redirect and goes straight to the login page.

The logout endpoint is `POST /strapi-plugin-oidc/logout`. Using POST instead of GET prevents CSRF-forced-logout attacks.

## Admin Settings

Manage the plugin under **Settings → OIDC Plugin**.

**Default Roles** — Strapi admin role(s) assigned to new users on first login.

**Whitelist** — Restrict access to specific email addresses. When empty, any authenticated OIDC user gets an account. Supports:

- Individual emails with optional role overrides
- JSON import / export
- Bulk delete with confirmation

**Audit Logs** — Authentication events recorded and visible in the settings page. Filter by action, email, IP, and date. **Download** exports the current view as NDJSON. Set `AUDIT_LOG_RETENTION_DAYS` to `0` to disable. Records older than the configured value (default: 90 days) are purged daily.

**Enforce OIDC Login** — Removes email/password fields from the login page and blocks direct login API calls. Automatically disabled when the whitelist is empty to prevent lockout.

The toggle is grayed out when `OIDC_ENFORCE` is set in config. **Lockout recovery**: set `OIDC_ENFORCE: false` in your plugin config and restart Strapi.

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

1. **OIDC groups match `OIDC_GROUP_ROLE_MAP`** → mapped Strapi roles
2. **No match or no mapping** → default OIDC roles (new users only)

### Role updates on subsequent logins

- **New users** — Roles assigned on first login (group-mapped or default).
- **Existing users with group match** — Roles updated to reflect current mapping.
- **Existing users without group match** — Roles left unchanged. Manually-assigned roles are never overwritten.

## Whitelist API

The whitelist can be managed programmatically using a Strapi **API token**. All endpoints are under `/api/strapi-plugin-oidc` and require `Authorization: Bearer <token>`.

**Full-access tokens** can call all routes. **Custom tokens** must be granted one of the following scopes (Settings → API Tokens → Custom → plugin permissions):

| Scope                                         | Routes                                          |
| --------------------------------------------- | ----------------------------------------------- |
| `plugin::strapi-plugin-oidc.whitelist.read`   | `GET /whitelist`, `GET /whitelist/export`       |
| `plugin::strapi-plugin-oidc.whitelist.write`  | `POST /whitelist`, `POST /whitelist/import`     |
| `plugin::strapi-plugin-oidc.whitelist.delete` | `DELETE /whitelist`, `DELETE /whitelist/:email` |

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

Audit log entries can be fetched programmatically using a Strapi **API token**. Endpoints are under `/api/strapi-plugin-oidc` and require `Authorization: Bearer <token>`.

**Full-access tokens** can call all routes. **Custom tokens** must be granted one of the following scopes:

| Scope                                     | Routes                                      |
| ----------------------------------------- | ------------------------------------------- |
| `plugin::strapi-plugin-oidc.audit.read`   | `GET /audit-logs`, `GET /audit-logs/export` |
| `plugin::strapi-plugin-oidc.audit.delete` | `DELETE /audit-logs`                        |

| Method   | Path                                        | Description                         |
| -------- | ------------------------------------------- | ----------------------------------- |
| `GET`    | `/api/strapi-plugin-oidc/audit-logs`        | Paginated list of log entries       |
| `GET`    | `/api/strapi-plugin-oidc/audit-logs/export` | Matching records as NDJSON download |
| `DELETE` | `/api/strapi-plugin-oidc/audit-logs`        | Delete all audit log entries (204)  |

### Query parameters (`GET /audit-logs`, `GET /audit-logs/export`)

| Parameter  | Default | Description                                    |
| ---------- | ------- | ---------------------------------------------- |
| `page`     | `1`     | Page number (list endpoint only)               |
| `pageSize` | `25`    | Results per page, max `100` (list only)        |
| `filters`  | —       | Field/operator filters, same on both endpoints |

Results are sorted newest-first. The response shape is:

```json
{
  "results": [
    {
      "id": 42,
      "action": "login_success",
      "email": "alice@example.com",
      "ip": "203.0.113.42",
      "details": null,
      "createdAt": "2026-04-08T12:00:00.000Z",
      "updatedAt": "2026-04-08T12:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 25, "total": 1, "pageCount": 1 }
}
```

The NDJSON export emits one row per line with `{ datetime, action, email, ip, details }` where `datetime` is the entry's `createdAt` timestamp.

### Filtering

Use `filters[<field>][<operator>]=<value>` to narrow results. Invalid filters return a `400`.

| Field       | Operators                                            | Value                                                   |
| ----------- | ---------------------------------------------------- | ------------------------------------------------------- |
| `action`    | `$eq`, `$in`                                         | One of the [recorded actions](#recorded-actions)        |
| `email`     | `$eq`, `$contains`, `$endsWith`, `$null`, `$notNull` | String (use `true`/`false` with `$null` / `$notNull`)   |
| `ip`        | `$eq`, `$contains`, `$endsWith`, `$null`, `$notNull` | String (use `true`/`false` with `$null` / `$notNull`)   |
| `createdAt` | `$gte`, `$lt`, `$lte`, `$between`, `$in`             | ISO-8601 UTC timestamp, e.g. `2026-04-08T00:00:00.000Z` |

`$between` takes a `[start, end]` pair. `$in` on `createdAt` takes a list of day-start timestamps and matches anything within that UTC day.

```bash
# Failed logins on one day
curl -H "Authorization: Bearer <token>" -G \
  --data-urlencode 'filters[action][$eq]=login_failure' \
  --data-urlencode 'filters[createdAt][$gte]=2026-04-08T00:00:00.000Z' \
  --data-urlencode 'filters[createdAt][$lt]=2026-04-09T00:00:00.000Z' \
  http://localhost:1337/api/strapi-plugin-oidc/audit-logs
```

### Recorded actions

| Action                  | Trigger                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `login_success`         | Successful OIDC authentication                                    |
| `user_created`          | New Strapi admin user created during login                        |
| `login_failure`         | Unexpected error during the OIDC login flow                       |
| `missing_code`          | Callback received without an authorisation code                   |
| `state_mismatch`        | CSRF state cookie does not match callback parameter               |
| `nonce_mismatch`        | ID token nonce does not match the session nonce                   |
| `token_exchange_failed` | Provider returned an error during token exchange                  |
| `whitelist_rejected`    | Email not present in the active whitelist                         |
| `email_not_verified`    | Provider did not report `email_verified=true`                     |
| `id_token_invalid`      | ID token failed signature, issuer, audience, or expiry validation |
| `logout`                | User logged out via `/logout`                                     |
| `session_expired`       | Logout attempted but provider session already stale               |

Each event is also emitted on Strapi's internal eventHub as `strapi-plugin-oidc::auth.<action>`, which Enterprise audit log listeners pick up automatically.

### Examples

```bash
# Paginated list
curl -H "Authorization: Bearer <token>" \
  "http://localhost:1337/api/strapi-plugin-oidc/audit-logs?page=1&pageSize=50"

# NDJSON export
curl -H "Authorization: Bearer <token>" \
  http://localhost:1337/api/strapi-plugin-oidc/audit-logs/export \
  -o oidc-audit-log.ndjson
```

## Credits & Changes

This plugin is a hard fork of [`strapi-plugin-sso`](https://github.com/yasudacloud/strapi-plugin-sso) by **yasudacloud**. Huge thanks to them for creating the foundation of this plugin!

### Changes from the original:

- OIDC-only (removed other SSO methods)
- Redesigned whitelist and role management UI using native Strapi components
- OIDC enforcement via admin toggle or `OIDC_ENFORCE` config
- RP-initiated logout with smart session detection
- Migrated to Vitest with e2e coverage
- Config variable names aligned with OIDC discovery document field names
- **Login via SSO** button always injected; text configurable via `OIDC_SSO_BUTTON_TEXT`
- Whitelist REST API with JSON import/export, bulk delete, delete by email
- Hardened OIDC flow: server-generated state and nonce, PKCE, Bearer token auth for userinfo, generic error messages on failure
- Audit log: records all auth events to a queryable table with UI, JSON/NDJSON export, and REST API

## License

[MIT](./LICENSE)
