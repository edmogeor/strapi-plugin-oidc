import { describe, it, expect } from 'vitest';
import { reducer, initialState } from './reducer';

describe('useOidcSettings reducer', () => {
  describe('hydrate', () => {
    it('hydrates roles', () => {
      const roles = [{ id: 1, name: 'Admin' }] as never;
      const next = reducer(initialState, { type: 'hydrate/roles', roles });
      expect(next.roles).toBe(roles);
    });

    it('hydrates oidcRoles into both current and initial', () => {
      const oidcRoles = [{ oauth_type: 'google', role: ['1'] }] as never;
      const next = reducer(initialState, { type: 'hydrate/oidcRoles', oidcRoles });
      expect(next.current.oidcRoles).toEqual(oidcRoles);
      expect(next.initial.oidcRoles).toEqual(oidcRoles);
    });

    it('hydrates whitelist snapshot into current and clones into initial', () => {
      const next = reducer(initialState, {
        type: 'hydrate/whitelist',
        snapshot: {
          users: [{ email: 'a@b.com', createdAt: '2026-04-22' }],
          useWhitelist: true,
          enforceOIDC: true,
        },
        enforceOIDCConfig: true,
        auditLogEnabled: false,
      });
      expect(next.current.users).toHaveLength(1);
      expect(next.enforceOIDCConfig).toBe(true);
      expect(next.auditLogEnabled).toBe(false);
      // initial must be a deep clone, not the same reference
      expect(next.initial).not.toBe(next.current);
      expect(next.initial.users).not.toBe(next.current.users);
    });
  });

  describe('whitelist actions', () => {
    it('patches an oidc role', () => {
      const withRoles = reducer(initialState, {
        type: 'hydrate/oidcRoles',
        oidcRoles: [{ oauth_type: 'google', role: ['1'] }] as never,
      });
      const next = reducer(withRoles, {
        type: 'patch/oidcRole',
        oidcId: 'google',
        values: ['2', '3'],
      });
      expect(next.current.oidcRoles[0].role).toEqual(['2', '3']);
    });

    it('adds a user with an ISO createdAt', () => {
      const next = reducer(initialState, { type: 'user/add', email: 'a@b.com' });
      expect(next.current.users).toHaveLength(1);
      expect(next.current.users[0].email).toBe('a@b.com');
      expect(next.current.users[0].createdAt).toMatch(/T.*Z$/);
    });

    it('deletes a user by email', () => {
      const seed = {
        ...initialState,
        current: {
          ...initialState.current,
          users: [
            { email: 'a@b.com', createdAt: '' },
            { email: 'c@d.com', createdAt: '' },
          ],
        },
      };
      const next = reducer(seed, { type: 'user/delete', email: 'a@b.com' });
      expect(next.current.users.map((u) => u.email)).toEqual(['c@d.com']);
    });

    it('clears all users', () => {
      const seed = {
        ...initialState,
        current: {
          ...initialState.current,
          users: [{ email: 'a@b.com', createdAt: '' }],
        },
      };
      const next = reducer(seed, { type: 'users/clear' });
      expect(next.current.users).toEqual([]);
    });

    it('replaces the users array', () => {
      const users = [{ email: 'x@y.com', createdAt: '' }];
      const next = reducer(initialState, { type: 'users/replace', users });
      expect(next.current.users).toBe(users);
    });

    it('disables enforceOIDC when whitelist is on with no users after toggling', () => {
      const seed = {
        ...initialState,
        current: { ...initialState.current, enforceOIDC: true },
      };
      const next = reducer(seed, { type: 'toggle/useWhitelist', value: true });
      expect(next.current.useWhitelist).toBe(true);
      expect(next.current.enforceOIDC).toBe(false);
    });

    it('preserves enforceOIDC when whitelist is on and has users', () => {
      const seed = {
        ...initialState,
        current: {
          ...initialState.current,
          enforceOIDC: true,
          users: [{ email: 'a@b.com', createdAt: '' }],
        },
      };
      const next = reducer(seed, { type: 'toggle/useWhitelist', value: true });
      expect(next.current.enforceOIDC).toBe(true);
    });

    it('disables enforceOIDC when last user is deleted with whitelist on', () => {
      const seed = {
        ...initialState,
        current: {
          ...initialState.current,
          useWhitelist: true,
          enforceOIDC: true,
          users: [{ email: 'a@b.com', createdAt: '' }],
        },
      };
      const next = reducer(seed, { type: 'user/delete', email: 'a@b.com' });
      expect(next.current.enforceOIDC).toBe(false);
    });
  });

  describe('commit', () => {
    it('copies current to initial (deep clone) without snapshot arg', () => {
      const seed = {
        ...initialState,
        current: {
          ...initialState.current,
          users: [{ email: 'a@b.com', createdAt: '' }],
        },
      };
      const next = reducer(seed, { type: 'commit' });
      expect(next.initial.users).toEqual(seed.current.users);
      expect(next.initial.users).not.toBe(seed.current.users);
    });

    it('merges snapshot patch into initial', () => {
      const next = reducer(initialState, {
        type: 'commit',
        snapshot: { useWhitelist: true },
      });
      expect(next.initial.useWhitelist).toBe(true);
    });
  });

  describe('flash and loading', () => {
    it('sets loading', () => {
      expect(reducer(initialState, { type: 'loading', value: true }).loading).toBe(true);
    });

    it('flashes success on and off', () => {
      const on = reducer(initialState, { type: 'flash/success' });
      expect(on.showSuccess).toBe(true);
      const off = reducer(on, { type: 'flash/clear', kind: 'success' });
      expect(off.showSuccess).toBe(false);
    });

    it('flash/clear success does not affect showError', () => {
      const seed = { ...initialState, showError: true, showSuccess: true };
      const next = reducer(seed, { type: 'flash/clear', kind: 'success' });
      expect(next.showSuccess).toBe(false);
      expect(next.showError).toBe(true);
    });
  });

  it('returns the same state for unknown actions', () => {
    const result = reducer(initialState, { type: 'nope' } as never);
    expect(result).toBe(initialState);
  });
});
