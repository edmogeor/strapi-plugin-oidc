# REST API

The plugin exposes programmatic endpoints under `/api/strapi-plugin-oidc`. All requests require a Strapi **API token** in the `Authorization: Bearer <token>` header.

## Whitelist API

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

API calls write directly to the database. There is no unsaved state.

### Import Format

Accepted by both the API import endpoint and the Admin UI import button. If the email already exists as a Strapi admin user, their current roles are used automatically.

```json
[{ "email": "alice@example.com" }, { "email": "bob@example.com" }]
```

Duplicate emails within the payload and emails already in the whitelist are silently skipped.

### Examples

```bash
# List
curl -H "Authorization: Bearer <token>" \
  https://strapi.example.com/api/strapi-plugin-oidc/whitelist

# Export
curl -H "Authorization: Bearer <token>" \
  https://strapi.example.com/api/strapi-plugin-oidc/whitelist/export \
  -o whitelist.json

# Add
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}' \
  https://strapi.example.com/api/strapi-plugin-oidc/whitelist

# Bulk import
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"users": [{"email": "a@example.com"}, {"email": "b@example.com"}]}' \
  https://strapi.example.com/api/strapi-plugin-oidc/whitelist/import

# Delete one (by email)
curl -X DELETE -H "Authorization: Bearer <token>" \
  "https://strapi.example.com/api/strapi-plugin-oidc/whitelist/user%40example.com"

# Delete all
curl -X DELETE -H "Authorization: Bearer <token>" \
  https://strapi.example.com/api/strapi-plugin-oidc/whitelist
```

## Audit Log API

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

### Query Parameters (`GET /audit-logs`, `GET /audit-logs/export`)

| Parameter  | Default | Description                                    |
| ---------- | ------- | ---------------------------------------------- |
| `page`     | `1`     | Page number (list endpoint only)               |
| `pageSize` | `25`    | Results per page, max `100` (list only)        |
| `filters`  | -       | Field/operator filters, same on both endpoints |

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
  https://strapi.example.com/api/strapi-plugin-oidc/audit-logs
```

### Recorded Actions

| Action               | Trigger                                             |
| -------------------- | --------------------------------------------------- |
| `login_success`      | Successful OIDC authentication                      |
| `user_created`       | New Strapi admin user created during login          |
| `login_failure`      | Unexpected error during the OIDC login flow         |
| `missing_code`       | Callback received without an authorisation code     |
| `state_mismatch`     | CSRF state cookie does not match callback parameter |
| `whitelist_rejected` | Email not present in the active whitelist           |
| `email_not_verified` | Provider did not report `email_verified=true`       |
| `logout`             | User logged out (RP-initiated or backchannel)       |

Each event is also emitted on Strapi's internal eventHub as `strapi-plugin-oidc::auth.<action>`, which Enterprise audit log listeners pick up automatically.

### Examples

```bash
# Paginated list
curl -H "Authorization: Bearer <token>" \
  "https://strapi.example.com/api/strapi-plugin-oidc/audit-logs?page=1&pageSize=50"

# NDJSON export
curl -H "Authorization: Bearer <token>" \
  https://strapi.example.com/api/strapi-plugin-oidc/audit-logs/export \
  -o oidc-audit-log.ndjson
```
