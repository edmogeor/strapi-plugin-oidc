import { useState, useEffect } from 'react';
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
  const [showMatched, setMatched] = useState(0);

  // Roles
  const [initialOidcRoles, setInitialOIDCRoles] = useState<OIDCRole[]>([]);
  const [oidcRoles, setOIDCRoles] = useState<OIDCRole[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);

  // Whitelist
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
      setWhitelistResponse(response.data);
      setUsers(response.data.whitelistUsers);
      setInitialUsers(deepClone(response.data.whitelistUsers));
      setUseWhitelist(response.data.useWhitelist);
      setInitialUseWhitelist(response.data.useWhitelist);
      setEnforceOIDC(response.data.enforceOIDC);
      setInitialEnforceOIDC(response.data.enforceOIDC);
      setEnforceOIDCConfig(response.data.enforceOIDCConfig ?? null);
    });
  }, [get]);

  const onChangeRole = (values: string[], oidcId: string) => {
    const updatedRoles = oidcRoles.map((role) =>
      role.oauth_type === oidcId ? { ...role, role: values } : role,
    );
    setOIDCRoles(updatedRoles);
  };

  const onRegisterWhitelist = (email: string, selectedRoles: string[]) => {
    const newUser = { email, roles: selectedRoles, createdAt: new Date().toISOString() };
    setUsers([...users, newUser]);
  };

  const onDeleteWhitelist = (email: string) => {
    const updatedUsers = users.filter((u) => u.email !== email);
    setUsers(updatedUsers);
    if (useWhitelist && updatedUsers.length === 0) {
      setEnforceOIDC(false);
    }
  };

  const onDeleteAll = () => {
    setUsers([]);
    if (useWhitelist) setEnforceOIDC(false);
  };

  const onImport = async (entries: { email: string; roles: string[] }[]): Promise<number> => {
    const response = await post('/strapi-plugin-oidc/whitelist/import', { users: entries });
    // Refresh from server
    const refreshed = await get('/strapi-plugin-oidc/whitelist');
    setUsers(refreshed.data.whitelistUsers);
    setInitialUsers(deepClone(refreshed.data.whitelistUsers));
    return response.data.importedCount as number;
  };

  const onExport = async () => {
    const response = await get('/strapi-plugin-oidc/whitelist/export');
    const roleMap = new Map(roles.map((r) => [String(r.id), r.name]));
    const data = (response.data as Array<{ email: string; roles?: string[] }>).map(
      ({ email, roles: userRoles }) => ({
        email,
        roles: (userRoles || []).map((id) => roleMap.get(String(id)) ?? id),
      }),
    );
    const datetime = formatDatetimeForFilename(new Date());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `strapi-oidc-whitelist-${datetime}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onToggleWhitelist = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setUseWhitelist(checked);
    if (checked && users.length === 0) {
      setEnforceOIDC(false);
    }
  };

  const onToggleEnforce = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEnforceOIDC(e.target.checked);
  };

  const isDirty =
    useWhitelist !== initialUseWhitelist ||
    enforceOIDC !== initialEnforceOIDC ||
    JSON.stringify(oidcRoles) !== JSON.stringify(initialOidcRoles) ||
    JSON.stringify(users) !== JSON.stringify(initialUsers);

  const onSaveAll = async () => {
    setLoading(true);
    try {
      await put('/strapi-plugin-oidc/oidc-roles', {
        roles: oidcRoles.map((role) => ({
          oauth_type: role.oauth_type,
          role: role.role,
        })),
      });
      const syncResponse = await put('/strapi-plugin-oidc/whitelist/sync', {
        users: users.map((u) => ({ email: u.email, roles: u.roles })),
      });
      await put('/strapi-plugin-oidc/whitelist/settings', {
        useWhitelist,
        enforceOIDC,
      });

      setInitialOIDCRoles(deepClone(oidcRoles));
      setInitialUseWhitelist(useWhitelist);
      setInitialEnforceOIDC(enforceOIDC);

      get('/strapi-plugin-oidc/whitelist').then((getResponse) => {
        setWhitelistResponse(getResponse.data);
        setUsers(getResponse.data.whitelistUsers);
        setInitialUsers(deepClone(getResponse.data.whitelistUsers));
      });

      if (syncResponse.data?.matchedExistingUsersCount > 0) {
        setMatched(syncResponse.data.matchedExistingUsersCount);
        setTimeout(() => setMatched(0), 3000);
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (e) {
      console.error(e);
      setError(true);
      setTimeout(() => setError(false), 3000);
    } finally {
      setLoading(false);
    }
  };

  return {
    state: {
      loading,
      showSuccess,
      showError,
      showMatched,
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
      setMatched,
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
