import { memo } from 'react';
import { useBlocker } from 'react-router-dom';
import { Box, Flex, Typography, Button, Dialog } from '@strapi/design-system';
import { WarningCircle, Information } from '@strapi/icons';
import { Page, Layouts } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';
import Role from '../../components/Role';
import Whitelist from '../../components/Whitelist';
import AuditLog from '../../components/AuditLog';
import { ErrorAlertMessage, SuccessAlertMessage } from '../../components/AlertMessage';
import CustomSwitch from '../../components/CustomSwitch';
import { useOidcSettings } from './useOidcSettings';

function HomePage() {
  const { formatMessage } = useIntl();
  const { state, actions } = useOidcSettings();
  const blocker = useBlocker(state.isDirty);

  return (
    <Page.Protect permissions={[{ action: 'plugin::strapi-plugin-oidc.read', subject: null }]}>
      <Layouts.Header
        title={formatMessage(getTrad('page.title.oidc'))}
        subtitle={formatMessage(getTrad('page.title'))}
      />
      {state.showSuccess && <SuccessAlertMessage onClose={() => actions.setSuccess(false)} />}
      {state.showError && <ErrorAlertMessage onClose={() => actions.setError(false)} />}
      <Layouts.Content>
        <Flex direction="column" alignItems="stretch" gap={6}>
          <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
            <Box paddingBottom={4}>
              <Typography variant="beta" tag="h2">
                {formatMessage(getTrad('roles.title'))}
              </Typography>
            </Box>
            <Role
              roles={state.roles}
              oidcRoles={state.oidcRoles}
              onChangeRole={actions.onChangeRole}
            />
          </Box>
          <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
            <Flex justifyContent="space-between" paddingBottom={4}>
              <Typography variant="beta" tag="h2">
                {formatMessage(getTrad('whitelist.title'))}
              </Typography>
              <CustomSwitch
                checked={state.useWhitelist}
                onChange={actions.onToggleWhitelist}
                label={
                  state.useWhitelist
                    ? formatMessage(getTrad('whitelist.toggle.enabled'))
                    : formatMessage(getTrad('whitelist.toggle.disabled'))
                }
              />
            </Flex>
            <Whitelist
              loading={state.loading}
              users={state.users}
              useWhitelist={state.useWhitelist}
              onSave={actions.onRegisterWhitelist}
              onDelete={actions.onDeleteWhitelist}
              onDeleteAll={actions.onDeleteAll}
              onImport={actions.onImport}
              onExport={actions.onExport}
            />
          </Box>
          <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
            <Box paddingBottom={6}>
              <Typography variant="beta" tag="h2">
                {formatMessage(getTrad('login.settings.title'))}
              </Typography>
            </Box>
            <Flex direction="column" alignItems="stretch" gap={2}>
              <Flex alignItems="center" gap={3} wrap="wrap">
                <Typography variant="omega" style={{ minWidth: '280px' }}>
                  {formatMessage(getTrad('enforce.title'))}
                </Typography>
                <Box minWidth="160px">
                  <CustomSwitch
                    checked={state.enforceOIDC}
                    onChange={actions.onToggleEnforce}
                    disabled={
                      state.enforceOIDCConfig !== null ||
                      (state.useWhitelist && state.users.length === 0)
                    }
                    label={
                      state.enforceOIDC
                        ? formatMessage(getTrad('enforce.toggle.enabled'))
                        : formatMessage(getTrad('enforce.toggle.disabled'))
                    }
                  />
                </Box>
              </Flex>
              {state.enforceOIDCConfig !== null && (
                <Box background="primary100" padding={3} hasRadius>
                  <Flex gap={3} alignItems="center">
                    <Information fill="primary600" />
                    <Typography textColor="primary600">
                      {formatMessage(getTrad('enforce.config.info'))}
                    </Typography>
                  </Flex>
                </Box>
              )}
              {state.enforceOIDCConfig === null &&
                state.enforceOIDC &&
                state.enforceOIDC !== state.initialEnforceOIDC && (
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
              onClick={actions.onSaveAll}
              disabled={!state.isDirty || state.loading}
              loading={state.loading}
            >
              {formatMessage(getTrad('page.save'))}
            </Button>
          </Flex>
          {state.auditLogEnabled && (
            <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
              <AuditLog
                title={
                  <Typography variant="beta" tag="h2">
                    {formatMessage(getTrad('auditlog.title'))}
                  </Typography>
                }
              />
            </Box>
          )}
        </Flex>
      </Layouts.Content>
      <Dialog.Root open={blocker.state === 'blocked'}>
        <Dialog.Content>
          <Dialog.Header>{formatMessage(getTrad('unsaved.title'))}</Dialog.Header>
          <Dialog.Body>{formatMessage(getTrad('unsaved.description'))}</Dialog.Body>
          <Dialog.Footer>
            <Dialog.Cancel>
              <Button variant="tertiary" onClick={() => blocker.reset?.()}>
                {formatMessage(getTrad('unsaved.cancel'))}
              </Button>
            </Dialog.Cancel>
            <Dialog.Action>
              <Button variant="danger" onClick={() => blocker.proceed?.()}>
                {formatMessage(getTrad('unsaved.confirm'))}
              </Button>
            </Dialog.Action>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </Page.Protect>
  );
}

export default memo(HomePage);
