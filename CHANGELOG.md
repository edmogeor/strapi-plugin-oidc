# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
