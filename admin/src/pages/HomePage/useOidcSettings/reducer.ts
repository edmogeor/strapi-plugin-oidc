import { OIDCRole, RoleDef } from '../../../components/Role';
import { WhitelistUser } from '../../../components/Whitelist';

type SettingsSnapshot = {
  oidcRoles: OIDCRole[];
  users: WhitelistUser[];
  useWhitelist: boolean;
  enforceOIDC: boolean;
};

type State = {
  current: SettingsSnapshot;
  initial: SettingsSnapshot;
  roles: RoleDef[];
  enforceOIDCConfig: boolean | null;
  auditLogEnabled: boolean;
  loading: boolean;
  showSuccess: boolean;
  showError: boolean;
};

type Action =
  | { type: 'hydrate/roles'; roles: RoleDef[] }
  | { type: 'hydrate/oidcRoles'; oidcRoles: OIDCRole[] }
  | {
      type: 'hydrate/whitelist';
      snapshot: Partial<SettingsSnapshot>;
      enforceOIDCConfig: boolean | null;
      auditLogEnabled: boolean;
    }
  | { type: 'patch/oidcRole'; oidcId: string; values: string[] }
  | { type: 'user/add'; email: string }
  | { type: 'user/delete'; email: string }
  | { type: 'users/clear' }
  | { type: 'users/replace'; users: WhitelistUser[] }
  | { type: 'toggle/useWhitelist'; value: boolean }
  | { type: 'toggle/enforceOIDC'; value: boolean }
  | { type: 'commit'; snapshot?: Partial<SettingsSnapshot> }
  | { type: 'loading'; value: boolean }
  | { type: 'flash/success' }
  | { type: 'flash/error' }
  | { type: 'flash/clear'; kind: 'success' | 'error' };

export const initialState: State = {
  current: {
    oidcRoles: [],
    users: [],
    useWhitelist: false,
    enforceOIDC: false,
  },
  initial: {
    oidcRoles: [],
    users: [],
    useWhitelist: false,
    enforceOIDC: false,
  },
  roles: [],
  enforceOIDCConfig: null,
  auditLogEnabled: true,
  loading: false,
  showSuccess: false,
  showError: false,
};

function withEnforceGuard(current: SettingsSnapshot): SettingsSnapshot {
  if (current.useWhitelist && current.users.length === 0 && current.enforceOIDC) {
    return { ...current, enforceOIDC: false };
  }
  return current;
}

function reduceHydrate(state: State, action: Action): State | null {
  switch (action.type) {
    case 'hydrate/roles':
      return { ...state, roles: action.roles };
    case 'hydrate/oidcRoles': {
      const snapshot = { oidcRoles: action.oidcRoles };
      return {
        ...state,
        current: { ...state.current, ...snapshot },
        initial: { ...state.initial, ...snapshot },
      };
    }
    case 'hydrate/whitelist': {
      const snapshot: SettingsSnapshot = {
        oidcRoles: action.snapshot.oidcRoles ?? state.current.oidcRoles,
        users: action.snapshot.users ?? state.current.users,
        useWhitelist: action.snapshot.useWhitelist ?? state.current.useWhitelist,
        enforceOIDC: action.snapshot.enforceOIDC ?? state.current.enforceOIDC,
      };
      return {
        ...state,
        current: snapshot,
        initial: structuredClone(snapshot),
        enforceOIDCConfig: action.enforceOIDCConfig,
        auditLogEnabled: action.auditLogEnabled,
      };
    }
    case 'commit':
      return {
        ...state,
        initial: structuredClone(
          action.snapshot ? { ...state.current, ...action.snapshot } : state.current,
        ),
      };
    default:
      return null;
  }
}

function reduceWhitelist(state: State, action: Action): State | null {
  switch (action.type) {
    case 'patch/oidcRole':
      return {
        ...state,
        current: {
          ...state.current,
          oidcRoles: state.current.oidcRoles.map((role) =>
            role.oauth_type === action.oidcId ? { ...role, role: action.values } : role,
          ),
        },
      };
    case 'user/add':
      return {
        ...state,
        current: {
          ...state.current,
          users: [
            ...state.current.users,
            { email: action.email, createdAt: new Date().toISOString() },
          ],
        },
      };
    case 'user/delete':
      return {
        ...state,
        current: withEnforceGuard({
          ...state.current,
          users: state.current.users.filter((u) => u.email !== action.email),
        }),
      };
    case 'users/clear':
      return { ...state, current: withEnforceGuard({ ...state.current, users: [] }) };
    case 'users/replace':
      return { ...state, current: { ...state.current, users: action.users } };
    case 'toggle/useWhitelist':
      return {
        ...state,
        current: withEnforceGuard({ ...state.current, useWhitelist: action.value }),
      };
    case 'toggle/enforceOIDC':
      return { ...state, current: { ...state.current, enforceOIDC: action.value } };
    default:
      return null;
  }
}

function reduceFlash(state: State, action: Action): State | null {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: action.value };
    case 'flash/success':
      return { ...state, showSuccess: true };
    case 'flash/error':
      return { ...state, showError: true };
    case 'flash/clear':
      return {
        ...state,
        showSuccess: action.kind === 'success' ? false : state.showSuccess,
        showError: action.kind === 'error' ? false : state.showError,
      };
    default:
      return null;
  }
}

export function reducer(state: State, action: Action): State {
  return (
    reduceHydrate(state, action) ??
    reduceWhitelist(state, action) ??
    reduceFlash(state, action) ??
    state
  );
}
