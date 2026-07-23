# CONTEXT

Domain terms used throughout this codebase. Separate from implementation details
(those live in `docs/adr/`).

## Core concepts

- **OIDC Provider (IdP)** — The external OpenID Connect identity provider
  (Keycloak, Auth0, Okta, Azure AD, etc.) that authenticates users.
- **Strapi Admin** — The Strapi admin panel (`/admin`). The plugin adds OIDC as
  an authentication method for admin users.
- **RP-Initiated Logout** — The OIDC spec where the Relying Party (this plugin)
  redirects the user's browser to the IdP's end session endpoint to terminate
  the IdP session.
- **PKCE** — Proof Key for Code Exchange. S256 code challenge/verifier pair
  used to protect the authorization code flow from interception.
- **Backchannel Logout** — IdP-initiated logout delivered as a signed `logout_token`
  to the plugin's backchannel endpoint. The token is verified with the IdP JWKS
  and must not contain a `nonce` claim.
- **OIDC Discovery** — At runtime the plugin fetches the provider's
  `/.well-known/openid-configuration` document via `openid-client` and caches the
  resulting `Configuration` for 15 minutes. Discovery is lazy (first sign-in
  request) so Strapi boots even when the IdP is unreachable.

## Plugin concepts

- **Enforce OIDC** — When enabled, the Strapi login form is stripped of
  email/password fields and all local-login API routes return 403. Managed via
  Admin UI toggle, overridable via `OIDC_ENFORCE` config.
- **Skip Login Page** — When enabled, unauthenticated users are redirected
  directly to the OIDC provider without seeing the Strapi login page. Has both
  server-side (Koa middleware) and client-side (DOM MutationObserver)
  implementations.
- **Whitelist** — An email allowlist. When enabled, only whitelisted emails can
  authenticate. When empty, any authenticated OIDC user gets an account.
- **Group-to-Role Mapping** — Maps OIDC group claims from userinfo to Strapi
  admin roles. Takes priority over default OIDC roles for existing users.
- **Default OIDC Roles** — Strapi admin roles assigned to new users when no
  group mapping matches.
- **Audit Log** — Records authentication events (login success/failure,
  whitelist rejection, logout, backchannel logout, etc.) with email, IP, and
  timestamp. Admin UI routes require the plugin's `read`/`update` permissions.
- **Client Assertion** — Optional private-key JWT (`OIDC_CLIENT_ASSERTION`)
  used for client authentication at the token endpoint instead of a static
  `client_secret`.

## Security & runtime concepts

- **Rate Limiting** — Per-IP+UA request caps on OIDC endpoints using
  `rate-limiter-flexible`. The store is in-process memory, so production
  multi-node deployments should add a reverse-proxy limiter.
- **Secure / `__Host-` Cookies** — Short-lived PKCE cookies and session cookies
  are `httpOnly`, `SameSite=Lax`, scoped to `/`, and prefixed with `__Host-`
  when served over HTTPS. `OIDC_FORCE_SECURE_COOKIES` can force the secure flag
  when Strapi cannot auto-detect HTTPS.
- **Lazy OIDC Configuration Singleton** — `server/utils/oidc-client.ts` caches
  the discovered `openid-client` `Configuration` with a TTL and exposes
  `resetOidcConfig()` for tests.
- **Unit vs E2E Test Lanes** — Fast unit tests run against mocked Strapi
  contexts; E2E tests boot real Strapi instances in forked Vitest workers with
  per-worker SQLite databases.

## UI conventions

Casing rules for user-facing strings in the admin panel, aligned with Strapi
admin conventions:

- **Title Case** — Page titles, section headings, navigation items,
  sub-navigation, feature/component names, and modal titles. Capitalise major
  words only (e.g. "Audit Logs", "Single Sign-On").
- **Sentence Case** — Button labels, form labels, placeholders, descriptions,
  error messages, notifications, and success toasts. Capitalise only the first
  word and proper nouns (e.g. "Save settings", "Create new entry").
- **ALL CAPS** — Reserved for rare Strapi conventions such as auth-form buttons
  (e.g. "GO BACK HOME").
- **Lowercase** — Filter operators and programmatic technical labels
  (e.g. "contains", "starts with").
