import React, {memo, useEffect, useState} from 'react';
import {
  Box,
  Flex,
  Typography,
  Button
} from '@strapi/design-system';
import { WarningCircle } from '@strapi/icons';
import {Page, Layouts} from '@strapi/strapi/admin';
import {useIntl} from 'react-intl';
import {useFetchClient} from '@strapi/strapi/admin';
import getTrad from "../../utils/getTrad";
import Role, { OIDCRole, RoleDef } from "../../components/Role";
import Whitelist, { WhitelistUser } from "../../components/Whitelist";
import {ErrorAlertMessage, SuccessAlertMessage, MatchedUserAlertMessage} from "../../components/AlertMessage";
import CustomSwitch from "../../components/CustomSwitch";

function HomePage() {
  const {formatMessage} = useIntl();
  const [loading, setLoading] = useState(false);

  // Roles
  const [initialOidcRoles, setInitialOIDCRoles] = useState<OIDCRole[]>([])
  const [oidcRoles, setOIDCRoles] = useState<OIDCRole[]>([])
  const [roles, setRoles] = useState<RoleDef[]>([])

  // Whitelist
  const [initialUseWhitelist, setInitialUseWhitelist] = useState(false)
  const [useWhitelist, setUseWhitelist] = useState(false)
  const [initialEnforceOIDC, setInitialEnforceOIDC] = useState(false)
  const [enforceOIDC, setEnforceOIDC] = useState(false)
  const [initialUsers, setInitialUsers] = useState<WhitelistUser[]>([])
  const [users, setUsers] = useState<WhitelistUser[]>([])

  const [showSuccess, setSuccess] = useState(false)
  const [showError, setError] = useState(false)
  const [showMatched, setMatched] = useState(0)

  const {get, put, post, del} = useFetchClient();

  useEffect(() => {
    get(`/strapi-plugin-oidc/oidc-roles`).then((response) => {
      setOIDCRoles(response.data)
      setInitialOIDCRoles(JSON.parse(JSON.stringify(response.data)))
    })
    get(`/admin/roles`).then((response) => {
      setRoles(response.data.data)
    })
    get('/strapi-plugin-oidc/whitelist').then(response => {
      setUsers(response.data.whitelistUsers)
      setInitialUsers(JSON.parse(JSON.stringify(response.data.whitelistUsers)))
      setUseWhitelist(response.data.useWhitelist)
      setInitialUseWhitelist(response.data.useWhitelist)
      setEnforceOIDC(response.data.enforceOIDC)
      setInitialEnforceOIDC(response.data.enforceOIDC)
    })
  }, [setOIDCRoles, setRoles])

  const onChangeRole = (values: string[], oidcId: string) => {
    for (const oidcRole of oidcRoles) {
      if (oidcRole['oauth_type'] === oidcId) {
        oidcRole['role'] = values;
      }
    }
    setOIDCRoles(oidcRoles.slice())
  }
  const onSaveAll = async () => {
    setLoading(true)
    try {
      await put('/strapi-plugin-oidc/oidc-roles', {
        roles: oidcRoles.map(role => ({
          'oauth_type': role['oauth_type'], role: role['role']
        }))
      })
      await put('/strapi-plugin-oidc/whitelist/settings', {
        useWhitelist: useWhitelist,
        enforceOIDC: enforceOIDC
      })
      const syncResponse = await put('/strapi-plugin-oidc/whitelist/sync', {
        users: users.map(u => ({ email: u.email, roles: u.roles }))
      })
      
      setInitialOIDCRoles(JSON.parse(JSON.stringify(oidcRoles)))
      setInitialUseWhitelist(useWhitelist)
      setInitialEnforceOIDC(enforceOIDC)
      
      get('/strapi-plugin-oidc/whitelist').then(getResponse => {
        setUsers(getResponse.data.whitelistUsers)
        setInitialUsers(JSON.parse(JSON.stringify(getResponse.data.whitelistUsers)))
      })

      if (syncResponse.data && syncResponse.data.matchedExistingUsersCount > 0) {
        setMatched(syncResponse.data.matchedExistingUsersCount)
        setTimeout(() => {
          setMatched(0)
        }, 3000)
      } else {
        setSuccess(true)
        setTimeout(() => {
          setSuccess(false)
        }, 3000)
      }
    } catch (e) {
      console.error(e)
      setError(true)
      setTimeout(() => {
        setError(false)
      }, 3000)
    } finally {
      setLoading(false)
    }
  }

  const onRegisterWhitelist = async (email: string, selectedRoles: string[]) => {
    const newUser = { email, roles: selectedRoles, createdAt: new Date().toISOString() };
    setUsers([...users, newUser]);
  }

  const onDeleteWhitelist = async (email: string) => {
    setUsers(users.filter(u => u.email !== email));
  }

  const onToggleWhitelist = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setUseWhitelist(newValue)
  }

  const onToggleEnforce = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setEnforceOIDC(newValue)
  }

  const isDirty = useWhitelist !== initialUseWhitelist || enforceOIDC !== initialEnforceOIDC || JSON.stringify(oidcRoles) !== JSON.stringify(initialOidcRoles) || JSON.stringify(users) !== JSON.stringify(initialUsers);

  return (
    <Page.Protect permissions={[{action: 'plugin::strapi-plugin-oidc.read', subject: null}]}>
      <Layouts.Header
        title={formatMessage(getTrad('page.title.oidc'))}
        subtitle={formatMessage(getTrad('page.title'))}
      />
      {
        showSuccess && (
          <SuccessAlertMessage onClose={() => setSuccess(false)}/>
        )
      }
      {
        showError && (
          <ErrorAlertMessage onClose={() => setError(false)}/>
        )
      }
      {
        showMatched > 0 && (
          <MatchedUserAlertMessage count={showMatched} onClose={() => setMatched(0)}/>
        )
      }
      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={6}>
          <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
            <Box paddingBottom={4}>
              <Typography variant="beta" tag="h2">
                {formatMessage(getTrad('roles.title'))}
              </Typography>
            </Box>
            <Role
              roles={roles}
              oidcRoles={oidcRoles}
              onChangeRole={onChangeRole}
            />
          </Box>
          <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
            <Flex justifyContent="space-between" paddingBottom={4}>
              <Typography variant="beta" tag="h2">
                {formatMessage(getTrad('whitelist.title'))}
              </Typography>
              <CustomSwitch
                checked={useWhitelist}
                onChange={onToggleWhitelist}
                label={
                  useWhitelist
                    ? formatMessage(getTrad('whitelist.toggle.enabled'))
                    : formatMessage(getTrad('whitelist.toggle.disabled'))
                }
              />
            </Flex>
            <Whitelist
              loading={loading}
              users={users}
              roles={roles}
              oidcRoles={oidcRoles}
              useWhitelist={useWhitelist}
              onSave={onRegisterWhitelist}
              onDelete={onDeleteWhitelist}
            />
          </Box>
          <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
            <Flex direction="column" alignItems="stretch" gap={4}>
              <Flex justifyContent="space-between" alignItems="center">
                <Typography variant="epsilon" tag="h4">
                  {formatMessage(getTrad('enforce.title'))}
                </Typography>
                <CustomSwitch
                  checked={enforceOIDC}
                  onChange={onToggleEnforce}
                  disabled={useWhitelist && users.length === 0}
                  label={
                    enforceOIDC
                      ? formatMessage(getTrad('enforce.toggle.enabled'))
                      : formatMessage(getTrad('enforce.toggle.disabled'))
                  }
                />
              </Flex>
              {enforceOIDC && enforceOIDC !== initialEnforceOIDC && (
                <Box background="danger100" padding={3} hasRadius>
                  <Flex gap={3} alignItems="center">
                    <WarningCircle fill="danger600" />
                    <Typography textColor="danger600">
                      {formatMessage(getTrad('enforce.warning'))}
                    </Typography>
                  </Flex>
                </Box>
              )}
            </Flex>
          </Box>
          <Flex justifyContent="flex-end">
            <Button
              size="L"
              onClick={onSaveAll}
              disabled={!isDirty || loading}
              loading={loading}
            >
              {formatMessage(getTrad('page.save'))}
            </Button>
          </Flex>
        </Flex>
      </Layouts.Content>
    </Page.Protect>
  );
}

export default memo(HomePage);
