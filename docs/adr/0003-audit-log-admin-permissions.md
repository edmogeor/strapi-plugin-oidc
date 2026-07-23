# ADR 0003: Require plugin permissions for audit-log admin routes

## Status

Accepted

## Context

The admin-side audit-log routes (`GET /audit-logs`, `GET /audit-logs/export`,
`DELETE /audit-logs`) were originally gated only by
`admin::isAuthenticatedAdmin`. That policy only verifies that the request has a
valid admin session; it does not check role-based permissions. As a result, any
logged-in admin user, including low-privilege roles such as Editor or Author,
could list, export, and delete the entire OIDC audit log.

Every other admin route in the plugin already used the local `adminPolicies(...)`
helper, which combines `admin::isAuthenticatedAdmin` with
`admin::hasPermissions`. The audit-log routes were an unintentional exception.
The corresponding content-api routes already used semantic scopes
(`PERMISSIONS.AUDIT_READ`, `PERMISSIONS.AUDIT_DELETE`), which reinforced that the
admin asymmetry was a bug.

## Decision

Apply the existing `adminPolicies(...)` helper to the three audit-log admin
routes:

- `GET /audit-logs` and `GET /audit-logs/export` require the plugin's `read`
  permission.
- `DELETE /audit-logs` requires the plugin's `update` permission.

No new permission UIDs are introduced; the plugin's existing `read` and `update`
actions (registered in `bootstrap.ts`) are reused.

## Consequences

- **Unauthorized admins are blocked.** Only users whose role grants the plugin's
  `read` permission can view or export audit logs; only users with `update` can
  clear them.
- **UI experience is unchanged for legitimate users.** The admin settings page
  already requires the plugin's `read`/`update` permissions, so any user who can
  navigate to the audit log UI already has the required permissions.
- **No breaking change for content-api consumers.** Content-api scopes are
  unchanged.
- **Backwards compatibility.** Existing super-admin users retain full access.
  Custom roles that previously could read or delete audit logs lose that ability
  unless their permissions are updated; this is the intended security fix.
