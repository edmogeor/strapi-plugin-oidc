# Audit Log Feature — strapi-plugin-oidc

## Implementation Constraints

- **Full TypeScript type safety required** — no `any` types. All new code must be fully typed. Add the following to `server/types.ts` (following the existing interface pattern):

```typescript
export type AuditAction =
  | 'login_success'
  | 'login_failure'
  | 'state_mismatch'
  | 'nonce_mismatch'
  | 'token_exchange_failed'
  | 'whitelist_rejected'
  | 'logout'
  | 'session_expired'
  | 'user_created';

export interface AuditEntry {
  action: AuditAction;
  email?: string;
  userId?: number;
  ip?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditLogRecord extends AuditEntry {
  id: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogService {
  log(entry: AuditEntry): Promise<void>;
  find(opts?: {
    page?: number;
    pageSize?: number;
  }): Promise<{
    results: AuditLogRecord[];
    pagination: { page: number; pageSize: number; total: number; pageCount: number };
  }>;
  findAll(): Promise<AuditLogRecord[]>;
  cleanup(retentionDays: number): Promise<void>;
}
```

---

## Context

The plugin currently emits `admin.auth.success` on successful OIDC login but has no audit trail for failures, logouts, whitelist rejections, or session expiry. This makes it hard to diagnose SSO issues and fails basic compliance requirements (SOC 2, ISO 27001). The feature should align with Strapi's event-driven approach so Enterprise users benefit automatically, while also persisting logs for non-Enterprise users.

---

## Approach

**Two-layer design:**

1. **EventHub emissions** — emit named events via `strapi.serviceMap.get('eventHub')` for every auth lifecycle event. This integrates transparently with Strapi Enterprise audit logs and any custom listeners.
2. **Persistent content-type** — store each event as a record so all users can browse logs in the plugin admin UI without Enterprise.

A single `auditLog` service wraps both layers. Controllers call it directly.

---

## Events to Audit

| Action constant      | Trigger point                             | Key payload                     |
| -------------------- | ----------------------------------------- | ------------------------------- |
| `login_success`      | After `handleUserAuthentication` succeeds | email, userId, ip, userCreated  |
| `login_failure`      | Catch block in `oidcSignInCallback`       | email (best-effort), ip, reason |
| `state_mismatch`     | Early return in `oidcSignInCallback`      | ip                              |
| `whitelist_rejected` | Catch block (error message match)         | email, ip                       |
| `logout`             | In `logout()` before redirect             | ip                              |
| `session_expired`    | In `logout()` when provider token invalid | ip                              |
| `user_created`       | After `createUser` in `registerNewUser`   | email, userId, ip               |

---

## Files to Create

### `server/content-types/audit-log/schema.json`

```json
{
  "info": {
    "singularName": "audit-log",
    "pluralName": "audit-logs",
    "collectionName": "audit_logs",
    "displayName": "OIDC Audit Log"
  },
  "options": { "draftAndPublish": false },
  "pluginOptions": {
    "content-manager": { "visible": false },
    "content-type-builder": { "visible": false }
  },
  "attributes": {
    "action": { "type": "string", "required": true },
    "email": { "type": "string" },
    "userId": { "type": "integer" },
    "ip": { "type": "string" },
    "reason": { "type": "string" },
    "metadata": { "type": "json" }
  }
}
```

### `server/content-types/audit-log/index.ts`

Standard pattern — re-export schema (same as `whitelist/index.ts`).

### `server/services/auditLog.ts`

```typescript
import type { AuditEntry, AuditLogRecord } from '../types';

export default function auditLogService({ strapi }: { strapi: Strapi.Strapi }) {
  return {
    async log({ action, email, userId, ip, reason, metadata }: AuditEntry): Promise<void> {
      // 1. Persist
      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').create({
        data: {
          action,
          email: email ?? null,
          userId: userId ?? null,
          ip: ip ?? null,
          reason: reason ?? null,
          metadata: metadata ?? null,
        },
      });
      // 2. Emit — keeps Enterprise audit logs and custom listeners in sync
      const eventHub = strapi.serviceMap.get('eventHub');
      eventHub.emit(`strapi-plugin-oidc::auth.${action}`, {
        email,
        userId,
        ip,
        reason,
        metadata,
        provider: 'strapi-plugin-oidc',
      });
    },
    async find({ page = 1, pageSize = 25 }: { page?: number; pageSize?: number } = {}) {
      return strapi.db.query('plugin::strapi-plugin-oidc.audit-log').findPage({
        sort: { createdAt: 'desc' },
        page,
        pageSize,
      });
    },
    async findAll(): Promise<AuditLogRecord[]> {
      return strapi.db.query('plugin::strapi-plugin-oidc.audit-log').findMany({
        sort: { createdAt: 'desc' },
      }) as Promise<AuditLogRecord[]>;
    },
    async cleanup(retentionDays: number): Promise<void> {
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
      await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({
        where: { createdAt: { $lt: cutoff } },
      });
    },
  };
}
```

### `server/controllers/auditLog.ts`

```typescript
import type { StrapiContext } from '../types';
import type { AuditLogService } from '../types';

export default ({ strapi }: { strapi: Strapi.Strapi }) => ({
  async find(ctx: Pick<StrapiContext, 'query' | 'body'>): Promise<void> {
    const page = Number(ctx.query?.page) || 1;
    const pageSize = Number(ctx.query?.pageSize) || 25;
    const service = strapi.plugin('strapi-plugin-oidc').service('auditLog') as AuditLogService;
    ctx.body = await service.find({ page, pageSize });
  },
  async export(ctx: Pick<StrapiContext, 'set' | 'body'>): Promise<void> {
    const service = strapi.plugin('strapi-plugin-oidc').service('auditLog') as AuditLogService;
    const rows = await service.findAll();
    ctx.set('Content-Type', 'application/x-ndjson');
    ctx.set(
      'Content-Disposition',
      `attachment; filename="oidc-audit-log-${new Date().toISOString().slice(0, 10)}.ndjson"`,
    );
    ctx.body = rows.map((r) => JSON.stringify(r)).join('\n');
  },
});
```

Register in `server/controllers/index.ts` and `server/index.ts`.

### `admin/src/components/AuditLog/index.tsx`

A new `Box` container section added to `HomePage` (matching the existing Roles/Whitelist/Login Settings pattern). Contains:

- Header row: "Audit Logs" title + **Download** button (right-aligned, consistent with whitelist's export button)
- Paginated table: Timestamp | Action (badge with colour by severity) | Email | User ID | IP | Reason
- Pagination controls at the bottom

**Download format:** NDJSON (newline-delimited JSON) — the industry standard for audit/security log exports compatible with SIEM tools (Splunk, ELK, Datadog). Each line is a self-contained JSON object. Filename: `oidc-audit-log-<ISO-date>.ndjson`.

The Download button hits the backend `GET /audit-logs/export` route which returns all records as NDJSON, so large datasets are not buffered in the browser.

---

## Files to Modify

### `server/content-types/index.ts`

Add `auditLog` import and export alongside `roles` and `whitelists`.

### `server/controllers/oidc.ts`

**`oidcSignInCallback`:**

- Before early return on missing code: call `auditLog.log({ action: 'login_failure', ip: ctx.ip, reason: 'missing_code' })`
- Before early return on state mismatch: call `auditLog.log({ action: 'state_mismatch', ip: ctx.ip })`
- Declare `let userInfo: OidcUserInfo | undefined` before the try block so it's accessible in the catch
- In catch block: inspect error message to categorise (see Error Categorisation below)
- Replace `console.error` with `strapi.log.error`

**`logout`:**

- After `clearAuthCookies`, log `session_expired` when the provider token is stale (line 289-294 branch), `logout` in all other OIDC cases

### `server/services/oauth.ts`

**`triggerSignInSuccess`:** Keep the existing `admin.auth.success` emission for Strapi Enterprise compatibility. The controller will additionally call `auditLog.log('login_success')` with IP included (which `triggerSignInSuccess` cannot do — it has no `ctx`).

**`registerNewUser`:** Return `{ user, isNew: true }` so the controller can set `userCreated: true` in the `login_success` event payload.

### `server/routes/index.ts`

Add admin-authenticated routes:

```typescript
{ method: 'GET', path: '/audit-logs',        handler: 'auditLog.find',   config: { policies: ['admin::isAuthenticatedAdmin'] } },
{ method: 'GET', path: '/audit-logs/export', handler: 'auditLog.export', config: { policies: ['admin::isAuthenticatedAdmin'] } },
```

### `server/bootstrap.ts`

On startup, read `AUDIT_LOG_RETENTION_DAYS` from plugin config and call `auditLog.cleanup(retentionDays)`.

### `server/config/index.ts`

Add `AUDIT_LOG_RETENTION_DAYS: 90`.

### `admin/src/pages/HomePage/index.tsx`

Add the `AuditLog` component as a new `Box` container below the Login Settings section, consistent with existing section layout.

---

## IP Capture

`ctx.ip` in Koa automatically respects `X-Forwarded-For` when Strapi's `server.proxy: true` is set. Pass `ctx.ip` into audit log calls. `oidcSignInCallback` and `logout` both receive `ctx` directly.

---

## Error Categorisation (in catch block)

```typescript
} catch (e) {
  const msg = (e as Error).message ?? '';
  const action: AuditAction = msg.includes('whitelist') ? 'whitelist_rejected'
    : msg === 'Nonce mismatch'        ? 'nonce_mismatch'
    : msg === 'Token exchange failed' ? 'token_exchange_failed'
    : 'login_failure';
  await auditLog.log({ action, email: userInfo?.email, ip: ctx.ip, reason: msg });
  strapi.log.error('OIDC sign-in error:', e);
  ctx.send(oauthService.renderSignUpError('Authentication failed. Please try again.'));
}
```

`userInfo` is declared before the try block (`let userInfo: OidcUserInfo | undefined`) and populated inside it, so it may be `undefined` when early errors occur — the optional chaining `userInfo?.email` handles this gracefully.

---

## Tests

The project uses **Vitest** with a real Strapi instance (SQLite) and **MSW** to mock the OIDC provider. Tests follow the existing patterns in `server/__tests__/e2e/`.

### New test file: `server/__tests__/e2e/auditlog.e2e.test.ts`

Covers three layers:

#### 1. Service layer

Call the service directly against the real DB (pattern from `services.e2e.test.ts`):

```typescript
describe('AuditLog Service', () => {
  let auditLogService: AuditLogService;
  beforeAll(() => {
    auditLogService = strapi.plugin('strapi-plugin-oidc').service('auditLog') as AuditLogService;
  });
  afterEach(async () => {
    await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').deleteMany({});
  });

  it('log() persists a record to the DB', async () => {
    await auditLogService.log({ action: 'login_success', email: 'a@b.com', ip: '127.0.0.1' });
    const rows = await strapi.db.query('plugin::strapi-plugin-oidc.audit-log').findMany({});
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('login_success');
  });

  it('log() emits an event on the eventHub', async () => {
    const received: unknown[] = [];
    strapi.eventHub.addListener('strapi-plugin-oidc::auth.login_success', (p: unknown) =>
      received.push(p),
    );
    await auditLogService.log({ action: 'login_success', email: 'a@b.com', ip: '127.0.0.1' });
    expect(received).toHaveLength(1);
  });

  it('find() returns paginated results newest-first', async () => {
    // seed 3 records then assert ordering and pagination shape
  });

  it('cleanup() deletes records older than retention days', async () => {
    // seed a record with old createdAt via raw SQL, run cleanup(0), expect 0 rows
  });
});
```

#### 2. Controller layer

Use minimal mock `ctx` objects (pattern from `controllers.e2e.test.ts`):

```typescript
describe('AuditLog Controller', () => {
  it('find() returns paginated logs in ctx.body', async () => {
    const ctx = { query: { page: '1', pageSize: '10' }, body: null as unknown };
    await auditLogController.find(ctx);
    expect(ctx.body).toHaveProperty('results');
    expect(ctx.body).toHaveProperty('pagination');
  });

  it('export() sets NDJSON content-type and body is a string', async () => {
    const headers: Record<string, string> = {};
    const ctx = {
      set: (k: string, v: string) => {
        headers[k] = v;
      },
      body: null as unknown,
    };
    await auditLogController.export(ctx);
    expect(headers['Content-Type']).toBe('application/x-ndjson');
    expect(typeof ctx.body).toBe('string');
  });
});
```

#### 3. E2E integration (full HTTP flow)

Use Supertest + MSW overrides to assert that real OIDC flows produce audit log rows (pattern from `oidc.e2e.test.ts`):

```typescript
it('successful login creates a login_success audit log entry', async () => {
  await initiateLoginAndCallback(); // reuse helper from oidc.e2e.test.ts
  const rows = await strapi.db
    .query('plugin::strapi-plugin-oidc.audit-log')
    .findMany({ where: { action: 'login_success' } });
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0].email).toBe('test@company.com');
});

it('state mismatch creates a state_mismatch audit log entry', async () => {
  // Initiate login, corrupt state cookie, trigger callback, assert DB row
});

it('token exchange failure creates a token_exchange_failed audit log entry', async () => {
  oidcServer.use(
    http.post('https://mock-oidc.com/token', () => HttpResponse.json({}, { status: 401 })),
  );
  // trigger callback flow, assert DB row action === 'token_exchange_failed'
});

it('whitelist rejection creates a whitelist_rejected audit log entry', async () => {
  await setSettings(true, false); // enable whitelist, don't add test email
  // trigger full login flow, assert DB row action === 'whitelist_rejected'
});

it('logout creates a logout audit log entry', async () => {
  // login first, then call logout endpoint, assert DB row action === 'logout'
});
```

Each E2E test cleans up audit log rows in `afterEach` to remain isolated.

---

## Verification

1. `npm test` passes with all new tests green and no regressions in existing tests.
2. Log in via OIDC → `login_success` row visible in admin UI "Audit Logs" container.
3. Tamper with state cookie → `state_mismatch` row appears.
4. Enable whitelist, attempt login with unlisted email → `whitelist_rejected` row appears.
5. Logout → `logout` or `session_expired` row appears.
6. Hit `GET /strapi-plugin-oidc/audit-logs/export` → NDJSON file downloads with one JSON object per line.
7. Set `AUDIT_LOG_RETENTION_DAYS: 0`, restart → old records cleaned up on bootstrap.
