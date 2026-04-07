import { useState, useEffect } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import { OIDCRole, RoleDef } from '../../components/Role';
import { WhitelistUser } from '../../components/Whitelist';

export function useOidcSettings() {
  const { get, put } = useFetchClient();

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
  const [initialUsers, setInitialUsers] = useState<WhitelistUser[]>([]);
  const [users, setUsers] = useState<WhitelistUser[]>([]);

  // Login settings
  const [initialShowSSOButton, setInitialShowSSOButton] = useState(true);
  const [showSSOButton, setShowSSOButton] = useState(true);
  const [initialSSOButtonText, setInitialSSOButtonText] = useState('Login via SSO');
  const [ssoButtonText, setSSOButtonText] = useState('Login via SSO');

  useEffect(() => {
    get(`/strapi-plugin-oidc/oidc-roles`).then((response) => {
      setOIDCRoles(response.data);
      setInitialOIDCRoles(JSON.parse(JSON.stringify(response.data)));
    });
    get(`/admin/roles`).then((response) => {
      setRoles(response.data.data);
    });
    get('/strapi-plugin-oidc/whitelist').then((response) => {
      setUsers(response.data.whitelistUsers);
      setInitialUsers(JSON.parse(JSON.stringify(response.data.whitelistUsers)));
      setUseWhitelist(response.data.useWhitelist);
      setInitialUseWhitelist(response.data.useWhitelist);
      setEnforceOIDC(response.data.enforceOIDC);
      setInitialEnforceOIDC(response.data.enforceOIDC);
      setShowSSOButton(response.data.showSSOButton !== false);
      setInitialShowSSOButton(response.data.showSSOButton !== false);
      setSSOButtonText(response.data.ssoButtonText || 'Login via SSO');
      setInitialSSOButtonText(response.data.ssoButtonText || 'Login via SSO');
    });
  }, [get]);

  const onChangeRole = (values: string[], oidcId: string) => {
    const updatedRoles = oidcRoles.map((role) =>
      role.oauth_type === oidcId ? { ...role, role: values } : role,
    );
    setOIDCRoles(updatedRoles);
  };

  const onRegisterWhitelist = async (email: string, selectedRoles: string[]) => {
    const newUser = { email, roles: selectedRoles, createdAt: new Date().toISOString() };
    setUsers([...users, newUser]);
  };

  const onDeleteWhitelist = async (email: string) => {
    const updatedUsers = users.filter((u) => u.email !== email);
    setUsers(updatedUsers);
    if (useWhitelist && updatedUsers.length === 0) {
      setEnforceOIDC(false);
    }
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

  const onToggleShowSSOButton = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowSSOButton(e.target.checked);
  };

  const onChangeSSOButtonText = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSSOButtonText(e.target.value);
  };

  const isDirty =
    useWhitelist !== initialUseWhitelist ||
    enforceOIDC !== initialEnforceOIDC ||
    showSSOButton !== initialShowSSOButton ||
    ssoButtonText !== initialSSOButtonText ||
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
        showSSOButton,
        ssoButtonText,
      });

      setInitialOIDCRoles(JSON.parse(JSON.stringify(oidcRoles)));
      setInitialUseWhitelist(useWhitelist);
      setInitialEnforceOIDC(enforceOIDC);
      setInitialShowSSOButton(showSSOButton);
      setInitialSSOButtonText(ssoButtonText);

      get('/strapi-plugin-oidc/whitelist').then((getResponse) => {
        setUsers(getResponse.data.whitelistUsers);
        setInitialUsers(JSON.parse(JSON.stringify(getResponse.data.whitelistUsers)));
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
      initialEnforceOIDC,
      users,
      showSSOButton,
      ssoButtonText,
      isDirty,
    },
    actions: {
      setSuccess,
      setError,
      setMatched,
      onChangeRole,
      onRegisterWhitelist,
      onDeleteWhitelist,
      onToggleWhitelist,
      onToggleEnforce,
      onToggleShowSSOButton,
      onChangeSSOButtonText,
      onSaveAll,
    },
  };
}
