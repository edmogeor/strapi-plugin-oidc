# ADR 0004: Skip the Strapi login page when OIDC is enabled

## Status

Accepted

## Context

When OIDC is the primary authentication method, showing the Strapi email/password
login page is unnecessary friction and can confuse users. The plugin already
supports "Enforce OIDC", which removes the form fields and blocks local-login
API routes, but the page itself is still rendered and the SSO button still
requires a click.

Users can reach the login page in two independent ways:

1. A direct HTTP request to `/admin` or `/admin/*` (new tab, bookmark,
   redirect after OIDC logout).
2. A client-side React Router navigation to `/auth/login` (for example, after a
   session expires and the admin SPA clears state).

A server-side-only redirect would miss the second path, and a client-side-only
redirect would miss the first path (before the SPA loads).

## Decision

Add a `OIDC_SKIP_LOGIN_PAGE` setting (env/config/Admin UI) that, when enabled,
redirects unauthenticated users directly to the OIDC provider without rendering
the Strapi login page. Implement both server-side and client-side mechanisms:

- **Server-side Koa middleware** in `server/bootstrap.ts` intercepts
  unauthenticated `GET` requests to admin pages before the SPA catch-all serves
  `index.html`. It redirects to `/strapi-plugin-oidc/oidc` when:
  - The request method is `GET`.
  - The path is an admin page (starts with or equals the configured `adminUrl`).
  - The path is not an excluded API route (login, access-token, logout, init,
    register, register-admin, forgot-password, reset-password).
  - The path is not a static asset (`.js`, `.css`, `.png`, `.svg`, `.ico`,
    `.woff2`, `.json`, `.map`).
  - The user has no valid session (`strapi_admin_refresh` cookie is absent).
- **Client-side DOM observer** in `admin/src/index.ts` watches for React Router
  navigations to `/auth/login` and replaces the URL with the OIDC sign-in path
  before the login form is visible.

The public settings endpoint exposes the resolved `skipLoginPage` flag so the
admin frontend can decide whether to install the observer. The logout controller
uses the same flag to choose the fallback destination after RP-initiated logout:
when skip-login-page is enabled, the user lands back on the OIDC sign-in path
instead of the Strapi login page.

## Consequences

- **Unauthenticated users never see the local login page** when the feature is on.
- **First-time setup still works.** The `register-admin` path is excluded from
  the server-side redirect so an initial admin can be created.
- **API calls are unaffected.** The method check and excluded paths keep login,
  token refresh, init, and other admin API calls working.
- **Two implementations must stay in sync.** Any change to redirect rules or the
  sign-in path must be mirrored in both layers.
- **Logout destination is provider-centric.** When there is no end-session
  endpoint, the user flows back through the OIDC sign-in path rather than the
  Strapi login page.
