# ADR 0001: Remove explicit OIDC endpoint config overrides

## Status

Accepted

## Context

The plugin historically required users to configure OIDC endpoints explicitly:

```
OIDC_AUTHORIZATION_ENDPOINT
OIDC_TOKEN_ENDPOINT
OIDC_USERINFO_ENDPOINT
OIDC_END_SESSION_ENDPOINT
OIDC_JWKS_URI
```

At bootstrap, the plugin would fetch the OIDC discovery document from
`OIDC_ISSUER + "/.well-known/openid-configuration"` and fill in any missing
values. Explicit config took precedence over discovery.

With the migration to `openid-client` v6, the library handles discovery
entirely — `client.discovery(issuer, clientId, clientSecret)` fetches the
discovery document and returns a fully-configured `Configuration` object. The
library then uses this configuration internally for all OIDC operations
(authorization URL construction, token exchange, userinfo fetch, logout).

Supporting explicit endpoint overrides would require:

1. Five extra fields in the Zod schema
2. A merge function preferring explicit over discovered values
3. Patching the `openid-client` `Configuration` object post-creation
4. Tests for every override combination
5. Documentation explaining which endpoint to configure vs. let discovery handle

## Decision

Remove all five endpoint config keys. The single source of truth is
`OIDC_ISSUER` → discovery document → `Configuration`.

Users who need different endpoints (e.g. separate internal/external URLs behind
a split-horizon DNS) must fix their IdP discovery document.

## Consequences

- **Configuration surface shrinks** from 11 OIDC-specific keys to 6 (issuer,
  client ID, client secret, scope, family name field, given name field)
- **No override escape hatch** — broken discovery documents block login
- **Test fixtures simplify** — MOCK_OIDC_CONFIG no longer carries endpoint URLs
- **Upgrading users** must remove removed keys from their `config/plugins.js`,
  otherwise Zod validation will warn (extra keys are ignored by `.passthrough()`
  default in Zod 3, but they are dead weight)
