# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
