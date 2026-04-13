import { useState, useEffect, useCallback } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { OIDCRole, RoleDef } from '../../components/Role';
import { WhitelistUser } from '../../components/Whitelist';
import { formatDatetimeForFilename } from '../../utils/datetime';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function useOidcSettings() {
  const { get, put, post } = useFetchClient();

  const [loading, setLoading] = useState(false);
  const [showSuccess, setSuccess] = useState(false);
  const [showError, setError] = useState(false);

  const [initialOidcRoles, setInitialOIDCRoles] = useState<OIDCRole[]>([]);
  const [oidcRoles, setOIDCRoles] = useState<OIDCRole[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);

  const [initialUseWhitelist, setInitialUseWhitelist] = useState(false);
  const [useWhitelist, setUseWhitelist] = useState(false);
  const [initialEnforceOIDC, setInitialEnforceOIDC] = useState(false);
  const [enforceOIDC, setEnforceOIDC] = useState(false);
  const [enforceOIDCConfig, setEnforceOIDCConfig] = useState<boolean | null>(null);
  const [initialUsers, setInitialUsers] = useState<WhitelistUser[]>([]);
  const [users, setUsers] = useState<WhitelistUser[]>([]);
  const [whitelistResponse, setWhitelistResponse] = useState<Record<string, unknown>>({});

  useEffect(() => {
    get(`/strapi-plugin-oidc/oidc-roles`).then((response) => {
      setOIDCRoles(response.data);
      setInitialOIDCRoles(deepClone(response.data));
    });
    get(`/admin/roles`).then((response) => {
      setRoles(response.data.data);
    });
    get('/strapi-plugin-oidc/whitelist').then((response) => {
      const data = response.data;
      setWhitelistResponse(data);
      setUsers(data.whitelistUsers);
      setInitialUsers(deepClone(data.whitelistUsers));
      setUseWhitelist(data.useWhitelist);
      setInitialUseWhitelist(data.useWhitelist);
      setEnforceOIDC(data.enforceOIDC);
      setInitialEnforceOIDC(data.enforceOIDC);
      setEnforceOIDCConfig(data.enforceOIDCConfig ?? null);
    });
  }, [get]);

  const onChangeRole = useCallback((values: string[], oidcId: string) => {
    setOIDCRoles((prev) =>
      prev.map((role) => (role.oauth_type === oidcId ? { ...role, role: values } : role)),
    );
  }, []);

  const onRegisterWhitelist = useCallback((email: string) => {
    setUsers((prev) => [...prev, { email, createdAt: new Date().toISOString() }]);
  }, []);

  const onDeleteWhitelist = useCallback(
    (email: string) => {
      setUsers((prev) => {
        const updated = prev.filter((u) => u.email !== email);
        if (useWhitelist && updated.length === 0) setEnforceOIDC(false);
        return updated;
      });
    },
    [useWhitelist],
  );

  const onDeleteAll = useCallback(() => {
    setUsers([]);
    if (useWhitelist) setEnforceOIDC(false);
  }, [useWhitelist]);

  const onImport = useCallback(
    async (emails: string[]): Promise<number> => {
      const response = await post('/strapi-plugin-oidc/whitelist/import', {
        users: emails.map((e) => ({ email: e })),
      });
      const refreshed = await get('/strapi-plugin-oidc/whitelist');
      setUsers(refreshed.data.whitelistUsers);
      setInitialUsers(deepClone(refreshed.data.whitelistUsers));
      return response.data.importedCount as number;
    },
    [post, get],
  );

  const onExport = useCallback(async () => {
    const response = await get('/strapi-plugin-oidc/whitelist/export');
    const data = response.data as Array<{ email: string }>;
    const datetime = formatDatetimeForFilename(new Date());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `strapi-oidc-whitelist-${datetime}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [get]);

  const onToggleWhitelist = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const checked = e.target.checked;
      setUseWhitelist(checked);
      if (checked && users.length === 0) setEnforceOIDC(false);
    },
    [users.length],
  );

  const onToggleEnforce = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEnforceOIDC(e.target.checked);
  }, []);

  const isDirty =
    useWhitelist !== initialUseWhitelist ||
    enforceOIDC !== initialEnforceOIDC ||
    JSON.stringify(oidcRoles) !== JSON.stringify(initialOidcRoles) ||
    JSON.stringify(users) !== JSON.stringify(initialUsers);

  const onSaveAll = useCallback(async () => {
    setLoading(true);
    try {
      await put('/strapi-plugin-oidc/oidc-roles', {
        roles: oidcRoles.map((role) => ({ oauth_type: role.oauth_type, role: role.role })),
      });
      await put('/strapi-plugin-oidc/whitelist/sync', {
        users: users.map((u) => ({ email: u.email })),
      });
      await put('/strapi-plugin-oidc/whitelist/settings', { useWhitelist, enforceOIDC });

      setInitialOIDCRoles(deepClone(oidcRoles));
      setInitialUseWhitelist(useWhitelist);
      setInitialEnforceOIDC(enforceOIDC);

      get('/strapi-plugin-oidc/whitelist').then((getResponse) => {
        const data = getResponse.data;
        setWhitelistResponse(data);
        setUsers(data.whitelistUsers);
        setInitialUsers(deepClone(data.whitelistUsers));
      });

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e) {
      console.error(e);
      setError(true);
      setTimeout(() => setError(false), 3000);
    } finally {
      setLoading(false);
    }
  }, [put, get, oidcRoles, users, useWhitelist, enforceOIDC]);

  return {
    state: {
      loading,
      showSuccess,
      showError,
      oidcRoles,
      roles,
      useWhitelist,
      enforceOIDC,
      enforceOIDCConfig,
      initialEnforceOIDC,
      users,
      isDirty,
      auditLogEnabled: (whitelistResponse.auditLogEnabled as boolean) ?? true,
    },
    actions: {
      setSuccess,
      setError,
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
