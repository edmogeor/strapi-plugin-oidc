import { useReducer, useEffect, useCallback, useMemo } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { downloadJson } from '../../../utils/download';
import { initialState, reducer } from './reducer';

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
