# strapi-plugin-oidc — Security Fixes Plan

## Context

This plan addresses findings from a security review of the plugin. Each task is intended to be **behavior-preserving for well-behaved clients** while closing the identified gap. The plan is written so another model can execute it end-to-end without re-exploring the codebase.

Repo: `/home/george/Code/strapi-plugin-oidc`. Branch: `main`. Working tree must be clean before starting. After each numbered task, run `npx tsc --noEmit` and `npm run lint` and fix before proceeding. Run `npm test` at the end of each task to confirm the task is self-contained.

## Commit independence

Each numbered task below MUST land as a standalone commit whose correctness does not depend on any other task in this plan being applied. Concretely:

- No task may import symbols introduced by another task in this plan.
- No task may assume a change from another task has happened first.
- When two tasks touch the same file, the second task's diff must apply cleanly against either the pre- or post-state of the first task — keep edits additive and localized.

Execute in any order. Severity ordering below is a suggested priority, not a dependency.

---

## Task 1 — Require verified email from the IdP (HIGH)

**Problem:** `server/controllers/oidc.ts:317-360` (`handleUserAuthentication`) reads `userResponseData.email` and proceeds without checking `email_verified`. If the configured IdP permits unverified addresses, an attacker can register `victim@company.com` at the IdP and, if that email is whitelisted, be granted admin access on first login.

**Fix:**

- In `handleUserAuthentication`, after extracting `email`, read `userResponseData.email_verified`.
- If the value is present and not strictly `true` (boolean) or `"true"` (string — some IdPs serialize it), throw `new OidcError('email_not_verified', errorMessages.EMAIL_NOT_VERIFIED)`.
- Add `email_not_verified` to `OidcErrorKind` in `server/oidc-errors.ts` and to `OIDC_ERROR_DISPATCH` with a new audit action (see below) and an appropriate `key`.
- Add `EMAIL_NOT_VERIFIED` to `server/error-strings.ts` (both the error code and the message) and a user-facing `email_not_verified` string in `server/audit-error-strings.ts` for all supported locales.
- Add `email_not_verified` to `shared/audit-actions.ts` and add a matching `audit.email_not_verified` translation in `translations/locales/*.json`.
- Provide an **opt-out** escape hatch for IdPs that do not emit the claim at all: add `OIDC_REQUIRE_EMAIL_VERIFIED` to `server/config/index.ts` (default `true`). When `false`, skip the check. Document the flag in `README.md` and call out the security implication.
- Behavior when the claim is _missing_: reject by default (treat absent as unverified). This matches OIDC Core §5.7.

**Files:**

- `server/controllers/oidc.ts`
- `server/oidc-errors.ts`
- `server/error-strings.ts`
- `server/audit-error-strings.ts`
- `server/config/index.ts`
- `shared/audit-actions.ts`
- `translations/locales/*.json`
- `README.md`

**Tests:** `server/__tests__/` — add a case for each of: `email_verified: true`, `email_verified: false`, `email_verified: "true"`, claim missing (default reject), claim missing with opt-out config.

---

## Task 2 — Gate proxy headers in `getClientIp` behind an explicit allowlist (HIGH)

**Problem:** `server/utils/ip.ts:3-20` unconditionally trusts `CF-Connecting-IP`, `X-Forwarded-For`, and `X-Real-IP`. External clients can spoof these to bypass the per-IP rate limiter (`server/routes/index.ts:12`) and forge the `ip` column written to audit logs.

**Fix:**

- Replace `getClientIp(ctx)` with an implementation that consults Strapi's `koa` proxy trust settings. Koa exposes `ctx.app.proxy` and `ctx.request.ips` (populated from `X-Forwarded-For` only when `app.proxy === true`).
- When `ctx.app.proxy === true`: prefer `ctx.request.ips[0]` if non-empty, else `ctx.ip`. Do NOT read headers directly.
- When `ctx.app.proxy === false`: return `ctx.ip` unconditionally. Ignore all forwarding headers.
- Add a plugin config `OIDC_TRUSTED_IP_HEADER` (default unset). When set to `'cf-connecting-ip'`, allow reading that header _only if_ `ctx.app.proxy === true`. This supports Cloudflare deployments without trusting arbitrary headers.
- Document that operators must set Strapi's `server.proxy: true` config when running behind a reverse proxy for rate limiting and audit-log IP attribution to be correct.

**Files:**

- `server/utils/ip.ts`
- `server/config/index.ts`
- `README.md`

**Tests:** unit-test `getClientIp` with `app.proxy` on/off, with and without `X-Forwarded-For`, with and without `CF-Connecting-IP`, and with the config flag set/unset.

---

## Task 3 — Verify ID token signature and standard claims (MEDIUM)

**Problem:** `server/controllers/oidc.ts:119-132` parses the ID token payload to check `nonce` but never verifies the JWS signature, issuer, audience, or expiry. Token integrity currently rests entirely on TLS to the IdP.

**Fix:**

- Add `jose` (already transitively common; prefer it over `jsonwebtoken` for JWKS support) to `dependencies`.
- In `exchangeTokenAndFetchUserInfo`, before the nonce check:
  - Read `OIDC_JWKS_URI` from config (new key; document that this is typically the `jwks_uri` from the IdP's discovery document).
  - Read `OIDC_ISSUER` from config (new key).
  - Use `jose.createRemoteJWKSet(new URL(OIDC_JWKS_URI))` cached at module scope (keyed by URI to handle hot-reload in dev).
  - Call `jose.jwtVerify(id_token, jwks, { issuer: OIDC_ISSUER, audience: OIDC_CLIENT_ID })`. This validates signature, `iss`, `aud`, `exp`, and `nbf`.
  - Continue to enforce the nonce check on the verified payload.
- Keep the check **optional but on by default**: if `OIDC_JWKS_URI` is unset, log a one-time `strapi.log.warn` at bootstrap that ID token verification is disabled, and fall back to the current nonce-only path. This avoids breaking existing installs on upgrade.
- Add `OIDC_JWKS_URI` and `OIDC_ISSUER` to `server/config/index.ts` and document them as **recommended** in `README.md`.
- Map `jose.errors.JWTClaimValidationFailed` / `JWSSignatureVerificationFailed` / `JWTExpired` to a new `id_token_invalid` `OidcErrorKind` with a dedicated audit action and message. Reuse the existing error-dispatch pattern.

**Files:**

- `package.json`
- `server/controllers/oidc.ts`
- `server/oidc-errors.ts`
- `server/error-strings.ts`
- `server/audit-error-strings.ts`
- `server/config/index.ts`
- `shared/audit-actions.ts`
- `translations/locales/*.json`
- `README.md`

**Tests:** mock JWKS and exercise: valid token accepted, expired token rejected, wrong `aud` rejected, wrong `iss` rejected, tampered signature rejected, missing `OIDC_JWKS_URI` → falls back with warning logged once.

---

## Task 4 — Bound the rate-limit map and prune expired entries (MEDIUM)

**Problem:** `server/routes/index.ts:6-36` stores entries in a `Map` indefinitely. An attacker varying IP + UA pairs grows the map without bound (memory DoS). The limiter is also per-process, so multi-node deployments have no effective global limit.

**Fix:**

- **Bound growth:** enforce `MAX_MAP_SIZE` (e.g. `10_000`). When the cap is hit, drop the oldest key (`rateLimitMap.keys().next().value` is insertion-ordered).
- **Prune expired entries:** on each request, if `rateLimitMap.size > PRUNE_THRESHOLD` (e.g. 1000), walk entries once and delete any whose most-recent timestamp is older than `now - RATE_LIMIT_WINDOW`. Amortized O(1) per request.
- Alternative: a `setInterval` sweeper. Prefer the on-request approach to avoid leaking timers in tests / unref semantics.
- **Multi-node note:** document in `README.md` that the built-in limiter is per-process and is intended as a basic safety net; operators running multiple instances should put the OIDC endpoints behind a reverse-proxy-level limiter. Do **not** introduce a Redis dependency in this plugin.
- Update `clearRateLimitMap` tests to cover the new eviction and prune paths.

**Files:**

- `server/routes/index.ts`
- `server/__tests__/` (add eviction + prune tests)
- `README.md`

---

## Task 5 — Validate email format in `whitelist.register` (MEDIUM)

**Problem:** `server/controllers/whitelist.ts:53-74` lowercases and trims entries but does not validate them, unlike `importUsers` which runs `isValidEmail`.

**Fix:**

- Apply `isValidEmail` (from `server/utils/email.ts`) to each entry after lowercase/trim. Split rejected entries from accepted entries.
- Return both counts in the response: `{ matchedExistingUsersCount, acceptedCount, rejectedEmails }`. The existing admin UI consumes `matchedExistingUsersCount`; add the new fields without breaking the shape.
- If `acceptedCount === 0`, respond `400` with `{ error: 'No valid email addresses supplied' }`.
- Update the admin UI (`admin/src/pages/.../whitelist`) to surface rejected entries in the toast.

**Files:**

- `server/controllers/whitelist.ts`
- `admin/src/pages/...` (whitelist page — locate with `grep -r matchedExistingUsersCount admin/`)
- `server/__tests__/`

---

## Task 6 — Add CSRF protection to `GET /logout` (LOW)

**Problem:** `server/controllers/oidc.ts:558-595` clears the admin refresh cookie in response to a plain GET. SameSite=Lax allows top-level GET navigations, so a third-party page can force an admin to log out by navigating them to the URL.

**Fix:**

- Change the route from `GET` to `POST` in `server/routes/index.ts`. The admin UI initiates logout via a form/fetch, so this is a small UI change, not a user-facing regression.
- Update the admin UI's logout trigger to POST.
- For backward compatibility with bookmarks, keep a `GET /logout` handler that renders a minimal HTML page with an auto-submitting form targeting `POST /logout` plus a CSRF token embedded as a hidden field. The token is a 32-byte random value set in an HttpOnly cookie on the GET and compared on the POST. Reject the POST if the header/body value does not match the cookie.
- If implementing the confirmation page is too invasive, the simpler path is: drop the GET entirely and update the admin UI to POST.

**Files:**

- `server/routes/index.ts`
- `server/controllers/oidc.ts`
- `admin/src/...` (logout trigger)

---

## Task 7 — Harden cookie `Secure` flag for proxied TLS (LOW)

**Problem:** Cookie writes in `server/controllers/oidc.ts:67-78`, `499-524` and `server/services/oauth.ts:310-344` use `secure: isProduction && ctx.request.secure`. If Strapi sits behind a TLS-terminating proxy and `server.proxy` is not configured, `ctx.request.secure` is `false` even though the user is on HTTPS, and the cookies are emitted without `Secure`.

**Fix:**

- Introduce a helper `shouldMarkSecure(strapi, ctx): boolean` in `server/utils/cookies.ts` that returns `true` when:
  - `strapi.config.get('environment') === 'production'`, AND
  - (`ctx.request.secure` OR `ctx.app.proxy && ctx.get('x-forwarded-proto') === 'https'`).
- Replace the three `isProduction && ctx.request.secure` sites with calls to this helper.
- Add an `OIDC_FORCE_SECURE_COOKIES` config flag (default unset) that, when `true`, always marks cookies `Secure` regardless of detection. Useful for deployments where proxy trust cannot be configured.
- Document both behaviors in `README.md`.

**Files:**

- `server/utils/cookies.ts`
- `server/controllers/oidc.ts`
- `server/services/oauth.ts`
- `server/config/index.ts`
- `README.md`

---

## Task 8 — Don't leak admin-user existence from `whitelist.register` (LOW)

**Problem:** `server/controllers/whitelist.ts:64-73` returns `matchedExistingUsersCount`, which tells a caller which of their submitted addresses already exist as Strapi admins. Gated by the plugin's `update` permission, so the primary risk is lower-privileged admins enumerating peers.

**Fix:**

- Drop `matchedExistingUsersCount` from the response. Return only `{ registeredCount, alreadyWhitelistedCount }`.
- Update the admin UI to stop reading `matchedExistingUsersCount`. The previous "N of these emails already have Strapi admin accounts" hint is removed.
- Remove `countAdminUsersByEmails` from `server/services/whitelist.ts` if it has no other caller.

**Files:**

- `server/controllers/whitelist.ts`
- `server/services/whitelist.ts`
- `admin/src/pages/...` (whitelist page)
- `server/__tests__/`

**Note:** If the product team considers this hint valuable, close the finding as accepted instead of applying the fix, and document the decision here.

---

## Task 9 — Split content-api permission scopes for whitelist and audit (LOW)

**Problem:** `server/routes/index.ts:162-211` exposes read and destructive operations under a single content-api namespace with no route-level scope. A token granted any content-api access to this plugin can call both `GET /whitelist/export` and `DELETE /whitelist`.

**Fix:**

- Split the content-api routes into logical permission actions. Strapi content-api routes accept a `config.auth.scope` array of action strings; add scopes such as:
  - `plugin::strapi-plugin-oidc.whitelist.read` → `GET /whitelist`, `GET /whitelist/export`
  - `plugin::strapi-plugin-oidc.whitelist.write` → `POST /whitelist`, `POST /whitelist/import`
  - `plugin::strapi-plugin-oidc.whitelist.delete` → `DELETE /whitelist`, `DELETE /whitelist/:email`
  - `plugin::strapi-plugin-oidc.audit.read` → `GET /audit-logs`, `GET /audit-logs/export`
  - `plugin::strapi-plugin-oidc.audit.delete` → `DELETE /audit-logs`
- Register the actions in `server/bootstrap.ts` via `strapi.admin.services.permission.actionProvider.registerMany` (parallel to the existing `read`/`update` registrations, but these are content-api scopes not admin section permissions — confirm the correct registration path in Strapi v5 before implementing; `actionProvider` is for the admin panel).
- Document the new scopes in `README.md` and flag the change as a breaking change in `CHANGELOG.md`: existing full-access tokens continue to work; custom tokens scoped to older action names must be re-issued.

**Files:**

- `server/routes/index.ts`
- `server/bootstrap.ts`
- `README.md`
- `CHANGELOG.md`

**Verify first:** confirm that Strapi content-api route `config.auth.scope` is the right mechanism in the targeted Strapi version before committing to this design. If not, propose splitting the routes across separate plugin content-api route files gated by a custom middleware.

---

## Release / rollout notes

- Tasks 1 and 3 introduce new config keys. Document them in `README.md` and ship in a minor version bump; the defaults are chosen to avoid breaking existing installs (Task 1 requires `email_verified=true` by default — this IS a breaking change if installed against an IdP that doesn't emit the claim; call it out in `CHANGELOG.md`).
- Tasks 6 and 9 are observable API/behavior changes — bump minor version and list in `CHANGELOG.md` under Breaking / Behavioral changes.
- Tasks 2, 4, 5, 7, 8 are internal hardenings — bump patch version.
