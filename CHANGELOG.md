# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2026-04-05

### Fixed

- Fixed NPM publish 404 error by removing the `registry-url` configuration from `setup-node` which conflicts with Trusted Publisher OIDC authentication.

## [1.0.2] - 2026-04-05

### Fixed

- Only run the publish workflow if tests pass successfully.

## [1.0.1] - 2026-04-05

### Added

- Automated NPM publishing with provenance and GitHub Releases based on CHANGELOG.md parsing.

## [1.0.0] - 2026-04-05

### Added

- Initial stable release of the `strapi-plugin-oidc` plugin.
- Support for Strapi v5.
- Automated CI/CD pipeline.
