# Skip Strapi Login Page

## Summary

New config option `OIDC_SKIP_LOGIN_PAGE` (env: `OIDC_SKIP_LOGIN_PAGE=true`). When enabled, the user never sees the Strapi admin login page — they are redirected directly to the OIDC provider. This uses two independent mechanisms: a server-side Koa middleware for direct HTTP requests, and a client-side DOM observer for React Router navigations.

## Architecture

Two unrelated ways a user can land on the login page, each handled by a different layer:

| Scenario                                                                                                                                     | Mechanism                                                                                                                    | File                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **Server-side**: Direct HTTP request to `/admin` or `/admin/*` (new tab, bookmark, redirect after OIDC logout)                               | Koa middleware intercepts unauthenticated GET requests before the SPA is served, returns `302` to `/strapi-plugin-oidc/oidc` | `server/bootstrap.ts` |
| **Client-side**: React Router navigates to `/auth/login` (session expires, 401 triggers `clearStateAndLogout()` → `navigate('/auth/login')`) | DOM `MutationObserver` fires on auth route render, triggers `window.location.href` redirect before the user sees the page    | `admin/src/index.ts`  |

## Files Changed

### 1. `server/config/index.ts`

Add default:

```ts
OIDC_SKIP_LOGIN_PAGE: false,
```

### 2. `shared/config.ts`

Add to Zod schema:

```ts
OIDC_SKIP_LOGIN_PAGE: coerceBool(false),
```

Existing `coerceBool` handles env var strings (`'true'`, `'1'`, etc.).

### 3. `server/bootstrap.ts`

Add server-side redirect logic to the existing `enforceOidcMiddleware`. When the skip config is enabled, intercept unauthenticated GET requests to admin pages before the SPA catch-all route serves `index.html`.

**Checks before redirecting:**

- `method === 'GET'` — never intercept POST API calls
- Path is an admin page (starts with `${adminUrl}/` or equals `${adminUrl}`)
- Path is not an excluded API route
- Path is not a static asset
- User has no valid session (`strapi_admin_refresh` cookie is absent)

**Excluded API paths** (must still work normally):

- `${adminUrl}/login`
- `${adminUrl}/access-token`
- `${adminUrl}/logout`
- `${adminUrl}/init`
- `${adminUrl}/register`
- `${adminUrl}/register-admin`
- `${adminUrl}/forgot-password`
- `${adminUrl}/reset-password`

**Static assets** excluded by file extension: `.js`, `.css`, `.png`, `.svg`, `.ico`, `.woff2`, `.json`, `.map`

### 4. `server/controllers/whitelist.ts` → `publicSettings()`

Expose the new config to the admin frontend:

```ts
ctx.body = {
  enforceOIDC: resolveEnforceOIDC(strapi, settings.enforceOIDC),
  ssoButtonText: config.OIDC_SSO_BUTTON_TEXT,
  skipLoginPage: config.OIDC_SKIP_LOGIN_PAGE,
};
```

### 5. `admin/src/index.ts`

When `skipLoginPage` is `true` in the public settings response, replace the SSO button injection with immediate redirect logic. A `MutationObserver` watches for auth route renders and redirects before the login form is visible:

```ts
if (data.skipLoginPage) {
  const tick = () => {
    if (isAuthRoute(window.location.pathname)) {
      window.location.href = '/strapi-plugin-oidc/oidc';
    }
  };
  tick(); // immediate check for initial page load
  loginObserver = new MutationObserver(tick);
  loginObserver.observe(document.body, { childList: true, subtree: true });
  return;
}
```

### 6. `server/controllers/oidc/logout.ts`

When `OIDC_SKIP_LOGIN_PAGE` is enabled, the fallback after RP-initiated logout redirects to the OIDC sign-in endpoint instead of the Strapi login page:

```ts
const loginUrl = `${adminPanelUrl}/auth/login`;
const oidcSignInUrl = '/strapi-plugin-oidc/oidc';
const fallbackUrl = getPluginConfig().OIDC_SKIP_LOGIN_PAGE ? oidcSignInUrl : loginUrl;
// ... use fallbackUrl where loginUrl was used
```

This ensures the user lands on the OIDC provider's own page after logout, never Strapi's.

## Logout Flow

**With `end_session_endpoint` configured:**
User → `POST /admin/logout` → interceptor → `/strapi-plugin-oidc/logout` → provider's `end_session_endpoint` → **provider's own logged-out page**

**Without `end_session_endpoint`:**
User → `POST /admin/logout` → interceptor → `/strapi-plugin-oidc/logout` → **`/strapi-plugin-oidc/oidc`** → **provider's auth page**

## Edge Cases

| Case                                         | Handling                                                   |
| -------------------------------------------- | ---------------------------------------------------------- |
| First-time setup (no admin users)            | `register-admin` path excluded from server redirect        |
| User already authenticated                   | `strapi_admin_refresh` cookie check passes through         |
| Static assets (JS/CSS/images)                | Extension-based exclusion                                  |
| API calls (POST login, token refresh, init)  | Method check (GET only) + path exclusion                   |
| Session expires on admin page                | MutationObserver catches React Router nav to `/auth/login` |
| OIDC not configured (missing issuer)         | `oidcSignIn` controller renders error page                 |
| Logout followed by re-navigation to `/admin` | Server middleware catches it, redirects to OIDC            |

## Usage

Set in Strapi's `config/plugins.ts`:

```ts
'strapi-plugin-oidc': {
  enabled: true,
  config: {
    OIDC_SKIP_LOGIN_PAGE: true,       // or process.env.OIDC_SKIP_LOGIN_PAGE
    OIDC_ENFORCE: true,               // recommended alongside
    OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID,
    OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET,
    OIDC_ISSUER: process.env.OIDC_ISSUER,
    // ...
  },
},
```

Or via environment variable:

```bash
OIDC_SKIP_LOGIN_PAGE=true
```
