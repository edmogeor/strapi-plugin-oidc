# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.5] - 2026-04-27

### Fixed

- **Clearer startup warning when `OIDC_ISSUER` is missing** — If `OIDC_ISSUER` is not set in the plugin config at boot, a `[strapi-plugin-oidc]` warning is now logged explaining that discovery was skipped and OIDC sign-in will fail. Previously this failed silently.

---

## [1.9.4] - 2026-04-27

### Changed

- **OIDC_ISSUER replaces OIDC_DISCOVERY_URL** — User now sets only `OIDC_ISSUER` (e.g. `https://auth.example.com` or `https://auth.example.com/realms/myrealm`). The plugin auto-appends `/.well-known/openid-configuration` if not present, and strips it if already included. Canonical issuer is stored in config after discovery.

---

## [1.9.3] - 2026-04-26

### Changed

- **UI labels aligned to Strapi's casing conventions** — Button labels, descriptions, and error messages updated to sentence case; page titles, section headings, and modal titles use Title Case, matching Strapi's own UI style. All 25 non-English locale files updated to match.
- **"Clear" button renamed to "Delete all"** — The clear/delete-all button on the whitelist and audit log now reads "Delete all". The shared locale key is `button.deleteAll` (was `button.clear`).
- **Settings page title updated** — Now reads "Configure Admin OIDC Login Settings and View Logs".

### Fixed

- **Title and heading casing corrected** — Page titles, section headings, and modal titles restored to Title Case per Strapi's conventions (e.g. "Authentication Failed", "Unsaved Changes", "Delete All Entries").

---

## [1.9.2] - 2026-04-26

### Changed

- **Shared locale keys for Clear and Export buttons** — Whitelist and audit log clear button labels now share `button.clear`; export button labels share `button.export`. Removed redundant `whitelist.delete.all.label`, `whitelist.export`, `auditlog.clear`, and `auditlog.export` locale keys across all 25 supported locales.

---

## [1.9.1] - 2026-04-26

### Fixed

- **White screen on admin login** — The plugin settings link was registered with a `React.lazy` component instead of a raw `() => import(path)` function. Strapi's runtime invariant check threw an uncaught error during app startup, crashing the admin panel before the login page could render.

---

## [1.9.0] - 2026-04-26

### Added

- **Translations for 26 locales** — Server-rendered authentication pages (sign-in error, missing code, invalid state) now display in the user's browser language. Supported locales: ar, cs, de, el, es, fi, fr, he, hr, hu, id, it, ja, ko, ms, nl, pl, pt-BR, pt, ro, ru, sk, sv, th, tr, uk, vi, zh-Hans, zh-Hant.
- **Unit test suite** — `npm run test:unit` runs 65 fast unit tests (~700ms, no Strapi bootstrap) covering `buildWhereClause`, `parseAuditLogFilters`, `buildQueryString`, and i18n locale loading. `npm test` now runs unit tests before e2e so failures are caught early.
- **`npm run typecheck`** — Runs `tsc --noEmit` for a standalone type check without building.

### Fixed

- **Boolean env vars now accepted by config schema** — `REMEMBER_ME`, `OIDC_ENFORCE`, `OIDC_REQUIRE_EMAIL_VERIFIED`, and `OIDC_FORCE_SECURE_COOKIES` were rejected when set via `.env` files because environment variables arrive as strings. The schema now coerces `"true"`/`"1"` → `true` and `"false"`/`"0"` → `false` itself.
- **Sign-in config errors return a proper error page** — If required config (e.g. `OIDC_CLIENT_ID`) is missing at sign-in time, the user now sees a localised error page instead of an unhandled exception leaking config key names.
- **Audit log errors no longer block logout** — Both `logAudit` calls in the logout handler are now guarded with `.catch` so a database failure never prevents the redirect. Errors are logged via `strapi.log.error` rather than swallowed silently.
- **`importUsers` no longer rejects null/missing email fields** — The import schema now accepts `null` or absent email values and skips them rather than returning a 400.
- **Audit log details now translate in the user's locale** — Detail strings (e.g. "Roles updated: Editor") are translated client-side using the browser locale instead of being fixed to English server-side. The NDJSON export continues to use English.
- **ESLint errors resolved** — Unused variables, missing React imports, and unsafe `Function` types corrected across the codebase.

### Changed

- **Zod validation at all external boundaries** — OIDC token responses, userinfo responses, and the discovery document are now validated with Zod schemas. A malformed provider response throws `OidcError('provider_response_invalid')` with a distinct audit log entry (`login_failure`) instead of a silent type cast.
- **`audit-log-filters.ts` rewritten with Zod** — Hand-rolled validation (165 lines) replaced with Zod schemas (73 lines); `AuditLogFilters` type is now derived from the schema.
- **Constants centralised** — Magic values extracted to `shared/constants.ts`: `COOKIE_NAMES`, `CONTENT_TYPES`, `PERMISSIONS`, `RATE_LIMIT`, `PKCE_COOKIE_MAX_AGE_MS`, `DISCOVERY_TIMEOUT_MS`, `DAY_MS`, and others. All callsites updated to import from the single source.
- **Error strings consolidated** — `audit-error-strings.ts` deleted; all server error and log messages now live in `error-strings.ts`. Audit detail keys resolved from `en.json` via `i18n.ts`.
- **ESLint added to CI** — The CI workflow now runs `npm run lint` on every push and pull request to `main`.

---

## [1.8.5] - 2026-04-22

### Added

- **`npm run test:unit`** — New unit test script and `vitest.config.unit.ts` covering pure modules: `buildWhereClause`, `classifyOidcError`, `collectGroupMapRoleNames`, `rolesChanged`, `buildQueryString`, and the `useOidcSettings` reducer.

### Changed

- **README proxy documentation corrected** — `server.proxy: true` (Strapi v4) no longer works in v5; the correct key is `server.proxy.koa`. README now shows the v5 structure.
- **`server/controllers/oidc/` refactored** — Split the 664-line controller into focused modules: `signIn`, `callback`, `logout`, `userAuth`, `errors`, and `shared`. Public surface unchanged.
- **`server/services/auditLog/` refactored** — Filter-to-where-clause composition moved to `queryBuilder.ts`, JSON-locale interpolation to `translations.ts`. Service is now a thin wrapper.
- **`admin/src/components/AuditLog/` refactored** — Break the 441-line component into `FilterBar`, `LogTable`, `useAuditLogs`, `queryString`, and types. Index now owns only page actions and orchestration state.
- **`admin/src/pages/HomePage/useOidcSettings/` refactored** — Reducer extracted to `reducer.ts`. Hook module focuses on effect wiring (hydration, save, handlers).

### Removed

- **Orphaned `audit-log-filters` unit test deleted** — The file was outside `server/__tests__/e2e/` and never matched the vitest include glob, so it never ran. Behavior is exercised by the e2e suite.

---

## [1.8.4] - 2026-04-21

### Fixed

- **`OIDC_TRUSTED_IP_HEADER` allowlist expanded** — Previously only `cf-connecting-ip` was accepted; any other value was silently ignored. The allowlist now includes all headers that CDN/proxy vendors guarantee to strip from client requests: `cf-connecting-ip` (Cloudflare), `true-client-ip` (Cloudflare Enterprise / Akamai), `x-real-ip` (nginx), and `fastly-client-ip` (Fastly).

---

## [1.8.3] - 2026-04-21

### Fixed

- **Discovery failure no longer fatal** — If `OIDC_DISCOVERY_URL` is unreachable at bootstrap, the error is now logged as a warning rather than throwing and preventing Strapi from starting. The missing endpoint config is still surfaced clearly at login time via the existing required-config check.

---

## [1.8.2] - 2026-04-21

### Fixed

- **Discovery failure now fatal** — If `OIDC_DISCOVERY_URL` is set but unreachable at bootstrap, Strapi now throws and refuses to start rather than silently continuing with missing endpoint config.

### Changed

- **Centralised error strings** — All server-side error and log messages are now defined in `error-strings.ts` rather than scattered as inline strings across controllers, bootstrap, and utilities.

---

## [1.8.1] - 2026-04-21

### Changed

- **OIDC discovery document support** — Replaced the six individual endpoint env vars (`OIDC_AUTHORIZATION_URL`, `OIDC_TOKEN_URL`, `OIDC_USERINFO_URL`, `OIDC_END_SESSION_URL`, `OIDC_JWKS_URI`, `OIDC_ISSUER`) with a single `OIDC_DISCOVERY_URL`. The plugin fetches the discovery document at bootstrap and auto-configures all endpoints. Minimum required config is now `OIDC_DISCOVERY_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URI`.
- **Removed `OIDC_GRANT_TYPE`** — `authorization_code` is now hardcoded; the env var is no longer read or required.

### Fixed

- **Audit log loading UX** — Table now retains its height while new results load (rows stay in the DOM at reduced opacity). A minimum 400 ms spinner duration prevents jarring flashes on fast connections. The initial render no longer flashes an empty-state message before data arrives.
- **Audit log stale fetch** — Rapidly changing filters no longer allows a slower in-flight request to overwrite fresher results from a later request.
- **Logout overlay** — Full-screen loading spinner now appears immediately on logout click, preventing a blank-page flash during the OIDC redirect. Respects the user's light/dark mode preference.
- **Logout double-patch guard** — The `window.fetch` interceptor is now guarded against being applied more than once during hot-module reload cycles.
- **MutationObserver cleanup** — The SSO button injection observer is now disconnected once the button is injected (when OIDC enforcement is off), avoiding unnecessary DOM observation for the page lifetime.
- **Whitelist empty state** — Empty state row now has consistent minimum height and vertical centring, matching the audit log table.

---

## [1.8.0] - 2026-04-21

### Changed

- **Content-API permission scopes** — All content-API routes now carry explicit permission scopes (`plugin::strapi-plugin-oidc.whitelist.read`, `.whitelist.write`, `.whitelist.delete`, `.audit.read`, `.audit.delete`). Full-access tokens are unaffected. Custom tokens that previously relied on the auto-generated handler-name scopes (e.g. `plugin::strapi-plugin-oidc.whitelist.info`) must be re-issued and granted the new semantic scope(s).
- **README simplification** — Removed verbose wording throughout, consolidated security features into a dedicated section, and clarified config option descriptions with discovery document field references
- Config comments now reference the OIDC discovery document field names for all relevant options

## [1.7.6] - 2026-04-20

### Fixed

- **Button/input height parity across breakpoints** — Whitelist and audit log buttons now match the height of their adjacent inputs at both breakpoints (4rem ≥ 768px, 4.8rem below) instead of only above 768px. Extracted as a shared `SizedButton` for reuse.
- **Tag filter input sizing below 768px** — Custom tag inputs now follow Strapi's `Field.Input` padding behaviour (`padding-block` switches from 8px to 12px below 768px), so the audit log filter row lines up with native fields on narrow screens.

### Changed

- **Whitelist wrap spacing** — Reduced vertical gap between the email row and the action buttons when the whitelist toolbar wraps.
- **Save button spacing** — Added extra spacing between the Save changes button and the audit log section below it.

### Reverted

- **Tag input autofill suppression (1.7.5)** — Reverted the autofill/password-manager suppression attributes on tag inputs. The behaviour they were meant to suppress is acceptable and the extra attributes are no longer needed.

## [1.7.5] - 2026-04-20

### Fixed

- **Tag input autofill** — Suppress Chrome heuristic autofill and password-manager injections (1Password, LastPass) on tag inputs, which previously ignored `autocomplete="off"`. Applied on the shared input shell so both freeform and combobox tag inputs are covered.

## [1.7.4] - 2026-04-20

### Added

- **Date range compact format** — Date range filter chips now display compactly when start and end share a month/year (e.g. "5 – 6 Apr 2025" or "5 Apr – 4 May 2025").

### Fixed

- **Tag input autocomplete** — Disable browser autocomplete on tag input fields to prevent interference with tag entry.

## [1.7.3] - 2026-04-20

### Fixed

- **Date filter chip format** — Filter chips for date ranges now display in the same date-only format as the audit log table (e.g. "Apr 20, 2026") instead of the verbose full format.
- **Tag filter input width** — Increased minimum width of tag filter inputs from 180px to 220px to better accommodate longer values.

## [1.7.2] - 2026-04-20

### Fixed

- **Tag input autocomplete** — Disable browser autocomplete on tag input fields to prevent interference with tag entry.

## [1.7.1] - 2026-04-20

### Fixed

- **Audit log IP addresses behind proxies** — Audit logs now correctly capture the end-user's real IP address when running behind Cloudflare or other reverse proxies by checking `CF-Connecting-IP`, `X-Forwarded-For`, and `X-Real-IP` headers.

## [1.7.0] - 2026-04-20

### Added

- **Audit log filtering** — Filter audit logs by action, email, IP address, and creation date directly from the UI, with multi-value tag inputs for emails/IPs, a dropdown-backed tag input for actions, and a tag-based date input for `createdAt`.
- **Locale-negotiated auth pages** — Server-rendered authentication pages now negotiate the request locale and use drop-in translations.
- **Audit log API** — Documented filtering options, the clear endpoint, and the updated response shape.

### Changed

- Audit log filter row now relies on native flex wrapping for a more stable layout.
- Audit log queries run in parallel and duplicate logout log entries have been removed.

### Fixed

- Stabilized audit log filter row layout when tags are present.
- Resolved miscellaneous Tag input issues surfaced while consolidating shared primitives.

### Refactored

- Consolidated TagInput / TagInputWithOptions and extracted shared Tag primitives.
- Deduplicated shared code across admin/server, simplified the audit log reducer and filter implementation, and trimmed complexity hotspots.
- Removed a `rootDir` violation and eliminated dead code.

### Chores

- Regenerated `package-lock.json` to match the manifest.
- Bumped `@strapi/strapi` and test-app dependencies to v5.42.1.
- Added fallow suppression config and `qs` to `ignoreDeps`.
- E2E tests now clean up fixture admin users after running; removed stale tests for removed filter operators.

## [1.6.6] - 2026-04-17

### Changed

- **Audit log export** — Streaming NDJSON export replaces buffered JSON array export, reducing memory usage for large audit logs.

## [1.6.5] - 2026-04-14

### Removed

- Removed leftover whitelist per-user role assignment code from tests and translations (functionality was previously removed from the UI and backend)

## [1.6.4] - 2026-04-13

### Changed

- Code simplification and minor changes

## [1.6.3] - 2026-04-12

### Fixed

- **Role reset on login** — Existing users' roles were incorrectly reset to the configured default OIDC roles on every login when no OIDC group mapping matched. Default OIDC roles now only apply when creating a new user. Roles for existing users are only updated when an active group-to-role mapping resolves their groups.

## [1.6.2] - 2026-04-12

### Fixed

- **Role preservation on mapping changes** — When OIDC group-to-role mapping changes or a user's groups change, manually assigned roles are now preserved. Previously, OIDC would overwrite any role changes made by administrators. Now, only users who are currently on OIDC-assigned roles will have their roles updated on login.
- TypeScript type definitions updated to reflect that `removeUser` accepts an email address, not an internal ID.
- Fixed type error in test helpers where `SuperAgentTest` was used instead of the base `Agent` type.

### Refactored

- Removed dead code in OIDC controller (empty `else if` branch).
- Whitelist service now uses `getWhitelistQuery()` helper consistently instead of direct `strapi.db.query()` calls.

## [1.6.1] - 2026-04-11

### Fixed

- `DELETE /whitelist/:id` changed to `DELETE /whitelist/:email` — the route now correctly accepts an email address rather than an internal ID.

### Changed

- README whitelist API documentation updated to reflect current behavior: import/add operations no longer accept per-user roles.

## [1.6.0] - 2026-04-10

### Added

- **Audit logging** — All OIDC authentication events (login success/failure, user created, logout, session expired, CSRF/nonce failures) are now recorded in a queryable audit log table with a UI in the plugin settings. Logs can be exported as JSON or accessed via the REST API (`/api/strapi-plugin-oidc/audit-logs`). Records older than `AUDIT_LOG_RETENTION_DAYS` (default: 90) are automatically purged daily.
- **OIDC group-to-role mapping** — Configure `OIDC_GROUP_FIELD` and `OIDC_GROUP_ROLE_MAP` to automatically assign Strapi roles based on the user's OIDC group membership. Role assignment follows this precedence: (1) group mapping, (2) default OIDC roles.
- **Pagination** — Whitelist matching and audit log views now paginate with 10 items per page to improve performance with large datasets.
- **Streaming export** — Export endpoints now use streaming responses for efficient memory usage with large datasets.

### Changed

- Removed per-user role assignment from the whitelist UI. Users now always receive roles from the default OIDC role mapping or their OIDC group membership.
- Whitelist export now outputs only emails (no roles), and import accepts plain email arrays.
- Simplified whitelist add form — removed the roles dropdown.
- Whitelist table no longer shows a roles column.

### Fixed

- Email format validation in whitelist import now properly rejects invalid entries.
- Logout now correctly checks provider session expiry before attempting end-session redirect.

### Security

- Stricter email format validation prevents CRLF injection in whitelist entries.

## [1.5.3] - 2026-04-07

### Changed

- Logout now checks the provider session before redirecting to the end-session endpoint. If the access token is expired (provider returns non-2xx), the user is redirected directly to the Strapi login page instead of hitting the provider's bare "Logout successful" page with no redirect.

## [1.5.2] - 2026-04-07

### Changed

- Renamed config variables to match OIDC discovery document field names: `OIDC_SCOPES` → `OIDC_SCOPE`, `OIDC_USER_INFO_ENDPOINT` → `OIDC_USERINFO_ENDPOINT`, `OIDC_LOGOUT_URL` → `OIDC_END_SESSION_ENDPOINT`.

## [1.4.3] - 2026-04-07

### Changed

- Replaced all `any` types in e2e test files with proper TypeScript types (`Core.Strapi`, `WhitelistEntry`, `OidcRole`, service and controller interfaces).
- Added `AdminRole` interface and `getOidcRoles()`/`find()` to `RoleService` in shared types.
- Replaced `(global as any).strapiInstance` with typed `globalThis.strapiInstance` throughout tests.

## [1.4.2] - 2026-04-07

### Security

- Block `POST /admin/register-admin` when OIDC is enforced. This route (initial super-admin setup) was previously missing from the enforcement middleware, allowing it to be reached even with local login disabled.

## [1.4.1] - 2026-04-07

### Security

- OIDC `state` parameter is now always generated server-side; user-supplied values are ignored, preventing CSRF parameter injection.
- Access token is always sent to the userinfo endpoint via `Authorization: Bearer` header (RFC 6750 §2.1). The deprecated query-parameter method has been removed along with the `OIDC_USER_INFO_ENDPOINT_WITH_AUTH_HEADER` config option.
- OIDC nonce is now included in the authorization request and validated against the ID token on callback, preventing ID token replay attacks.
- OIDC callback errors now return a generic message instead of raw internal error details.
- Fixed Gmail alias regex (was a no-op string literal instead of a regular expression).

### Changed

- Whitelist export filename now includes a `YYYYMMDD_HHMMSS` timestamp (e.g. `strapi-oidc-whitelist-20260407_123000.json`).

## [1.4.0] - 2026-04-07

### Added

- **Whitelist import / export** — upload a JSON file to bulk-add entries; export the current list to JSON. Role names are used in the file (resolved to IDs on import) for readability. Duplicate emails and entries already in the whitelist are silently skipped. If an imported email already exists as a Strapi admin user, their current roles are used automatically.
- **Delete All** — new button in the whitelist toolbar with a confirmation dialog. Clears all whitelist entries at once.
- **Unsaved changes modal** — navigating away from the Settings page with unsaved changes now prompts a confirmation dialog (Leave / Stay), powered by React Router's `useBlocker`.
- **"(Default)" role label** — whitelist entries that have no explicit roles assigned now show their effective default role(s) with a `(Default)` badge in the table.
- **Programmatic Whitelist API** — whitelist can now be managed via Strapi API tokens (Full Access). All endpoints are under `/api/strapi-plugin-oidc` and require `Authorization: Bearer <token>`:
  - `GET /whitelist` — list all entries
  - `POST /whitelist` — add one or more emails
  - `POST /whitelist/import` — bulk import from a JSON array
  - `DELETE /whitelist/:id` — remove an entry by ID
  - `DELETE /whitelist` — remove all entries

### Changed

- Routes restructured to the correct Strapi v5 `{ admin, content-api }` object format, enabling API-token authentication on content-api routes while preserving admin-session authentication on the existing admin routes.

## [1.3.2] - 2026-04-07

### Changed

- `OIDC_ENFORCE` config value is now written through to the database on startup when set. This means removing the env var after a lockout recovery will leave the database in the correct state, preventing re-lockout.

## [1.3.1] - 2026-04-07

### Changed

- `REMEMBER_ME` now uses Strapi's own refresh token duration and idle lifespan (`admin.auth.sessions.idleRefreshTokenLifespan`, default 14 days) rather than a custom `REMEMBER_ME_DAYS` config value. Cookie expiry is set to the minimum of the idle window and the token's absolute expiry, matching Strapi's built-in behaviour exactly.

### Removed

- `REMEMBER_ME_DAYS` config option — session duration is now governed by Strapi's session config (`admin.auth.sessions.*`).

## [1.3.0] - 2026-04-07

### Added

- `OIDC_ENFORCE` config variable overrides the Admin UI enforcement toggle and takes priority over the database setting. Set to `false` to regain access if locked out, then restart Strapi. When set, the toggle in the Admin UI is disabled and an info notice is shown.
- SSO login button is now always injected on the Strapi login page (no longer requires a toggle). Includes a key icon for visual differentiation. Button text remains configurable via `OIDC_SSO_BUTTON_TEXT`.

### Changed

- Enforcement no longer redirects users away from the login page server-side. Instead, when enforcement is enabled the standard login fields (email, password, remember-me, submit button, forgot-password link) are removed from the DOM client-side via `MutationObserver`, leaving only the SSO button.
- Removed `showSSOButton` and `ssoButtonText` from database settings. The SSO button is always present; button text is controlled by the `OIDC_SSO_BUTTON_TEXT` config option.
- Extracted shared `OIDC_ENFORCE` resolution logic into `server/utils/enforceOIDC.ts` to avoid duplication between the middleware and controller.
- All translation strings fall back to `en.json` as the single source of truth; no hardcoded duplicates.

### Fixed

- `OIDC_ENFORCE` env variable (`"true"`/`"false"` strings) is now correctly parsed as boolean, preventing enforcement remaining active when set to `"false"`.

## [1.2.4] - 2026-04-07

### Fixed

- Eliminated loading spinner flash on fresh unauthenticated visits by hiding the page at bootstrap when no JWT is present, before React renders.
- Fixed OIDC logout causing a login loop: a `sessionStorage` flag is now set before navigating to the logout endpoint and survives the full redirect chain (Strapi → OIDC provider → back to admin), preventing the enforcement redirect from immediately sending the user back to OIDC after logout.

## [1.2.3] - 2026-04-07

### Fixed

- Eliminated login page flash on first visit (no cached enforcement state) by hiding the document immediately when landing on an auth route, before the async enforcement check resolves.

## [1.2.2] - 2026-04-07

### Fixed

- Eliminated brief flash of the Strapi login page before OIDC redirect when enforcement is enabled, by hiding the document before navigation is triggered.

## [1.2.1] - 2026-04-07

### Changed

- Login Settings: all three setting rows now wrap to a stacked layout at the same breakpoint for consistent responsive behaviour.
- Login button text input fills the full width of its container when the row is stacked.

## [1.2.0] - 2026-04-07

### Added

- "Login via SSO" button injected on the Strapi login page when `enforceOIDC` is disabled, giving users the option to authenticate via OIDC alongside normal login. The button matches the existing Login button's appearance and text is localisation-ready.
- Pre-commit hook to automatically strip OIDC credentials from `test-app/.env` before committing, keeping the file tracked in git without exposing secrets. Working copy is preserved untouched.

### Fixed

- Logout now only redirects to the OIDC provider's logout URL (`OIDC_END_SESSION_ENDPOINT`) for sessions established via OIDC, identified server-side by the `oidc_authenticated` cookie. Local admin users are redirected directly to the Strapi login page.

### Changed

- All logout requests are routed through `/strapi-plugin-oidc/logout`, with the server as the single source of truth for the redirect destination. Eliminates edge cases where stale client-side state could cause the wrong user to be redirected to the OIDC provider.
- Removed ineffective client-side clearing of `httpOnly` cookies (`strapi_admin_refresh`, `oidc_authenticated`); these are correctly cleared server-side only.

## [1.1.2] - 2026-04-07

### Fixed

- Prevented the login page from flashing before the OIDC redirect by unshifting the server-side Koa enforcement middleware to the beginning of the stack and improving the HTML intercept check.

## [1.1.1] - 2026-04-07

### Fixed

- Ensured Strapi's session cookies (`strapi_admin_refresh`), `localStorage`, and `sessionStorage` tokens are fully cleared upon an intercepted OIDC logout to completely prevent accessing the admin dashboard after logging out.

## [1.1.0] - 2026-04-07

### Added

- Complete enforcement of OIDC login by intercepting server-side requests using Strapi's built-in session cookie (`strapi_admin_refresh`), eliminating any UI flash.

### Security

- Blocked all local authentication API routes (`POST /admin/login`, `/admin/register`, `/admin/forgot-password`, `/admin/reset-password`) when OIDC enforcement is enabled.
- Intercepts successful logout requests and redirects to the OIDC provider's logout URL to prevent Strapi from rendering the local login screen.

### Changed

- Moved frontend React libraries (`react`, `react-dom`, `react-router-dom`, `styled-components`) to `peerDependencies` and `devDependencies` to prevent bundle bloat and version conflicts in consuming Strapi applications.
- Refactored server-side middleware for improved performance and reduced complexity.
- Cleaned up project dependencies and unused code using the Fallow analyzer.

## [1.0.18] - 2026-04-06

### Changed

- Enhanced user experience in the Whitelist settings by replacing the native browser alert with the standard Strapi notification toaster when attempting to add an already existing email.

## [1.0.16] - 2026-04-06

### Changed

- Standardized the check for production environments. The OIDC callback controller now uses Strapi's internal `strapi.config.get('environment')` instead of relying directly on `process.env.NODE_ENV`, perfectly aligning it with Strapi's own core session manager.

## [1.0.15] - 2026-04-06

### Fixed

- Reverted the dynamic `Secure` and `SameSite` flags added to the client-side `jwtToken` cookie in `v1.0.14`. This ensures seamless compatibility in setups where the Strapi server is behind a reverse proxy that handles HTTPS while communicating with the server over HTTP, as well as preserving local development flexibility without breaking the Strapi Admin authentication flow.

## [1.0.14] - 2026-04-06

### Fixed

- Added dynamic `Secure` and `SameSite=Lax` flags to the `jwtToken` cookie set by the browser during the final successful authentication redirect, further hardening the client-side session flow against insecure transports.

## [1.0.11] - 2026-04-06

### Fixed

- Resolved the `Cannot send secure cookie over unencrypted connection` error by entirely bypassing Koa-Session. The OIDC flow now uses explicit short-lived secure-agnostic cookies for its `code_verifier` and `state`, ensuring maximum compatibility with instances running behind reverse proxies (like Cloudflare, Nginx, or Traefik) without strict HTTPS proxy header configurations.

## [1.0.10] - 2026-04-06

### Fixed

- Automatically apply `strapi::session` middleware to OIDC routes to prevent `Cannot set properties of undefined (setting 'codeVerifier')` errors without requiring user configuration changes.

## [1.0.9] - 2026-04-06

### Security

- Plugged OIDC enforcement bypass vectors by adding a strict server-side middleware that blocks Strapi's local `/admin/login` API route when OIDC enforcement is enabled.
- Fixed a client-side routing bug where query parameters or hash segments in the URL could bypass the OIDC login screen redirect.

## [1.0.8] - 2026-04-06

### Security

- Replaced `axios` dependency with the native `fetch` API to reduce bundle size and vulnerability surface area.

### Changed

- Updated all non-breaking dependencies to their latest compatible versions.

## [1.0.7] - 2026-04-06

### Changed

- Disabled source map generation explicitly in the TypeScript configuration files.
- Re-architected plugin configurations and .env dependencies within the internal `test-app`.
- Conditioned the Whitelist settings UI container to entirely hide its contents (email inputs, role assignments, and member tables) when the whitelist feature is toggled off.

### Fixed

- Added missing translation placeholder for roles (`roles.placeholder`).
- Fixed a UI translation bug where internal translation string IDs were leaking onto the save modal components.

## [1.0.6] - 2026-04-06

### Security

- Mitigated Reflected XSS vulnerability in the authentication error screen by escaping error messages.
- Fixed a logic bypass in the email whitelist where case-sensitive comparisons could block legitimate users or allow bypasses by normalizing all emails to lowercase.
- Added a secure, sliding-window rate limiter to OIDC authentication endpoints to prevent brute-force and DoS attacks.

### Changed

- Enhanced authentication UI with styled light/dark mode success and error screens.
- Fixed whitelist settings persistence across server restarts.
- Enforce OIDC is now automatically disabled if the whitelist becomes empty, preventing accidental lockouts.

## [1.0.5] - 2026-04-05

### Changed

- Comprehensive codebase simplification and refactoring.
- Addressed code duplication and complexity hotspots identified by Fallow analyzer.
- Added `fallow:check` and `fallow:fix` NPM scripts for ongoing maintenance.
- Improved reliability and readability of OAuth flows and UI state management.

## [1.0.4] - 2026-04-05

### Changed

- Renamed `REMEMBER_ME_DURATION` to `REMEMBER_ME_DAYS` to allow configuring the duration in days instead of milliseconds.

## [1.0.3] - 2026-04-05

### Added

- Added `REMEMBER_ME_DURATION` config option (defaults to 30 days) to control how long "remember me" sessions persist in the browser.

## [1.0.2] - 2026-04-05

### Fixed

- Resolved `npm ci` lockfile mismatch errors during the publishing workflow.
- Added concurrency controls to cancel outdated publishing workflows when a new release is triggered.

## [1.0.1] - 2026-04-05

### Fixed

- Fixed publishing workflow configuration to properly support Trusted Publisher OIDC authentication for automated releases.

## [1.0.0] - 2026-04-05

### Added

- Initial stable release of the `strapi-plugin-oidc` plugin.
- Support for Strapi v5.
- Automated CI/CD pipeline.
