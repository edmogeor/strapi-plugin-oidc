<div align="center">
  <img src="https://raw.githubusercontent.com/edmogeor/strapi-plugin-oidc/main/assets/icon.png" width="140" alt="OIDC Login for Strapi Logo"/>
  <h1>OIDC Login for Strapi</h1>
  <p>
    <a href="https://www.npmjs.com/package/strapi-plugin-oidc">
      <img src="https://img.shields.io/npm/v/strapi-plugin-oidc.svg" alt="npm version">
    </a>
    <a href="https://github.com/edmogeor/strapi-plugin-oidc/actions/workflows/ci.yml">
      <img src="https://github.com/edmogeor/strapi-plugin-oidc/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"/>
    </a>
    <a href="https://github.com/fallow-rs/fallow">
      <img src="https://raw.githubusercontent.com/edmogeor/strapi-plugin-oidc/badges/badge.svg" alt="fallow health"/>
    </a>
    <a href="./LICENSE">
      <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"/>
    </a>
  </p>
</div>

OIDC authentication for the Strapi Admin Panel. Works with Keycloak, Auth0, Okta, Azure AD, Authentik, Authelia, and any other OpenID Connect provider.

<!-- toc -->

- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Configuration](#configuration)
  - [Client assertion](#client-assertion)
  - [Security features](#security-features)
  - [Client IP attribution and reverse proxies](#client-ip-attribution-and-reverse-proxies)
- [Usage](#usage)
  - [Login](#login)
  - [Logout](#logout)
- [Admin Settings](#admin-settings)
- [Group-to-Role Mapping](#group-to-role-mapping)
  - [Example configuration](#example-configuration)
  - [Role assignment precedence](#role-assignment-precedence)
  - [Role updates on subsequent logins](#role-updates-on-subsequent-logins)
- [REST API](#rest-api)
- [Credits](#credits)
- [Donations](#donations)
- [License](#license)

<!-- tocstop -->

## Features

- OIDC sign-in for the Strapi Admin Panel using Authorization Code flow with PKCE
- Works with any OIDC provider, including Keycloak, Auth0, Okta, Azure AD, Authentik, and Authelia
- Configurable **Login via SSO** button with custom text
- **Enforce OIDC** mode to remove email/password login and block local-login API calls
- **Skip Login Page** to redirect unauthenticated users straight to the IdP
- **Default OIDC roles** assigned to new users on first login
- Email **whitelist** with optional per-entry role overrides, JSON import/export, and a REST API
- **Group-to-role mapping** based on a configurable OIDC claim
- **Audit log** of authentication events with admin UI filtering, NDJSON export, and a REST API
- Configurable audit-log retention and **Remember Me** sessions
- **RP-initiated logout** and **backchannel logout** support
- Optional private-key JWT **client assertion** for token-endpoint authentication
- Optional **email verification** requirement before login is allowed
- Secure, httpOnly, `__Host-` prefixed cookies with PKCE state and nonce

## Quick Start

Add the plugin to `config/plugins.js` (or `.ts`) with the four required values:

```javascript
module.exports = ({ env }) => ({
  'strapi-plugin-oidc': {
    enabled: true,
    config: {
      OIDC_PUBLIC_URL: env('PUBLIC_URL', 'https://strapi.example.com'), // origin only -- we append /strapi-plugin-oidc/oidc/callback
      OIDC_ISSUER: env('OIDC_ISSUER'),
      OIDC_CLIENT_ID: env('OIDC_CLIENT_ID'),
      OIDC_CLIENT_SECRET: env('OIDC_CLIENT_SECRET'),
    },
  },
});
```

Then restart Strapi, go to **Settings → OIDC Plugin**, choose the default roles, and click **Save**.

## Installation

```bash
npm install strapi-plugin-oidc
```

## Configuration

All options can be set in `config/plugins.js` or via environment variables. Optional values use the defaults shown below.

| Option                        | Required                           | Default                | Description                                                                 |
| ----------------------------- | ---------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| `OIDC_PUBLIC_URL`             | Yes, if `PUBLIC_URL` is not set    | `''`                   | Strapi origin (scheme + host + port, no path or trailing slash)             |
| `OIDC_ISSUER`                 | Yes                                | `''`                   | Provider issuer URL, e.g. `https://auth.example.com/realms/myrealm`         |
| `OIDC_CLIENT_ID`              | Yes                                | `''`                   | Client ID registered with the provider                                      |
| `OIDC_CLIENT_SECRET`          | Yes, unless using client assertion | `''`                   | Client secret                                                               |
| `OIDC_CLIENT_ASSERTION`       | No                                 | `''`                   | Private-key JWT for token-endpoint auth (replaces `client_secret`)          |
| `OIDC_SCOPE`                  | No                                 | `openid profile email` | Space-separated OIDC scopes                                                 |
| `OIDC_FAMILY_NAME_FIELD`      | No                                 | `family_name`          | Claim field used for the user's family name                                 |
| `OIDC_GIVEN_NAME_FIELD`       | No                                 | `given_name`           | Claim field used for the user's given name                                  |
| `OIDC_SSO_BUTTON_TEXT`        | No                                 | `Login via SSO`        | Text shown on the SSO button                                                |
| `OIDC_ENFORCE`                | No                                 | `null`                 | `null` = use Admin UI toggle; `true`/`false` = config override              |
| `OIDC_SKIP_LOGIN_PAGE`        | No                                 | `null`                 | `null` = use Admin UI toggle; `true`/`false` = config override              |
| `REMEMBER_ME`                 | No                                 | `false`                | Persist admin sessions across browser restarts                              |
| `AUDIT_LOG_RETENTION_DAYS`    | No                                 | `90`                   | Days to keep audit logs; set `0` to disable                                 |
| `OIDC_GROUP_FIELD`            | No                                 | `groups`               | Claim field containing group membership                                     |
| `OIDC_GROUP_ROLE_MAP`         | No                                 | `{}`                   | JSON map of group names to arrays of Strapi role names                      |
| `OIDC_REQUIRE_EMAIL_VERIFIED` | No                                 | `true`                 | Reject logins unless the provider reports `email_verified=true`             |
| `OIDC_TRUSTED_IP_HEADER`      | No                                 | `''`                   | Trusted proxy header containing the real client IP (see reverse-proxy note) |
| `OIDC_FORCE_SECURE_COOKIES`   | No                                 | `false`                | Force the `Secure` cookie flag (only use behind HTTPS)                      |
| `OIDC_MAX_AGE`                | No                                 | `undefined`            | `max_age` sent to the IdP, in seconds                                       |
| `OIDC_PROMPT`                 | No                                 | `''`                   | `prompt` sent to the IdP, e.g. `login` or `consent`                         |

`OIDC_PUBLIC_URL` is your Strapi instance's origin, e.g. `https://myapp.com`. The plugin appends `/strapi-plugin-oidc/oidc/callback` to build the full redirect URI.

`OIDC_ISSUER` is the provider's issuer URL. The plugin uses it for OIDC discovery via `openid-client`, which is the single source of truth for all endpoints, the JWKS URI, and the canonical issuer. Discovery is lazy; it runs on the first sign-in request and is cached for 15 minutes, so Strapi boots even if the IdP is temporarily unreachable.

> **Note:** The explicit endpoint overrides (`OIDC_AUTHORIZATION_ENDPOINT`, `OIDC_TOKEN_ENDPOINT`, `OIDC_USERINFO_ENDPOINT`, `OIDC_END_SESSION_ENDPOINT`, `OIDC_JWKS_URI`) were removed in this version. If you previously configured them, delete those keys and rely on `OIDC_ISSUER` plus discovery.

### Client assertion

Instead of a static `client_secret`, you can authenticate to the IdP token endpoint with a private-key JWT. Set **either** `OIDC_CLIENT_SECRET` or `OIDC_CLIENT_ASSERTION`, not both.

```javascript
module.exports = ({ env }) => ({
  'strapi-plugin-oidc': {
    enabled: true,
    config: {
      // ... other required OIDC config ...
      OIDC_CLIENT_SECRET: '', // leave empty when using an assertion
      OIDC_CLIENT_ASSERTION: env('OIDC_CLIENT_ASSERTION'), // JSON string or object
    },
  },
});
```

`OIDC_CLIENT_ASSERTION` accepts either a JSON string or an object with the following shape:

| Field        | Required | Default | Description                                                 |
| ------------ | -------- | ------- | ----------------------------------------------------------- |
| `privateKey` | Yes      | -       | PKCS#8 private key in PEM format                            |
| `keyId`      | No       | -       | Key ID (`kid`) to include in the JWT header                 |
| `algorithm`  | No       | `RS256` | Signing algorithm (must match the key type the IdP expects) |

### Security features

- **OIDC protocol layer**: Built on [`openid-client`](https://github.com/panva/openid-client) v6, which handles discovery, PKCE, token exchange, ID-token verification, userinfo, and RP-initiated logout
- **ID token verification**: Enabled automatically when the discovery document includes a `jwks_uri`. Validates signature, issuer, audience, and expiry
- **Email verification**: `OIDC_REQUIRE_EMAIL_VERIFIED: true` (default) rejects unverified emails
- **CSRF protection**: OIDC state/nonce and POST-only logout endpoint
- **Rate limiting**: 1 000 req/min per IP+UA on sign-in/callback/logout routes (in-process; add a reverse-proxy limiter for multi-node). Backchannel logout is limited to 30 req/min per IP
- **Secure cookies**: `OIDC_FORCE_SECURE_COOKIES` forces the `Secure` flag. Only enable this on HTTPS origins; on HTTP origins the browser rejects `__Host-` prefixed cookies and OIDC login will fail silently
- **Backchannel logout**: Receives signed `logout_token` POSTs from the IdP and invalidates the matching admin session

### Client IP attribution and reverse proxies

The plugin logs client IPs for rate-limit buckets and audit logs. When Strapi runs behind a reverse proxy, enable Koa proxy mode so Strapi trusts `X-Forwarded-For`; otherwise all IPs will be the proxy's internal address.

In `config/server.ts`:

```ts
proxy: {
  koa: true,
},
```

Set `OIDC_TRUSTED_IP_HEADER` to the header your CDN or proxy uses to forward the real client IP. The header is only honoured when Koa proxy mode is enabled. Accepted values (all others are silently ignored):

| Header                      | Provider                                          |
| --------------------------- | ------------------------------------------------- |
| `cf-connecting-ip`          | Cloudflare                                        |
| `true-client-ip`            | Cloudflare Enterprise, Akamai                     |
| `fastly-client-ip`          | Fastly                                            |
| `fly-client-ip`             | Fly.io                                            |
| `x-nf-client-connection-ip` | Netlify                                           |
| `x-real-ip`                 | nginx (`proxy_set_header X-Real-IP $remote_addr`) |

Only headers that CDN/proxy vendors guarantee to strip from inbound client requests are accepted, preventing IP spoofing via forged headers.

## Usage

### Login

Navigate to `/strapi-plugin-oidc/oidc` to start the OIDC flow, or click the **Login via SSO** button injected into the Strapi login page.

### Logout

#### RP-initiated logout

When the discovery document includes an `end_session_endpoint`, clicking logout redirects to the provider's end-session URL (RP-initiated logout). If the provider session has already expired, Strapi skips the redirect and goes straight to the login page.

The logout endpoint is `POST /strapi-plugin-oidc/logout`. Using POST instead of GET prevents CSRF-forced-logout attacks.

#### Backchannel logout

If your IdP supports OpenID Connect Back-Channel Logout, register `https://<your-strapi>/strapi-plugin-oidc/backchannel-logout` as the backchannel logout URL.

The endpoint accepts `POST` requests carrying a signed `logout_token`. The plugin verifies the token against the IdP JWKS and requires:

- a valid `events` claim containing `http://schemas.openid.net/event/backchannel-logout`
- no `nonce` claim
- a `sub` and/or `sid` claim that matches a Strapi admin user

When a match is found, the user's refresh tokens are invalidated. Invalid or unmatched tokens still receive HTTP 200 to avoid leaking information. The endpoint is rate-limited to 30 requests per minute per IP.

## Admin Settings

Manage the plugin under **Settings → OIDC Plugin**.

**Default Roles**: Strapi admin role(s) assigned to new users on first login.

**Whitelist**: Restrict access to specific email addresses. When empty, any authenticated OIDC user gets an account. Supports:

- Individual emails with optional role overrides
- JSON import / export
- Bulk delete with confirmation

**Audit Logs**: Authentication events recorded and visible in the settings page. Filter by action, email, IP, and date. **Download** exports the current view as NDJSON. Set `AUDIT_LOG_RETENTION_DAYS` to `0` to disable. Records older than the configured value (default: 90 days) are purged daily. Admin routes require the plugin's `read`/`update` permissions.

**Enforce OIDC Login**: Removes email/password fields from the login page and blocks direct login API calls. Automatically disabled when the whitelist is empty to prevent lockout. The toggle is grayed out when `OIDC_ENFORCE` is set in config. **Lockout recovery**: set `OIDC_ENFORCE: false` in your plugin config and restart Strapi.

**Skip Login Page**: Redirects unauthenticated users straight to the OIDC provider without showing the Strapi login page. Toggle under **Settings → Login Settings**. The toggle is grayed out when `OIDC_SKIP_LOGIN_PAGE` is set in config. Set `OIDC_SKIP_LOGIN_PAGE: false` in your plugin config to disable and restart Strapi.

## Group-to-Role Mapping

When your OIDC provider includes group membership in the userinfo response (e.g. a `groups` claim containing `["strapi-admins", "strapi-editors"]`), you can automatically assign Strapi roles based on group membership.

| Setting               | Default    | Description                                               |
| --------------------- | ---------- | --------------------------------------------------------- |
| `OIDC_GROUP_FIELD`    | `'groups'` | OIDC claim field that contains the group membership array |
| `OIDC_GROUP_ROLE_MAP` | `'{}'`     | JSON map of group names to Strapi role names              |

### Example configuration

```javascript
module.exports = ({ env }) => ({
  'strapi-plugin-oidc': {
    enabled: true,
    config: {
      // ... other OIDC config ...
      OIDC_GROUP_FIELD: 'groups',
      OIDC_GROUP_ROLE_MAP: JSON.stringify({
        'strapi-admins': ['Super Admin'],
        'strapi-editors': ['Editor'],
        'strapi-authors': ['Editor', 'Author'],
      }),
    },
  },
});
```

Role names are the **display names** shown in **Settings → Roles** (e.g. `"Editor"`, `"Super Admin"`, `"Author"`). IDs are not supported, use names for clarity.

### Role assignment precedence

1. **OIDC groups match `OIDC_GROUP_ROLE_MAP`** → mapped Strapi roles
2. **No match or no mapping** → default OIDC roles (new users only)

### Role updates on subsequent logins

- **New users**: Roles assigned on first login (group-mapped or default).
- **Existing users with group match**: Roles updated to reflect current mapping.
- **Existing users without group match**: Roles left unchanged. Manually-assigned roles are never overwritten.

## REST API

The whitelist and audit log can be managed programmatically with Strapi API tokens. See the [REST API reference](docs/api.md) for endpoint details, required scopes, query parameters, and examples.

## Credits

This plugin began as a fork of [`strapi-plugin-sso`](https://github.com/yasudacloud/strapi-plugin-sso) by **yasudacloud**. Since then, the OIDC implementation has been rewritten on top of [`openid-client`](https://github.com/panva/openid-client), and the codebase has diverged significantly from the original. Huge thanks to yasudacloud for creating the original foundation of this plugin!

## Donations

Feel free to donate if you'd like to support the development of this plugin.

<a href="https://www.buymeacoffee.com/edmogeor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

## License

[MIT](./LICENSE)
