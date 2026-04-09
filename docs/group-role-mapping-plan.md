# Plan: OIDC Group-to-Role Mapping

## Context

Users authenticating via OIDC can carry group membership claims in their userinfo response (e.g., `groups: ["strapi-admins", "strapi-editors"]`). Currently the plugin ignores these claims entirely — new users always get either their whitelist roles or the global default OIDC roles.

The goal is to let admins configure a `OIDC_GROUP_ROLE_MAP` in the plugin config so that group membership automatically determines which Strapi roles a new user receives. Existing users are never touched (their Strapi roles take precedence). When a whitelisted user has no explicit roles and matches a group, the whitelist entry is updated to reflect the group-derived roles for accuracy.

---

## Role Assignment Precedence (new users only)

1. Whitelist entry has explicit roles → use whitelist roles _(unchanged)_
2. Whitelist entry has no roles AND user matches a group → use group-mapped roles + update whitelist entry _(new)_
3. No whitelist roles and no group match → fall back to default OIDC roles _(unchanged)_

Existing users: no role changes on login _(unchanged)_

---

## Files to Modify

### 1. `server/types.ts`

Add two new interfaces. `OIDC_GROUP_ROLE_MAP` is stored as a JSON string so it can be set via an environment variable:

```typescript
/**
 * Parsed shape of the OIDC_GROUP_ROLE_MAP JSON string.
 * Values are Strapi role names (e.g. "Editor", "Super Admin"), not IDs.
 */
export interface GroupRoleMap {
  [groupName: string]: string[];
}

export interface PluginConfig {
  REMEMBER_ME: boolean;
  OIDC_REDIRECT_URI: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
  OIDC_SCOPE: string;
  OIDC_AUTHORIZATION_ENDPOINT: string;
  OIDC_TOKEN_ENDPOINT: string;
  OIDC_USERINFO_ENDPOINT: string;
  OIDC_GRANT_TYPE: string;
  OIDC_FAMILY_NAME_FIELD: string;
  OIDC_GIVEN_NAME_FIELD: string;
  OIDC_END_SESSION_ENDPOINT: string;
  OIDC_SSO_BUTTON_TEXT: string;
  OIDC_ENFORCE: boolean | null;
  AUDIT_LOG_RETENTION_DAYS: number;
  OIDC_GROUP_FIELD: string;
  /** JSON-encoded GroupRoleMap, e.g. '{"admins":["1"],"editors":["2"]}' */
  OIDC_GROUP_ROLE_MAP: string;
}
```

Extend `WhitelistService`:

```typescript
updateWhitelistRoles(id: number, roles: string[]): Promise<void>;
```

### 2. `server/config/index.ts`

Add two defaults to the `default` object:

```typescript
OIDC_GROUP_FIELD: 'groups',
OIDC_GROUP_ROLE_MAP: '{}',
```

### 3. `server/services/whitelist.ts`

Add one method (using same `getWhitelistQuery()` pattern as other methods):

```typescript
async updateWhitelistRoles(id: number, roles: string[]): Promise<void> {
  await getWhitelistQuery().update({ where: { id }, data: { roles } });
},
```

### 4. `server/controllers/oidc.ts`

**4a** — Import `PluginConfig` and `GroupRoleMap` from `../types`.

**4b** — Update `configValidation()` return type from `Record<string, string>` to `PluginConfig`. Cast at call site: `strapi.config.get('plugin::strapi-plugin-oidc') as PluginConfig`.

Also update `logout()` local config variable for consistency.

**4c** — Update function signatures: `config: Record<string, string>` → `config: PluginConfig` in:

- `exchangeTokenAndFetchUserInfo`
- `registerNewUser`
- `handleUserAuthentication`

**4d** — Add private helper `resolveRolesFromGroups` before `registerNewUser`. It takes the already-fetched `availableRoles` to stay pure/synchronous:

```typescript
function resolveRolesFromGroups(
  userInfo: OidcUserInfo,
  config: PluginConfig,
  availableRoles: AdminRole[],
): string[] {
  const rawGroups = userInfo[config.OIDC_GROUP_FIELD];
  if (!Array.isArray(rawGroups) || rawGroups.length === 0) return [];
  const groups = rawGroups.filter((g): g is string => typeof g === 'string');

  let groupRoleMap: GroupRoleMap;
  try {
    groupRoleMap = JSON.parse(config.OIDC_GROUP_ROLE_MAP) as GroupRoleMap;
  } catch {
    return [];
  }

  const roleIds: string[] = [];
  for (const group of groups) {
    const roleNames = groupRoleMap[group];
    if (!roleNames) continue;
    for (const name of roleNames) {
      const match = availableRoles.find((r) => r.name === name);
      if (match && !roleIds.includes(String(match.id))) {
        roleIds.push(String(match.id));
      }
    }
  }
  return roleIds;
}
```

Role names (e.g. `"Editor"`, `"Super Admin"`) are matched against `AdminRole.name`. The resolved IDs are returned as strings, consistent with how whitelist entries and `createUser` consume roles.

**4e** — Add `whitelistService: WhitelistService` parameter to `registerNewUser`. Call `roleService.find()` once to get available roles, then pass to the helper:

```typescript
} else {
  const allRoles = await roleService.find();
  const groupRoles = resolveRolesFromGroups(userResponseData, config, allRoles);
  if (groupRoles.length > 0) {
    roles = groupRoles;
    if (whitelistUser) {
      await whitelistService.updateWhitelistRoles(whitelistUser.id, roles);
    }
  } else {
    const oidcRoles = await roleService.oidcRoles();
    roles = oidcRoles?.roles || [];
  }
}
```

`roleService.find()` is only called when the whitelist has no explicit roles, so there's no extra DB hit on the happy path.

Update the call site in `handleUserAuthentication` to pass `whitelistService` to `registerNewUser`.

### 5. `server/__tests__/e2e/oidc.e2e.test.ts`

Add a new `describe('Group-to-role mapping', ...)` block with these test cases (using `oidcServer.use(...)` MSW override pattern from the existing error-handling tests):

- **New user with matching group** → login succeeds, user created with group-mapped role
- **New user with non-matching group** → login succeeds, falls back to default roles (no error)
- **New user with no groups claim** → login succeeds, falls back to default roles (no error)
- **Whitelisted user with no roles + matching group** → login succeeds + whitelist entry updated with group roles
- **Existing user** → login succeeds with their existing Strapi roles unchanged

For tests that need to verify role assignment, query `strapi.db.query('admin::user').findOne({ where: { email }, populate: ['roles'] })` after login.

### 6. `README.md`

Add a new **"Group-to-Role Mapping"** section after the existing configuration table documenting:

- `OIDC_GROUP_FIELD` (default `'groups'`)
- `OIDC_GROUP_ROLE_MAP` (default `{}`)
- Example config with multiple group → role name mappings (e.g. `"Editor"`, `"Super Admin"`)
- Note that role names are the display names shown in **Settings → Roles**
- Precedence table (whitelist roles > group mapping > default roles)
- Note that existing users' roles are never changed

---

## Sequencing

1. `server/types.ts` — types first so other files compile cleanly
2. `server/config/index.ts` — defaults
3. `server/services/whitelist.ts` — implement `updateWhitelistRoles`
4. `server/controllers/oidc.ts` — type updates, helper, branching logic
5. `server/__tests__/e2e/oidc.e2e.test.ts` — tests
6. `README.md` — docs

---

## Verification

- Run `npx tsc --noEmit` to confirm zero type errors
- Run `npx vitest run` to confirm all existing and new tests pass
- Manually test with a real OIDC provider that emits a `groups` claim, or via the MSW mock in the e2e test suite
