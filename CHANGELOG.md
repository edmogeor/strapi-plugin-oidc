# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
