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
  whitelist rejection, logout, etc.) with email, IP, and timestamp.
