# Audit Log NDJSON Streaming Export — Implementation Plan

## Context

The audit-log export currently buffers every row in memory before responding:

- `server/controllers/auditLog.ts:23-55` pages through `auditLogService.find(...)` in chunks of 1000, pushes each row into `allRows`, then maps again into a second array assigned to `ctx.body` as a JSON array.
- Two full copies of the dataset live in memory simultaneously during the export.
- Peak memory is proportional to total audit-log size — a year of high-traffic logs can be tens-to-hundreds of MB.
- `Content-Type` is `application/json`, response is a JSON array.

Meanwhile the **admin UI already expects NDJSON**:

- `admin/src/components/AuditLog/index.tsx:117` wraps the response in `new Blob([text], { type: 'application/x-ndjson' })`.
- `:121` saves the download as `.ndjson`.
- `:116` calls `response.text()` — still buffers the full body client-side.

The server/client content-type mismatch works today only because the client reads raw text and trusts the `.ndjson` filename. The current server body (a JSON array) is not valid NDJSON.

## Goal

Stream audit-log exports as true NDJSON (one JSON object per line, newline-delimited) from DB cursor to HTTP socket without buffering all rows in memory on the server. Keep the admin UI's existing `.ndjson` download behavior but consume the stream incrementally so the browser memory footprint is also bounded.

**Success criteria:**

1. Server resident memory during export stays bounded (≤ a few MB) regardless of row count.
2. Response is valid NDJSON: each line parses as JSON; lines are separated by `\n`; no wrapping array; no trailing newline required but allowed.
3. Existing admin export still works — user clicks "Export", gets a `.ndjson` file identical in content to what today's array-JSON export would contain (modulo framing).
4. Mid-stream errors produce a diagnosable failure (connection closed / truncated file) rather than a silent truncation with 200 OK and no hint. Aim for ending the stream on error after flushing a terminal error marker when feasible.
5. Tests cover: header shape, NDJSON framing, row ordering/content parity, large-set memory behavior, error mid-stream.

## Non-goals

- Changing the export semantics (what gets exported, which fields, translation of `detailsKey`).
- Server-side filtering / date ranges (separate feature).
- Compressed export (`.ndjson.gz`) — separate feature; mention in "Future work".

---

## Server-side design

### Streaming strategy

Node's `Readable.from(asyncIterable, { objectMode: false })` works but does not apply backpressure to the underlying DB paging loop cleanly. Use a manual `Readable` with `read()` + an async iterator pump so the paging loop awaits `push()` backpressure semantics.

Preferred shape — an async generator yielding `Buffer`s, wrapped with `Readable.from`:

```ts
// server/controllers/auditLog.ts

import { Readable } from 'node:stream';
import type { StrapiContext } from '../types';
import { setJsonAttachmentHeaders } from '../utils/http'; // from refactor-plan Task 2; if not present, inline

const EXPORT_PAGE_SIZE = 500;

async function* ndjsonRowStream(service: AuditLogService): AsyncGenerator<Buffer> {
  let page = 1;
  while (true) {
    const { results } = await service.find({ page, pageSize: EXPORT_PAGE_SIZE });
    if (results.length === 0) return;

    // Build a single Buffer per page so we emit one chunk of ~N lines at a time.
    // This is the main memory knob: per-page buffer, not per-row, not whole-export.
    let chunk = '';
    for (const row of results) {
      chunk +=
        JSON.stringify({
          datetime: row.createdAt,
          action: row.action,
          email: row.email ?? null,
          ip: row.ip ?? null,
          details: row.details,
        }) + '\n';
    }
    yield Buffer.from(chunk, 'utf8');

    if (results.length < EXPORT_PAGE_SIZE) return;
    page++;
  }
}

async function exportLogs(ctx: StrapiContext): Promise<void> {
  ctx.set('Content-Type', 'application/x-ndjson; charset=utf-8');
  ctx.set(
    'Content-Disposition',
    `attachment; filename="strapi-oidc-audit-log-${formatDatetimeForFilename(new Date())}.ndjson"`,
  );
  // Hint to proxies/browsers not to try to cache or buffer a streamed download.
  ctx.set('Cache-Control', 'no-store');
  ctx.set('X-Content-Type-Options', 'nosniff');

  const service = getAuditLogService();
  ctx.body = Readable.from(ndjsonRowStream(service));
}
```

**Why `Readable.from(asyncGen)`:**

- Koa (Strapi's HTTP layer) pipes any `Readable` set as `ctx.body` directly to the socket.
- `Readable.from` propagates backpressure: when the socket buffer fills, the generator's `yield` pauses, which pauses the DB paging loop.
- No intermediate `allRows` array.

**Why buffer per-page instead of per-row:**

- Per-row `push(Buffer.from(json + '\n'))` issues thousands of socket writes. Per-page chunking cuts syscalls ~500× with a bounded extra memory cost (one page worth of serialized JSON).
- Tuning knob: `EXPORT_PAGE_SIZE = 500`. Start here; benchmark if needed. Do not make it configurable unless a real need appears.

### Filename and extension

- Filename: `strapi-oidc-audit-log-{datetime}.ndjson` (note `.ndjson`, not `.json`). Matches admin expectation today.
- If `setJsonAttachmentHeaders` helper exists (from Task 2 of the refactor plan), introduce a sibling `setNdjsonAttachmentHeaders(ctx, basename)` that sets the NDJSON type and `.ndjson` extension. Otherwise inline as above.

### Mid-stream error handling

Once headers have been flushed, the response status is committed. An error surfacing from the DB paging loop needs to:

1. Destroy the `Readable` with the error (`stream.destroy(err)`), which closes the socket without a clean terminator.
2. Log the failure server-side with the row index / page reached.

Approach — wrap the generator:

```ts
function errorAwareNdjsonStream(service: AuditLogService): Readable {
  const gen = ndjsonRowStream(service);
  const readable = Readable.from(gen);
  readable.on('error', (err) => {
    strapi.log.error({ phase: 'audit_log_export', err }, 'NDJSON export stream failed');
  });
  return readable;
}
```

If we can detect the error before the first yield (e.g. the first `service.find()` throws synchronously during the await), we have a choice: let the generator throw → `Readable.from` emits `error` → Koa turns it into a 500 with no body. That is acceptable — the client sees a failed download rather than a truncated-but-seemingly-ok file.

Do NOT try to embed an error sentinel row in the stream. Clients of NDJSON would parse it as data. Rely on transport-level failure signals (connection reset / content-length mismatch is not applicable since we do not send Content-Length).

### No `Content-Length`

Since the total byte size is not known in advance, omit `Content-Length`. Koa/Node will send `Transfer-Encoding: chunked` automatically for a `Readable` body. Verify this in the test suite (see Tests section).

### Memory test fixture

`services/auditLog.ts:find` uses `findPage`, which is fine for paging but sorts `createdAt desc` and uses a COUNT under the hood. For large tables COUNT is expensive. This is an existing behavior — do not change it in this plan, but **add a TODO** comment: cursor-based pagination (`where: { id: { $lt: lastSeenId } }`) would be more scalable, and the export does not need total count. File a follow-up issue if rows ever exceed ~1M.

---

## Admin-side design

### Current state

`admin/src/components/AuditLog/index.tsx:102-130` — `handleExport`:

```
fetch → response.text() → new Blob([text]) → anchor.click() → revokeObjectURL
```

`response.text()` buffers the whole body in the browser. For the memory-bounded-server property to be meaningful end-to-end, the admin side should also stream.

### Streaming the download in the browser

Two options:

**Option A — `response.blob()`**: simpler, browser streams to the Blob internally. Memory still spikes at the blob size, but the DOM doesn't hold both a string and a blob as `response.text()` does. One-line change:

```ts
const blob = await response.blob();
// discard the manual `new Blob([text], …)` wrapper
```

**Option B — `response.body` streamed through a `WritableStream`** into the File System Access API or a service-worker intercept. This is the only way to actually stream-to-disk in a browser, but requires either `showSaveFilePicker()` (Chromium only, requires user gesture) or a service-worker trick. Too much complexity for the current need.

**Decision:** use Option A. It halves peak memory (no intermediate decoded string) and keeps the UX unchanged. Document Option B as a future option if we ever need to export hundreds of MB.

### Replaced `handleExport`

```ts
const handleExport = async () => {
  try {
    const cookieMatch = document.cookie.match(/(?:^|;\s*)jwtToken=([^;]+)/);
    const token = cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
    const response = await fetch('/strapi-plugin-oidc/audit-logs/export', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      toggleNotification({
        type: 'danger',
        message: formatMessage(getTrad('auditlog.export.error')),
      });
      return;
    }
    // response.blob() streams the body internally; no intermediate string allocation.
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `oidc-audit-log-${new Date().toISOString().slice(0, 10)}.ndjson`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toggleNotification({
      type: 'danger',
      message: formatMessage(getTrad('auditlog.export.error')),
    });
  }
};
```

No other admin-side changes required.

---

## Files to change

- `server/controllers/auditLog.ts` — rewrite `exportLogs` per design above. Remove `AuditLogExportRow` buffer type.
- `server/utils/http.ts` _(new or extended — Task 2 helper from refactor-plan)_ — add `setNdjsonAttachmentHeaders(ctx, basename)`. If refactor-plan Task 2 is not yet merged, inline the header logic in `auditLog.ts` and factor it out later.
- `admin/src/components/AuditLog/index.tsx` — switch `response.text()` → `response.blob()`; drop the `application/x-ndjson` Blob wrapper (the server now emits that MIME type directly, `response.blob()` honors it).
- `server/__tests__/e2e/auditlog.e2e.test.ts` — rewrite export test (see Tests section).

No changes required to:

- `server/services/auditLog.ts` — `find(...)` stays; the controller paginates over it.
- `server/types.ts` — `AuditLogService` interface unchanged.
- `server/routes/index.ts` — same route, same handler.

---

## Tests — revised and added

### 1. Rewrite `auditlog.e2e.test.ts` export controller test

**Current** (lines 113-131): asserts `Content-Type: application/json` and `Array.isArray(ctx.body)`. This is wrong after the change and was wrong against the admin client before the change. Replace with:

```ts
it('export() sets NDJSON content-type and streams rows as newline-delimited JSON', async () => {
  const auditLogController = strapi.plugin('strapi-plugin-oidc').controller('auditLog');
  const headers: Record<string, string> = {};
  const ctx = {
    query: {},
    set: (k: string, v: string) => {
      headers[k] = v;
    },
    body: null as unknown,
  };
  await auditLogController.export(ctx);

  expect(headers['Content-Type']).toMatch(/application\/x-ndjson/);
  expect(headers['Content-Disposition']).toMatch(/\.ndjson"$/);
  expect(headers['Cache-Control']).toBe('no-store');

  // ctx.body is a Readable stream — consume it and validate line-by-line.
  const chunks: Buffer[] = [];
  for await (const c of ctx.body as Readable) chunks.push(Buffer.from(c));
  const body = Buffer.concat(chunks).toString('utf8');

  const lines = body.split('\n').filter(Boolean);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    const row = JSON.parse(line); // must not throw
    expect(row).toHaveProperty('datetime');
    expect(row).toHaveProperty('action');
    expect(row).toHaveProperty('email');
    expect(row).toHaveProperty('ip');
    expect(row).toHaveProperty('details');
  }
});
```

### 2. Add: row count parity

Seed N rows (pick N = 3 × `EXPORT_PAGE_SIZE` + 7 so the paging loop runs at least three full pages and a partial page), export, assert line count equals N. This proves the paging termination is correct and no rows are dropped at page boundaries.

```ts
it('export() emits every row across multiple pages', async () => {
  const N = 1507; // crosses EXPORT_PAGE_SIZE=500 three times plus a partial page
  // seed
  for (let i = 0; i < N; i++) {
    await auditLogService.log({ action: 'login_success', email: `u${i}@x.com`, ip: '1.1.1.1' });
  }
  const ctx = makeExportCtx();
  await auditLogController.export(ctx);
  const body = await streamToString(ctx.body as Readable);
  const lines = body.split('\n').filter(Boolean);
  expect(lines.length).toBe(N);
});
```

Gate this test with a higher timeout (`{ timeout: 30_000 }`) if the seed loop is slow against SQLite. Consider bulk-inserting via `strapi.db.query(...).createMany(...)` if available to keep the seed fast — verify that API exists in Strapi v5 before relying on it (else keep the `.log` loop).

### 3. Add: row content parity

Assert the first and last emitted lines match the DB order (`createdAt desc`). Seed three distinct rows with a tiny sleep between (or manually set `createdAt` via raw query so the sort is deterministic), then:

```ts
expect(JSON.parse(lines[0]).email).toBe('newest@x.com');
expect(JSON.parse(lines[lines.length - 1]).email).toBe('oldest@x.com');
```

### 4. Add: NDJSON framing invariants

```ts
it('NDJSON body has no wrapping array, no trailing commas, one object per line', () => {
  expect(body.trim().startsWith('[')).toBe(false);
  expect(body.trim().endsWith(']')).toBe(false);
  expect(body).not.toMatch(/},\n/); // no JSON-array-style commas
  for (const line of body.split('\n').filter(Boolean)) {
    expect(() => JSON.parse(line)).not.toThrow();
  }
});
```

### 5. Add: chunked transfer over real HTTP

The controller test above uses the raw controller signature with a mock ctx. Add one `supertest`-based test that exercises the actual HTTP path so we catch Koa framing issues:

```ts
it('HTTP export returns Transfer-Encoding: chunked and valid NDJSON', async () => {
  await auditLogService.log({ action: 'login_success', email: 'a@b.com', ip: '1.1.1.1' });
  const res = await agent
    .get('/strapi-plugin-oidc/audit-logs/export')
    .set('Authorization', `Bearer ${adminJwtToken}`);

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/application\/x-ndjson/);
  expect(res.headers['content-length']).toBeUndefined();
  expect(res.headers['transfer-encoding']).toBe('chunked');

  const lines = res.text.split('\n').filter(Boolean);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) JSON.parse(line);
});
```

Reuse the admin-JWT helper pattern from the existing `AuditLog E2E Integration` describe block for the `Authorization` header. If the existing tests call the controller directly without a JWT, look at `whitelist-api.e2e.test.ts` for the HTTP-auth idiom.

### 6. Add: mid-stream error is surfaced, not swallowed

Force `service.find` to throw on the second page:

```ts
it('export() destroys the stream when the DB paging loop throws', async () => {
  // seed enough to need two pages
  for (let i = 0; i < 501; i++) {
    await auditLogService.log({ action: 'login_success', email: `e${i}@x.com`, ip: '1.1.1.1' });
  }
  const service = strapi.plugin('strapi-plugin-oidc').service('auditLog');
  const realFind = service.find;
  let call = 0;
  (service as { find: typeof realFind }).find = async (opts) => {
    call++;
    if (call === 2) throw new Error('synthetic DB failure');
    return realFind(opts);
  };

  try {
    const ctx = makeExportCtx();
    await auditLogController.export(ctx);
    // Consume the stream — expect an error event.
    const err: unknown = await new Promise((resolve) => {
      const stream = ctx.body as Readable;
      stream.on('error', resolve);
      stream.on('end', () => resolve(null));
      stream.resume();
    });
    expect(err).toBeInstanceOf(Error);
  } finally {
    (service as { find: typeof realFind }).find = realFind;
  }
});
```

### 7. Helper: `streamToString`

Co-locate in `server/__tests__/e2e/test-helpers.ts`:

```ts
export async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}
```

### 8. Admin-side: intentionally not adding

There is no admin-side component test harness in this project. Do not introduce one for this change. The server HTTP test (test 5) plus manual smoke verification (below) covers the behavior the admin client relies on.

---

## Verification

1. `npx tsc --noEmit` — clean.
2. `npm run lint` — clean.
3. `npm test` — all suites pass, including the six new/revised tests above.
4. Manual smoke:
   - Seed the dev DB with, say, 50k audit rows (quick script: loop `auditLogService.log`).
   - Start `test-app`, open Admin → OIDC → Audit Log → click **Export**.
   - Download completes; open the `.ndjson` in `jq -c . < file.ndjson | wc -l` → count matches `SELECT COUNT(*)`.
   - Optional: run the server under `node --inspect` and observe heap during export — should stay roughly flat, not grow linearly with row count.

---

## Rollout / compatibility

- **Response shape change:** JSON array → NDJSON. Any external caller of the export endpoint relying on `JSON.parse(body)` will break. Mitigation: this endpoint is admin-only (behind JWT, behind `plugin::strapi-plugin-oidc.read` permission) and the only known consumer is the admin UI, which already labels its download `.ndjson`. No public API consumers.
- **Filename extension change:** `.json` → `.ndjson` in the server-provided `Content-Disposition`. The admin client already wrote `.ndjson`, so the visible filename is unchanged. (The admin-side `a.download` override wins over `Content-Disposition.filename` when the browser honors same-origin attachments, but aligning them removes the inconsistency.)
- **No migration needed** — stateless endpoint.

---

## Future work (explicitly out of scope here)

- Cursor-based pagination in `auditLogService.find` to drop the per-page COUNT query.
- Gzip compression (`Content-Encoding: gzip`) by piping through `createGzip()` — trivially composable with the `Readable`.
- Stream-to-disk in the browser via File System Access API for truly memory-bounded client-side behavior.
- Server-side filters (date range, action, email) — would apply to both `find` UI and `export`.
