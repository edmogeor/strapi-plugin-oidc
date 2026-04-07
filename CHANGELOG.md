# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- RP-Initiated Logout (OpenID Connect RP-Initiated Logout 1.0): `GET /strapi-plugin-oidc/logout` now appends `id_token_hint` (stored as an httpOnly cookie after login) and `post_logout_redirect_uri` to the provider's end-session URL when available.
- New config option `OIDC_POST_LOGOUT_REDIRECT_URI`: where the provider should redirect the user after completing logout.

### Changed

- `OIDC_LOGOUT_URL` renamed to `OIDC_END_SESSION_ENDPOINT` to match the OIDC discovery document field name (`end_session_endpoint`).
- `OIDC_USER_INFO_ENDPOINT` renamed to `OIDC_USERINFO_ENDPOINT` to match the OIDC discovery document field name (`userinfo_endpoint`).
- `OIDC_SCOPES` renamed to `OIDC_SCOPE` to match the OAuth2 parameter name (`scope`).

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
- Access token is always sent to the userinfo endpoint via `Authorization: Bearer` header (RFC 6750 §2.1). The deprecated query-parameter method has been removed along with the `OIDC_USERINFO_ENDPOINT_WITH_AUTH_HEADER` config option.
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
