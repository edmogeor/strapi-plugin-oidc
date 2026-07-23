# ADR 0002: Adopt openid-client v6 for the OIDC protocol layer

## Status

Accepted

## Context

The plugin originally implemented the OIDC Authorization Code Flow + PKCE by
hand: it built the authorization URL manually, exchanged the code with raw
`fetch()` calls, parsed the token response, verified the ID token with `jose`,
fetched userinfo, and managed its own JWKS cache. This produced a large amount
of protocol code (`server/utils/discovery.ts`, `verifyIdToken`, `exchangeTokenAndFetchUserInfo`,
`tokenResponseSchema`, `oidcUserInfoSchema`, etc.) and a correspondingly large test
surface for behavior that is really the responsibility of a spec-compliant OIDC
library.

[`openid-client`](https://github.com/panva/openid-client) v6 provides a modern,
well-maintained TypeScript API that covers discovery, authorization URL
construction, PKCE helpers, token exchange, ID token verification, userinfo, and
RP-initiated logout.

## Decision

Replace the hand-rolled protocol layer with `openid-client` v6. The library is
the source of truth for all OIDC protocol operations.

Key consequences of the decision:

- Remove the five explicit endpoint config keys
  (`OIDC_AUTHORIZATION_ENDPOINT`, `OIDC_TOKEN_ENDPOINT`,
  `OIDC_USERINFO_ENDPOINT`, `OIDC_END_SESSION_ENDPOINT`, `OIDC_JWKS_URI`).
  `OIDC_ISSUER` plus discovery is the single source of truth. See ADR 0001.
- Remove direct endpoint override logic and the manual `/.well-known/openid-configuration`
  fetch/parsing in `server/utils/discovery.ts`.
- Use `client.discovery()` for lazy discovery and cache the resulting
  `Configuration` for 15 minutes.
- Use `client.randomPKCECodeVerifier()`, `client.calculatePKCECodeChallenge()`,
  and `client.randomState()` for PKCE and CSRF state.
- Use `client.buildAuthorizationUrl()` for the redirect to the IdP.
- Use `client.authorizationCodeGrant()` and `client.fetchUserInfo()` for the
  callback.
- Use `client.buildEndSessionUrl()` with `id_token_hint` for RP-initiated logout.
- Keep the `nonce` cookie and pass `expectedNonce` to `authorizationCodeGrant()`
  as an additional replay-protection layer even though PKCE is required.
- Remove protocol-level OIDC error kinds (`token_exchange_failed`, `nonce_mismatch`,
  `id_token_invalid`, `id_token_parse_failed`, `userinfo_fetch_failed`,
  `provider_response_invalid`) from the audit log; all protocol failures are now
  classified as `login_failure` with diagnostic details.
- Keep `jose` as a direct dependency because it is still needed for:
  - Private-key JWT client assertions (`OIDC_CLIENT_ASSERTION`) in
    `server/utils/oidc-client.ts`.
  - Logout-token verification in `server/controllers/oidc/backchannelLogout.ts`.

## Consequences

- **Configuration surface shrinks.** Users only need issuer, client ID, client
  secret (or client assertion), and a few identity/behavior settings.
- **Strapi boots without the IdP.** Discovery is lazy, so an unreachable provider
  does not block bootstrap.
- **Test maintenance shrinks.** The plugin no longer tests signature verification,
  issuer/audience checks, nonce validation, or JWKS caching; those are library
  responsibilities.
- **Business-logic tests remain.** Whitelist, group-to-role mapping, role
  fallback, enforce-OIDC, skip-login-page, cookie lifecycle, audit logging, and
  logout paths are still covered.
- **Discovery is the only endpoint source.** A broken IdP discovery document is
  not patchable via config; the operator must fix the IdP.
- **Upgrading users** must remove the five endpoint keys from their config.
