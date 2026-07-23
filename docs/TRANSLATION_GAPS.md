# Translation Gaps

New audit detail translation keys were added to `translations/locales/en.json` as part
of the OIDC-client review implementation. These keys need to be translated into all other
locales.

## New Keys (English)

| Key                        | English Value                                   |
| -------------------------- | ----------------------------------------------- |
| `audit.login_success`      | `User successfully authenticated.`              |
| `audit.logout`             | `User logged out.`                              |
| `audit.missing_code`       | `No authorisation code received from provider.` |
| `audit.state_mismatch`     | `State parameter mismatch.`                     |
| `audit.whitelist_rejected` | `Email {email} not in whitelist.`               |
| `audit.email_not_verified` | `Email {email} not verified by provider.`       |

## Keys with Interpolation Parameters

| Key                        | Parameters |
| -------------------------- | ---------- |
| `audit.whitelist_rejected` | `{email}`  |
| `audit.email_not_verified` | `{email}`  |

## Locales Needing Updates

All non-English locale files under `translations/locales/`:

- `ar.json`, `cs.json`, `de.json`, `dk.json`, `es.json`, `fr.json`
- `he.json`, `id.json`, `it.json`, `ja.json`, `ko.json`, `ms.json`
- `nl.json`, `no.json`, `pl.json`, `pt.json`, `pt-BR.json`
- `ru.json`, `sk.json`, `sv.json`, `th.json`, `tr.json`
- `uk.json`, `vi.json`, `zh.json`, `zh-Hans.json`

## Existing audit keys (for reference)

These keys already existed in each locale and may serve as context for the new translations:

- `audit.login_failure`
- `audit.roles_updated`
- `audit.user_created`
- `audit.backchannel_logout`
- `audit.backchannel_logout_config_error`
- `audit.backchannel_logout_unknown_sub`

## Context

These keys are used in the **Details** column of the audit log table in the Strapi admin
panel. The `{email}` parameter receives the user's email address. The `{message}` parameter
(in `audit.login_failure`, already translated) receives the error message.
