# Security Implementation Plan

This plan addresses high-confidence findings from the security review of the Strapi v5 OIDC plugin. Each fix is verified to not break Strapi v5 compatibility and follows existing plugin/core conventions.

---

## Finding 1 — Audit Log admin routes are missing permission checks

### Summary

Severity: **Medium-High**
Category: `broken_access_control` / `privilege_escalation`
Files: `server/routes/index.ts:170-186`

The admin-side audit-log routes are gated only by `admin::isAuthenticatedAdmin`, with **no `admin::hasPermissions` check**. Strapi's `isAuthenticatedAdmin` policy only verifies `ctx.state.isAuthenticated` (see `packages/core/admin/server/src/policies/isAuthenticatedAdmin.ts`), meaning **any logged-in admin user — regardless of role or assigned permissions — can read, export and delete the OIDC audit log**.

```ts
// server/routes/index.ts (current)
{ method: 'GET',    path: '/audit-logs',        handler: 'auditLog.find',
  config: { policies: ['admin::isAuthenticatedAdmin'] } },
{ method: 'GET',    path: '/audit-logs/export', handler: 'auditLog.export',
  config: { policies: ['admin::isAuthenticatedAdmin'] } },
{ method: 'DELETE', path: '/audit-logs',        handler: 'auditLog.clearAll',
  config: { policies: ['admin::isAuthenticatedAdmin'] } },
```

Compare with every other admin route in the same file, which uses the local `adminPolicies(...)` helper to combine `isAuthenticatedAdmin` **and** `hasPermissions`. The audit-log routes were added without this second gate.

### Impact

- **Data exposure:** any non-super-admin (Author, Editor, custom roles) can list and export every login/logout event including admin emails and source IPs.
- **Audit-trail destruction:** the `DELETE /audit-logs` route lets the same low-privilege users wipe the entire audit history — directly defeating the purpose of an audit log and erasing forensic evidence of attacks.
- The corresponding `content-api` routes already use semantic scopes (`PERMISSIONS.AUDIT_READ`, `PERMISSIONS.AUDIT_DELETE`), so the asymmetry between admin and API surfaces is clearly unintentional.

### Compatibility note

`admin::hasPermissions` is Strapi's first-party policy used throughout core (e.g. `packages/core/admin/server/src/routes/admin.ts:14-30`). Adding it does **not** break compatibility. No changes to the existing `read` / `update` permission UIDs are required — they are already registered in `bootstrap.ts:71-76`.

### Implementation

**1. Reuse the existing `adminPolicies` helper** in `server/routes/index.ts`. Apply `read` for fetch/export and `update` for destructive operations:

```ts
{
  method: 'GET',
  path: '/audit-logs',
  handler: 'auditLog.find',
  config: adminPolicies('read'),
},
{
  method: 'GET',
  path: '/audit-logs/export',
  handler: 'auditLog.export',
  config: adminPolicies('read'),
},
{
  method: 'DELETE',
  path: '/audit-logs',
  handler: 'auditLog.clearAll',
  config: adminPolicies('update'),
},
```

This matches the pattern already used for `oidc-roles`, `whitelist`, `whitelist/settings`, `whitelist/sync`, `whitelist/import`, `whitelist/:email`, and `whitelist/export`.

**2. (Optional, follow-up):** Consider introducing dedicated audit-scoped permissions on the admin side to mirror the content-api semantics (`audit.read`, `audit.delete`). This is a UX/RBAC refinement, not a security fix, and can be deferred. If introduced, register them via `strapi.admin.services.permission.actionProvider.registerMany` in `bootstrap.ts` alongside the existing `read`/`update` actions.

### Verification

- **Unit / e2e:** extend `server/__tests__/e2e/auditlog.e2e.test.ts` with cases that:
  1. Authenticated admin **without** the `plugin::strapi-plugin-oidc.read` permission → `GET /strapi-plugin-oidc/audit-logs` returns 403.
  2. Same user → `GET /strapi-plugin-oidc/audit-logs/export` returns 403.
  3. Same user → `DELETE /strapi-plugin-oidc/audit-logs` returns 403.
  4. User with the appropriate permission → all three succeed (regression check).
- **Manual:** create a Strapi role with no plugin permissions, log in as that user, hit each endpoint with the admin JWT, expect 403.

### Rollout

- Low risk. Anyone using the admin UI must already have read/update on the plugin to see the settings page where the audit log is rendered, so the UI experience is unchanged for legitimate users.
- Add a one-line note to `CHANGELOG.md` under the next release: _"Audit log admin endpoints now require the plugin's read/update permissions (previously any authenticated admin could access them)."_

---

## Items intentionally not changed

The following were considered during the review and are **not** being changed, either because they are defense-in-depth concerns with no concrete exploit path, fall under documented optional behavior, are excluded by the review scope (DoS, log spoofing, hardening), or would require breaking Strapi v5 contracts:

- **Optional ID-token signature verification when `OIDC_JWKS_URI` is unset** (`server/controllers/oidc/shared.ts:40-46`, `server/controllers/oidc/callback.ts:55-71`). The id-token signature is skipped when no JWKS URI is configured; the nonce is still validated against an unverified parse. This is documented as opt-in and is _not_ exploitable in the current flow because the authoritative user identity is fetched from the `userinfo_endpoint` using the access token issued by the configured (trusted) token endpoint — the id-token claims are only used for nonce/replay validation. Recommendation for documentation only: encourage operators to always set `OIDC_JWKS_URI` (already auto-populated via discovery in `server/utils/discovery.ts`).
- **Audit-log spoofing via attacker-controlled `oidc_user_email` cookie at `/logout`** — falls under the "log spoofing is not a vulnerability" exclusion.
- **Substring path matching in the enforce-OIDC middleware** (`server/bootstrap.ts:21`) — over-broad matching, but it only _blocks_ requests when enforcement is on; cannot be used to bypass authentication.
