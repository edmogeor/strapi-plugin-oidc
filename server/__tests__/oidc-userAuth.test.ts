import { describe, it, expect } from 'vitest';
import { collectGroupMapRoleNames, rolesChanged } from '../controllers/oidc/userAuth';
import type { PluginConfig, OidcUserInfo } from '../types';

function makeConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    OIDC_GROUP_FIELD: 'groups',
    OIDC_GROUP_ROLE_MAP: {},
    ...overrides,
  } as PluginConfig;
}

describe('collectGroupMapRoleNames', () => {
  it('returns [] when user has no groups', () => {
    const config = makeConfig({ OIDC_GROUP_ROLE_MAP: { admins: ['Admin'] } });
    expect(collectGroupMapRoleNames({} as OidcUserInfo, config)).toEqual([]);
  });

  it('returns [] when groups claim is not an array', () => {
    const config = makeConfig({ OIDC_GROUP_ROLE_MAP: { admins: ['Admin'] } });
    expect(
      collectGroupMapRoleNames({ groups: 'admins' } as unknown as OidcUserInfo, config),
    ).toEqual([]);
  });

  it('filters out non-string group entries', () => {
    const config = makeConfig({ OIDC_GROUP_ROLE_MAP: { admins: ['Admin'] } });
    const userInfo = { groups: ['admins', 42, null] } as unknown as OidcUserInfo;
    expect(collectGroupMapRoleNames(userInfo, config)).toEqual(['Admin']);
  });

  it('maps multiple groups to their role names', () => {
    const config = makeConfig({
      OIDC_GROUP_ROLE_MAP: { admins: ['Admin'], editors: ['Editor'] },
    });
    const userInfo = { groups: ['admins', 'editors'] } as OidcUserInfo;
    expect(collectGroupMapRoleNames(userInfo, config).sort()).toEqual(['Admin', 'Editor']);
  });

  it('deduplicates role names across groups', () => {
    const config = makeConfig({
      OIDC_GROUP_ROLE_MAP: { a: ['Editor'], b: ['Editor', 'Author'] },
    });
    const userInfo = { groups: ['a', 'b'] } as OidcUserInfo;
    expect(collectGroupMapRoleNames(userInfo, config).sort()).toEqual(['Author', 'Editor']);
  });

  it('parses OIDC_GROUP_ROLE_MAP when provided as a JSON string', () => {
    const config = makeConfig({
      OIDC_GROUP_ROLE_MAP: '{"admins":["Admin"]}' as unknown as Record<string, string[]>,
    });
    const userInfo = { groups: ['admins'] } as OidcUserInfo;
    expect(collectGroupMapRoleNames(userInfo, config)).toEqual(['Admin']);
  });

  it('returns [] when OIDC_GROUP_ROLE_MAP JSON is invalid', () => {
    const config = makeConfig({
      OIDC_GROUP_ROLE_MAP: 'not-json{' as unknown as Record<string, string[]>,
    });
    const userInfo = { groups: ['admins'] } as OidcUserInfo;
    expect(collectGroupMapRoleNames(userInfo, config)).toEqual([]);
  });

  it('ignores groups with no mapping entry', () => {
    const config = makeConfig({ OIDC_GROUP_ROLE_MAP: { admins: ['Admin'] } });
    const userInfo = { groups: ['admins', 'random'] } as OidcUserInfo;
    expect(collectGroupMapRoleNames(userInfo, config)).toEqual(['Admin']);
  });
});

describe('rolesChanged', () => {
  it('returns false for identical sets', () => {
    expect(rolesChanged(new Set(['1', '2']), new Set(['1', '2']))).toBe(false);
  });

  it('returns false when order differs but contents match', () => {
    expect(rolesChanged(new Set(['2', '1']), new Set(['1', '2']))).toBe(false);
  });

  it('returns true when sizes differ', () => {
    expect(rolesChanged(new Set(['1']), new Set(['1', '2']))).toBe(true);
    expect(rolesChanged(new Set(['1', '2']), new Set(['1']))).toBe(true);
  });

  it('returns true when sizes match but contents differ', () => {
    expect(rolesChanged(new Set(['1', '2']), new Set(['1', '3']))).toBe(true);
  });

  it('returns false for two empty sets', () => {
    expect(rolesChanged(new Set(), new Set())).toBe(false);
  });
});
