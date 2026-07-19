# openid-client Migration Plan

Replace hand-rolled OIDC Authorization Code Flow + PKCE with
[`openid-client`](https://github.com/panva/openid-client) v6.8. No backward
compatibility shims — users must update their config.

## Dependency Changes

| Action | Package                | Reason                                                                                            |
| ------ | ---------------------- | ------------------------------------------------------------------------------------------------- |
| Add    | `openid-client` ^6.8.4 | OIDC discovery, auth URL, token exchange, ID token verification, userinfo, logout                 |
| Remove | `pkce-challenge`       | Replaced by `client.randomPKCECodeVerifier()` + `client.calculatePKCECodeChallenge()`             |
| Remove | `jose` (direct dep)    | Only used by `verifyIdToken()` + JWKS cache, both deleted. Becomes transitive via `openid-client` |

## Config Changes

### Removed keys (discovered from `OIDC_ISSUER`)

```
OIDC_AUTHORIZATION_ENDPOINT
OIDC_TOKEN_ENDPOINT
OIDC_USERINFO_ENDPOINT
OIDC_END_SESSION_ENDPOINT
OIDC_JWKS_URI
```

Users must remove these from their plugin config. If their IdP discovery document
does not serve correct endpoints, they must fix the IdP, not the plugin config.

No config override escape hatch. See ADR 0001.

### Config surface after migration

```
OIDC_ISSUER           ← source of truth (used for discovery)
OIDC_CLIENT_ID
OIDC_CLIENT_SECRET
OIDC_PUBLIC_URL       ← origin for redirect_uri construction
OIDC_SCOPE
OIDC_FAMILY_NAME_FIELD
OIDC_GIVEN_NAME_FIELD
OIDC_SSO_BUTTON_TEXT
OIDC_ENFORCE
OIDC_SKIP_LOGIN_PAGE
OIDC_GROUP_FIELD
OIDC_GROUP_ROLE_MAP
OIDC_REQUIRE_EMAIL_VERIFIED
OIDC_TRUSTED_IP_HEADER
OIDC_FORCE_SECURE_COOKIES
REMEMBER_ME
AUDIT_LOG_RETENTION_DAYS
```

## Cookie Changes

### Before (7 cookies)

| Cookie                 | Purpose                    | Scope                                     |
| ---------------------- | -------------------------- | ----------------------------------------- |
| `oidc_state`           | CSRF state                 | Short-lived (10 min, cleared at callback) |
| `oidc_code_verifier`   | PKCE verifier              | Short-lived (10 min, cleared at callback) |
| `oidc_nonce`           | ID token nonce             | Short-lived (10 min, cleared at callback) |
| `oidc_access_token`    | Logout userinfo probe      | Session (set at login)                    |
| `oidc_user_email`      | Audit log at logout        | Session (set at login)                    |
| `oidc_authenticated`   | OIDC session marker        | Session (set at login)                    |
| `strapi_admin_refresh` | Strapi session (unchanged) | Session (managed by Strapi)               |

### After (5 cookies)

| Cookie                 | Purpose                                               | Scope                                     |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------- |
| `oidc_state`           | CSRF state                                            | Short-lived (10 min, cleared at callback) |
| `oidc_code_verifier`   | PKCE verifier                                         | Short-lived (10 min, cleared at callback) |
| `oidc_id_token`        | stored ID token (logout hint + OIDC session detector) | Session (set at login)                    |
| `oidc_user_email`      | Audit log at logout                                   | Session (set at login)                    |
| `strapi_admin_refresh` | Strapi session (unchanged)                            | Session (managed by Strapi)               |

### Rationale for each removal

- **`oidc_nonce`**: `openid-client` generates and verifies nonce internally when
  PKCE is not supported. With PKCE (which we always use), nonce is redundant
  for replay protection. `client.serverMetadata().supportsPKCE()` confirms support.

- **`oidc_access_token`**: Used exclusively for `isProviderSessionExpired()`
  userinfo probe at logout. Replaced by `buildEndSessionUrl` +
  `id_token_hint` for spec-correct RP-Initiated Logout. No other consumer.

- **`oidc_authenticated`**: Existed to answer "is this an OIDC session?" at
  logout and token refresh. `oidc_id_token` serves the same purpose — if you
  have an ID token, you came via OIDC. One cookie for two purposes.

## Architecture Changes

### New: `server/utils/oidc-client.ts` — Lazy OIDC Configuration Singleton

```typescript
import * as client from 'openid-client';
import type { Configuration } from 'openid-client';

let configPromise: Promise<Configuration> | null = null;

export function getOidcConfig(): Promise<Configuration> {
  if (!configPromise) {
    const issuer = /* from strapi.config */;
    const clientId = /* ... */;
    const clientSecret = /* ... */;
    configPromise = client.discovery(new URL(issuer), clientId, clientSecret);
  }
  return configPromise;
}

export function resetOidcConfig(): void {
  configPromise = null;
}
```

Discovery runs lazily on first sign-in request, not at bootstrap. Strapi boots
fine even when the IdP is unreachable. The promise is cached so discovery runs
once. `resetOidcConfig()` exposed for test cleanup.

### Rewritten: `server/utils/discovery.ts`

Replaced by `oidc-client.ts` singleton. The old `applyDiscovery()` function
that fetched `/.well-known/openid-configuration` with raw `fetch()` and Zod
parsing is deleted. `client.discovery()` handles all of this.

Remove `OIDC_DISCOVERY_PATH` and `DISCOVERY_TIMEOUT_MS` from constants.

### Rewritten: `server/controllers/oidc/signIn.ts`

```typescript
import * as client from 'openid-client';
import { getOidcConfig } from '../../utils/oidc-client';

export async function oidcSignIn(ctx: StrapiContext) {
  // skip-login-page gating unchanged

  const config = await getOidcConfig();

  // PKCE
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

  // State for CSRF
  const state = client.randomState();

  // Store in cookies (same pattern as before)
  ctx.cookies.set(COOKIE_NAMES.state, state, cookieOptions);
  ctx.cookies.set(COOKIE_NAMES.codeVerifier, codeVerifier, cookieOptions);

  // Build authorization URL
  const redirectUri = resolveRedirectUri(pluginConfig);
  const authUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: pluginConfig.OIDC_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  ctx.set('Location', authUrl.href);
  return ctx.send({}, 302);
}
```

Changes from current:

- Uses `client.randomPKCECodeVerifier()` instead of `pkce-challenge`
- Uses `client.randomState()` instead of `randomBytes`
- Uses `client.buildAuthorizationUrl()` instead of manual URL construction
- No nonce generation (openid-client handles internally)
- Fails at first sign-in attempt if discovery failed (returns error page)

### Rewritten: `server/controllers/oidc/callback.ts`

```typescript
import * as client from 'openid-client';
import { getOidcConfig } from '../../utils/oidc-client';

export async function oidcSignInCallback(ctx: StrapiContext) {
  const oidcConfig = await getOidcConfig();

  // Read and clear cookies
  const oidcState = ctx.cookies.get(COOKIE_NAMES.state);
  const codeVerifier = ctx.cookies.get(COOKIE_NAMES.codeVerifier);
  ctx.cookies.set(COOKIE_NAMES.state, null);
  ctx.cookies.set(COOKIE_NAMES.codeVerifier, null);

  if (!ctx.query.code) {
    // missing_code audit log unchanged
    return ctx.send(...);
  }

  if (!oidcState || !codeVerifier) {
    // state_mismatch audit log
    return ctx.send(...);
  }

  // exchangeTokenAndFetchUserInfo REPLACED by:
  const currentUrl = new URL(ctx.request.href);
  const tokens = await client.authorizationCodeGrant(oidcConfig, currentUrl, {
    pkceCodeVerifier: codeVerifier,
    expectedState: oidcState,
    idTokenExpected: true,
  });

  // ID token claims (sub, email, etc.) — verified by the library
  const claims = tokens.claims();
  const userInfo = await client.fetchUserInfo(
    oidcConfig, tokens.access_token, claims.sub
  );

  // Store ID token for logout
  ctx.cookies.set(COOKIE_NAMES.idToken, tokens.id_token, { ... });

  // User authentication unchanged
  const { activateUser, jwtToken, userCreated, rolesUpdated, resolvedRoleNames } =
    await handleUserAuthentication(/* same args, userInfo from openid-client */);
}
```

Key simplifications:

- `exchangeTokenAndFetchUserInfo()` deleted — `authorizationCodeGrant()` + `fetchUserInfo()` do everything
- `tokenResponseSchema`, `oidcUserInfoSchema` deleted — library validates
- `verifyIdToken()` call deleted — library verifies signature, issuer, audience, expiry, nonce automatically
- `readAndClearPkceCookies()` simplified — nonce cookie removed
- `oidc_access_token` cookie setting removed
- `oidc_authenticated` cookie setting removed
- `oidc_id_token` cookie added

### Simplified: `server/controllers/oidc/shared.ts`

Remove:

- `verifyIdToken()` — handled by `authorizationCodeGrant`
- `getJwks()` — handled by `client.discovery()` internally
- `jwksCache` — no longer needed
- `jwksDisabledWarned` — no longer needed
- `OIDC_JWKS_URI` from `REQUIRED_CONFIG_KEYS`
- Five endpoint config keys from `REQUIRED_CONFIG_KEYS`

Keep:

- `resolveRedirectUri()` — unchanged
- `configValidation()` — simplified required keys check

### Rewritten: `server/controllers/oidc/logout.ts`

Remove:

- `isProviderSessionExpired()` — entire function deleted
- `oidc_authenticated` cookie read → replaced with `oidc_id_token` check
- `oidc_access_token` cookie read → deleted
- `LOGOUT_USERINFO_TIMEOUT_MS` import → deleted
- Manual redirect to `config.OIDC_END_SESSION_ENDPOINT` → replaced with `buildEndSessionUrl`

```typescript
import * as client from 'openid-client';
import { getOidcConfig } from '../../utils/oidc-client';

export async function logout(ctx: StrapiContext) {
  const oidcConfig = await getOidcConfig().catch(() => null);

  const idToken = ctx.cookies.get(COOKIE_NAMES.idToken);
  const userEmail = ctx.cookies.get(COOKIE_NAMES.userEmail) ?? undefined;

  clearAuthCookies(strapi, ctx);

  if (!idToken) {
    return ctx.redirect(fallbackUrl); // non-OIDC session
  }

  await auditLog.log({ action: 'logout', email: userEmail, ip: getClientIp(ctx) });

  if (oidcConfig) {
    const endSessionUrl = client.buildEndSessionUrl(oidcConfig, {
      id_token_hint: idToken,
      post_logout_redirect_uri: fallbackUrl,
    });
    return ctx.redirect(endSessionUrl.href);
  }

  return ctx.redirect(fallbackUrl);
}
```

### Simplified: `server/controllers/oidc/errors.ts`

`classifyOidcError` — any error that is not an `OidcError` instance
(including `openid-client`'s `OperationProcessingError`) maps to
`login_failure` audit action. The `OidcError` branch stays for business-logic
errors from `userAuth.ts`.

### Simplified: `server/oidc-errors.ts`

Remove error kinds:

- `nonce_mismatch`
- `token_exchange_failed`
- `id_token_parse_failed`
- `userinfo_fetch_failed`
- `id_token_invalid`
- `provider_response_invalid`

Keep error kinds:

- `whitelist_rejected`
- `invalid_email`
- `email_not_verified`
- `user_creation_failed`
- `unknown`

Remove corresponding entries in `OIDC_ERROR_DISPATCH`.

### Simplified: `server/error-strings.ts`

Remove error messages:

- `TOKEN_EXCHANGE_FAILED`
- `USERINFO_FETCH_FAILED`
- `ID_TOKEN_PARSE_FAILED`
- `NONCE_MISMATCH`
- `ID_TOKEN_INVALID`
- `PROVIDER_RESPONSE_INVALID`
- `JWKS_URI_NOT_CONFIGURED`

Remove error codes:

- `TOKEN_EXCHANGE_FAILED`
- `USERINFO_FETCH_FAILED`
- `ID_TOKEN_PARSE_FAILED`
- `NONCE_MISMATCH`
- `ID_TOKEN_INVALID`
- `PROVIDER_RESPONSE_INVALID`

Remove detail templates:

- `token_exchange_failed`
- `userinfo_fetch_failed`
- `id_token_parse_failed`
- `id_token_invalid`
- `provider_response_invalid`

### Updated: `server/utils/cookies.ts`

```typescript
export const COOKIE_NAMES = {
  state: 'oidc_state',
  codeVerifier: 'oidc_code_verifier',
  idToken: 'oidc_id_token',
  userEmail: 'oidc_user_email',
  adminRefresh: 'strapi_admin_refresh',
} as const;
```

Remove: `nonce`, `accessToken`, `authenticated`
Add: `idToken`

`clearAuthCookies` — remove `accessToken`, `authenticated` and `userEmail`
clears. Add `idToken` clear.

### Updated: `server/bootstrap.ts`

Replace `applyDiscovery()` call with nothing (lazy init). Remove
`OIDC_DISCOVERY_PATH`, `DISCOVERY_TIMEOUT_MS` imports.

Token refresh middleware: check `oidc_id_token` cookie instead of
`oidc_authenticated`.

### Updated: `server/config/index.ts`

Remove default values for the five endpoint config keys.

### Updated: `shared/constants.ts`

Remove:

- `LOGOUT_USERINFO_TIMEOUT_MS`
- `OIDC_DISCOVERY_PATH`
- `DISCOVERY_TIMEOUT_MS`

## Audit Log Changes

Six protocol-level audit actions no longer emitted:

| Removed Action              | Replaced By     |
| --------------------------- | --------------- |
| `token_exchange_failed`     | `login_failure` |
| `nonce_mismatch`            | `login_failure` |
| `id_token_invalid`          | `login_failure` |
| `provider_response_invalid` | `login_failure` |
| `id_token_parse_failed`     | `login_failure` |
| `userinfo_fetch_failed`     | `login_failure` |

Error message/details stored in `detailsParams` for diagnostics. Admin UI
filter dropdown still lists these actions (they match historical records) but
no new records will use them.

Remaining audit actions (unchanged):
`login_success`, `user_created`, `missing_code`, `state_mismatch`,
`whitelist_rejected`, `email_not_verified`, `logout`, `session_expired`,
`login_failure`

## Test Changes

### Test files to modify

| File                          | Change                                                                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `oidc.e2e.test.ts`            | Remove ID token verification suite (lines ~328–496), remove nonce mismatch test (lines ~213–222), remove `nonce` cookie references |
| `setup.ts`                    | Add MSW handler for `GET /.well-known/openid-configuration` returning valid discovery doc pointing to mock endpoints               |
| `test-helpers.ts`             | Strip 5 endpoint fields from `MOCK_OIDC_CONFIG`. Remove `nonce` cookie helpers.                                                    |
| `skip-login-page.e2e.test.ts` | Replace `oidc_authenticated` + `oidc_access_token` cookies with `oidc_id_token`                                                    |
| `controllers.e2e.test.ts`     | Replace `oidc_access_token` with `oidc_id_token` in logout tests                                                                   |

### Test coverage removed (library responsibility)

- ID token signature verification (RS256, JWKS)
- Expired ID token rejection
- Wrong audience/issuer rejection
- Tampered signature rejection
- Nonce mismatch detection
- Token exchange error classification
- Userinfo fetch error handling

### Test coverage kept (business logic)

- Full login flow (redirect to IdP, callback with token)
- Enforce OIDC middleware (403/401 behavior)
- Whitelist enforcement
- Email verification enforcement
- Group-to-role mapping
- Role fallback and updates
- Logout redirect paths
- State mismatch rejection
- Missing code rejection
- Cookie lifecycle (set/clear)
- Audit log recording
- Skip-login-page middleware

## Files Unchanged

Business logic files untouched:

- `server/controllers/oidc/userAuth.ts`
- `server/services/oauth.ts`
- `server/services/role.ts`, `whitelist.ts`, `auditLog/`
- `server/controllers/role.ts`, `whitelist.ts`, `auditLog.ts`
- `server/services/index.ts`, `server/controllers/index.ts`
- `server/routes/index.ts`
- `admin/` — all UI code
- `translations/` — all locales
- All remaining utility files (`email.ts`, `enforceOIDC.ts`, `http.ts`,
  `ip.ts`, `pluginConfig.ts`, `resolveConfigFlag.ts`, `services.ts`,
  `skipLoginPage.ts`)
- `shared/audit-actions.ts`, `shared/auth-template.ts`, `shared/datetime.ts`,
  `shared/utils.ts`

## Implementation Order

1. Update `package.json` (remove `jose` from direct deps)
2. Simplify `shared/config.ts` — remove endpoint fields
3. Simplify `shared/constants.ts` — remove dead constants
4. Update `server/config/index.ts` — remove endpoint defaults
5. Update `server/utils/cookies.ts` — new cookie names, simplified clearing
6. Create `server/utils/oidc-client.ts` — lazy singleton
7. Simplify `server/utils/discovery.ts` — delete or stub
8. Simplify `server/oidc-errors.ts` — remove protocol error kinds
9. Simplify `server/error-strings.ts` — remove protocol error messages
10. Simplify `server/controllers/oidc/shared.ts` — remove verifyIdToken, simplify configValidation
11. Rewrite `server/controllers/oidc/signIn.ts`
12. Rewrite `server/controllers/oidc/callback.ts`
13. Rewrite `server/controllers/oidc/logout.ts`
14. Simplify `server/controllers/oidc/errors.ts`
15. Update `server/bootstrap.ts` — lazy init, updated cookie checks
16. Update `server/__tests__/e2e/setup.ts` — discovery MSW handler
17. Update `server/__tests__/e2e/test-helpers.ts` — new MOCK_OIDC_CONFIG
18. Update `server/__tests__/e2e/oidc.e2e.test.ts` — remove dead tests
19. Update remaining test files
20. Update `README.md` — removed config keys, updated audit action table
21. Update `CHANGELOG.md` — breaking changes
22. Run typecheck, lint, tests
