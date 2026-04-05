import React, {memo, useEffect, useState} from 'react';
import {
  Box,
  Flex,
  Typography,
  Button
} from '@strapi/design-system';
import {Page, Layouts} from '@strapi/strapi/admin';
import {useIntl} from 'react-intl';
import {useFetchClient} from '@strapi/strapi/admin';
import getTrad from "../../utils/getTrad";
import Role from "../../components/Role";
import Whitelist from "../../components/Whitelist";
import {ErrorAlertMessage, SuccessAlertMessage, MatchedUserAlertMessage} from "../../components/AlertMessage";
import CustomSwitch from "../../components/CustomSwitch";

function HomePage() {
  const {formatMessage} = useIntl();
  const [loading, setLoading] = useState(false);

  // Roles
  const [initialSsoRoles, setInitialSSORoles] = useState([])
  const [ssoRoles, setSSORoles] = useState([])
  const [roles, setRoles] = useState([])

  // Whitelist
  const [initialUseWhitelist, setInitialUseWhitelist] = useState(false)
  const [useWhitelist, setUseWhitelist] = useState(false)
  const [initialUsers, setInitialUsers] = useState([])
  const [users, setUsers] = useState([])

  const [showSuccess, setSuccess] = useState(false)
  const [showError, setError] = useState(false)
  const [showMatched, setMatched] = useState(0)

  const {get, put, post, del} = useFetchClient();

  useEffect(() => {
    get(`/strapi-plugin-oidc/sso-roles`).then((response) => {
      setSSORoles(response.data)
      setInitialSSORoles(JSON.parse(JSON.stringify(response.data)))
    })
    get(`/admin/roles`).then((response) => {
      setRoles(response.data.data)
    })
    get('/strapi-plugin-oidc/whitelist').then(response => {
      setUsers(response.data.whitelistUsers)
      setInitialUsers(JSON.parse(JSON.stringify(response.data.whitelistUsers)))
      setUseWhitelist(response.data.useWhitelist)
      setInitialUseWhitelist(response.data.useWhitelist)
    })
  }, [setSSORoles, setRoles])

  const onChangeRole = (values, ssoId) => {
    for (const ssoRole of ssoRoles) {
      if (ssoRole['oauth_type'] === ssoId) {
        ssoRole['role'] = values;
      }
    }
    setSSORoles(ssoRoles.slice())
  }
  const onSaveAll = async () => {
    setLoading(true)
    try {
      await put('/strapi-plugin-oidc/sso-roles', {
        roles: ssoRoles.map(role => ({
          'oauth_type': role['oauth_type'], role: role['role']
        }))
      })
      await put('/strapi-plugin-oidc/whitelist/settings', {
        useWhitelist: useWhitelist
      })
      const syncResponse = await put('/strapi-plugin-oidc/whitelist/sync', {
        users: users.map(u => ({ email: u.email, roles: u.roles }))
      })
      
      setInitialSSORoles(JSON.parse(JSON.stringify(ssoRoles)))
      setInitialUseWhitelist(useWhitelist)
      
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

  const onRegisterWhitelist = async (email, selectedRoles) => {
    const newUser = { email, roles: selectedRoles, createdAt: new Date().toISOString() };
    setUsers([...users, newUser]);
  }

  const onDeleteWhitelist = async (email) => {
    setUsers(users.filter(u => u.email !== email));
  }

  const onToggleWhitelist = (e) => {
    const newValue = e.target.checked;
    setUseWhitelist(newValue)
  }

  const isDirty = useWhitelist !== initialUseWhitelist || JSON.stringify(ssoRoles) !== JSON.stringify(initialSsoRoles) || JSON.stringify(users) !== JSON.stringify(initialUsers);

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
              ssoRoles={ssoRoles}
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
              ssoRoles={ssoRoles}
              useWhitelist={useWhitelist}
              onSave={onRegisterWhitelist}
              onDelete={onDeleteWhitelist}
            />
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
