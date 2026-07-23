import { memo } from 'react';
import { useBlocker } from 'react-router-dom';
import { Typography } from '@strapi/design-system';
import { Page, Layouts } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';
import { useOidcSettings } from './useOidcSettings';
import {
  AlertMessages,
  AuditLogSection,
  LoginSettingsSection,
  RoleSection,
  SaveBar,
  UnsavedChangesDialog,
  WhitelistSection,
} from './HomePageSections';

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
      <AlertMessages
        showSuccess={state.showSuccess}
        showError={state.showError}
        onCloseSuccess={() => actions.setSuccess(false)}
        onCloseError={() => actions.setError(false)}
      />
      <Layouts.Content>
        <RoleSection
          roles={state.roles}
          oidcRoles={state.oidcRoles}
          onChangeRole={actions.onChangeRole}
        />
        <WhitelistSection
          loading={state.loading}
          users={state.users}
          useWhitelist={state.useWhitelist}
          onToggleWhitelist={actions.onToggleWhitelist}
          onSave={actions.onRegisterWhitelist}
          onDelete={actions.onDeleteWhitelist}
          onDeleteAll={actions.onDeleteAll}
          onImport={actions.onImport}
          onExport={actions.onExport}
        />
        <LoginSettingsSection
          enforceOIDC={state.enforceOIDC}
          enforceOIDCConfig={state.enforceOIDCConfig}
          initialEnforceOIDC={state.initialEnforceOIDC}
          useWhitelist={state.useWhitelist}
          users={state.users}
          skipLoginPage={state.skipLoginPage}
          skipLoginPageConfig={state.skipLoginPageConfig}
          initialSkipLoginPage={state.initialSkipLoginPage}
          onToggleEnforce={actions.onToggleEnforce}
          onToggleSkipLoginPage={actions.onToggleSkipLoginPage}
        />
        <SaveBar isDirty={state.isDirty} loading={state.loading} onSave={actions.onSaveAll} />
        {state.auditLogEnabled && (
          <AuditLogSection
            title={
              <Typography variant="beta" tag="h2">
                {formatMessage(getTrad('auditlog.title'))}
              </Typography>
            }
          />
        )}
      </Layouts.Content>
      <UnsavedChangesDialog blocker={blocker} />
    </Page.Protect>
  );
}

export default memo(HomePage);
