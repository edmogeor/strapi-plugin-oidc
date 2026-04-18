import { useReducer, useEffect, useCallback, useMemo } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { OIDCRole, RoleDef } from '../../components/Role';
import { WhitelistUser } from '../../components/Whitelist';
import { downloadJson } from '../../utils/download';

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

const initialState: State = {
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

function reducer(state: State, action: Action): State {
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
      return {
        ...state,
        current: withEnforceGuard({ ...state.current, users: [] }),
      };

    case 'users/replace':
      return {
        ...state,
        current: { ...state.current, users: action.users },
      };

    case 'toggle/useWhitelist':
      return {
        ...state,
        current: withEnforceGuard({ ...state.current, useWhitelist: action.value }),
      };

    case 'toggle/enforceOIDC':
      return {
        ...state,
        current: { ...state.current, enforceOIDC: action.value },
      };

    case 'commit':
      return {
        ...state,
        initial: structuredClone(
          action.snapshot ? { ...state.current, ...action.snapshot } : state.current,
        ),
      };

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
      return state;
  }
}

function isDirtyPrimitive(a: boolean, b: boolean): boolean {
  return a !== b;
}

function isDirtyArray(a: unknown[], b: unknown[]): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function useOidcSettings() {
  const { get, put, post } = useFetchClient();
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    get(`/strapi-plugin-oidc/oidc-roles`).then((response) => {
      dispatch({ type: 'hydrate/oidcRoles', oidcRoles: response.data });
    });
    get(`/admin/roles`).then((response) => {
      dispatch({ type: 'hydrate/roles', roles: response.data.data });
    });
    get('/strapi-plugin-oidc/whitelist').then((response) => {
      const data = response.data;
      dispatch({
        type: 'hydrate/whitelist',
        snapshot: {
          users: data.whitelistUsers,
          useWhitelist: data.useWhitelist,
          enforceOIDC: data.enforceOIDC,
        },
        enforceOIDCConfig: data.enforceOIDCConfig ?? null,
        auditLogEnabled: (data.auditLogEnabled as boolean) ?? true,
      });
    });
  }, [get]);

  const onChangeRole = useCallback((values: string[], oidcId: string) => {
    dispatch({ type: 'patch/oidcRole', oidcId, values });
  }, []);

  const onRegisterWhitelist = useCallback((email: string) => {
    dispatch({ type: 'user/add', email });
  }, []);

  const onDeleteWhitelist = useCallback((email: string) => {
    dispatch({ type: 'user/delete', email });
  }, []);

  const onDeleteAll = useCallback(() => {
    dispatch({ type: 'users/clear' });
  }, []);

  const onImport = useCallback(
    async (emails: string[]): Promise<number> => {
      const response = await post('/strapi-plugin-oidc/whitelist/import', {
        users: emails.map((e) => ({ email: e })),
      });
      const refreshed = await get('/strapi-plugin-oidc/whitelist');
      dispatch({ type: 'users/replace', users: refreshed.data.whitelistUsers });
      dispatch({ type: 'commit' });
      return response.data.importedCount as number;
    },
    [post, get],
  );

  const onExport = useCallback(async () => {
    const response = await get('/strapi-plugin-oidc/whitelist/export');
    const data = response.data as Array<{ email: string }>;
    downloadJson('strapi-oidc-whitelist', data);
  }, [get]);

  const onToggleWhitelist = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'toggle/useWhitelist', value: e.target.checked });
  }, []);

  const onToggleEnforce = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'toggle/enforceOIDC', value: e.target.checked });
  }, []);

  const isDirty = useMemo(
    () =>
      isDirtyPrimitive(state.current.useWhitelist, state.initial.useWhitelist) ||
      isDirtyPrimitive(state.current.enforceOIDC, state.initial.enforceOIDC) ||
      isDirtyArray(state.current.oidcRoles, state.initial.oidcRoles) ||
      isDirtyArray(state.current.users, state.initial.users),
    [state.current, state.initial],
  );

  const onSaveAll = useCallback(async () => {
    dispatch({ type: 'loading', value: true });
    try {
      await Promise.all([
        put('/strapi-plugin-oidc/oidc-roles', {
          roles: state.current.oidcRoles.map((role) => ({
            oauth_type: role.oauth_type,
            role: role.role,
          })),
        }),
        put('/strapi-plugin-oidc/whitelist/sync', {
          users: state.current.users.map((u) => ({ email: u.email })),
        }),
        put('/strapi-plugin-oidc/whitelist/settings', {
          useWhitelist: state.current.useWhitelist,
          enforceOIDC: state.current.enforceOIDC,
        }),
      ]);

      dispatch({ type: 'commit' });

      const getResponse = await get('/strapi-plugin-oidc/whitelist');
      const data = getResponse.data;
      dispatch({
        type: 'hydrate/whitelist',
        snapshot: {
          users: data.whitelistUsers,
          useWhitelist: data.useWhitelist,
          enforceOIDC: data.enforceOIDC,
        },
        enforceOIDCConfig: data.enforceOIDCConfig ?? null,
        auditLogEnabled: (data.auditLogEnabled as boolean) ?? true,
      });

      dispatch({ type: 'flash/success' });
      setTimeout(() => dispatch({ type: 'flash/clear', kind: 'success' }), 3000);
    } catch (e) {
      console.error(e);
      dispatch({ type: 'flash/error' });
      setTimeout(() => dispatch({ type: 'flash/clear', kind: 'error' }), 3000);
    } finally {
      dispatch({ type: 'loading', value: false });
    }
  }, [put, get, state.current]);

  return {
    state: {
      loading: state.loading,
      showSuccess: state.showSuccess,
      showError: state.showError,
      oidcRoles: state.current.oidcRoles,
      roles: state.roles,
      useWhitelist: state.current.useWhitelist,
      enforceOIDC: state.current.enforceOIDC,
      enforceOIDCConfig: state.enforceOIDCConfig,
      initialEnforceOIDC: state.initial.enforceOIDC,
      users: state.current.users,
      isDirty,
      auditLogEnabled: state.auditLogEnabled,
    },
    actions: {
      setSuccess: (val: boolean) =>
        dispatch({ type: val ? 'flash/success' : 'flash/clear', kind: 'success' }),
      setError: (val: boolean) =>
        dispatch({ type: val ? 'flash/error' : 'flash/clear', kind: 'error' }),
      onChangeRole,
      onRegisterWhitelist,
      onDeleteWhitelist,
      onDeleteAll,
      onImport,
      onExport,
      onToggleWhitelist,
      onToggleEnforce,
      onSaveAll,
    },
  };
}
