import { memo, type ReactNode, type ChangeEvent } from 'react';
import { Box, Flex, Typography, Button, Dialog } from '@strapi/design-system';
import { WarningCircle, Information } from '@strapi/icons';
import { useIntl } from 'react-intl';
import type { Blocker } from 'react-router-dom';
import getTrad from '../../utils/getTrad';
import Role from '../../components/Role';
import Whitelist from '../../components/Whitelist';
import AuditLog from '../../components/AuditLog';
import { ErrorAlertMessage, SuccessAlertMessage } from '../../components/AlertMessage';
import CustomSwitch from '../../components/CustomSwitch';
import type { OIDCRole, RoleDef, WhitelistUser } from '../../types';

interface AlertMessagesProps {
  showSuccess: boolean;
  showError: boolean;
  onCloseSuccess: () => void;
  onCloseError: () => void;
}

export const AlertMessages = memo(function AlertMessages({
  showSuccess,
  showError,
  onCloseSuccess,
  onCloseError,
}: AlertMessagesProps) {
  return (
    <>
      {showSuccess && <SuccessAlertMessage onClose={onCloseSuccess} />}
      {showError && <ErrorAlertMessage onClose={onCloseError} />}
    </>
  );
});

interface RoleSectionProps {
  roles: RoleDef[];
  oidcRoles: OIDCRole[];
  onChangeRole: (values: string[], oidcId: string) => void;
}

export const RoleSection = memo(function RoleSection({
  roles,
  oidcRoles,
  onChangeRole,
}: RoleSectionProps) {
  const { formatMessage } = useIntl();
  return (
    <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
      <Box paddingBottom={4}>
        <Typography variant="beta" tag="h2">
          {formatMessage(getTrad('roles.title'))}
        </Typography>
      </Box>
      <Role roles={roles} oidcRoles={oidcRoles} onChangeRole={onChangeRole} />
    </Box>
  );
});

interface WhitelistSectionProps {
  loading: boolean;
  users: WhitelistUser[];
  useWhitelist: boolean;
  onToggleWhitelist: (e: ChangeEvent<HTMLInputElement>) => void;
  onSave: (email: string) => void;
  onDelete: (email: string) => void;
  onDeleteAll: () => void;
  onImport: (emails: string[]) => Promise<number>;
  onExport: () => Promise<void>;
}

export const WhitelistSection = memo(function WhitelistSection({
  loading,
  users,
  useWhitelist,
  onToggleWhitelist,
  onSave,
  onDelete,
  onDeleteAll,
  onImport,
  onExport,
}: WhitelistSectionProps) {
  const { formatMessage } = useIntl();
  return (
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
        useWhitelist={useWhitelist}
        onSave={onSave}
        onDelete={onDelete}
        onDeleteAll={onDeleteAll}
        onImport={onImport}
        onExport={onExport}
      />
    </Box>
  );
});

interface ConfigInfoBannerProps {
  messageId: string;
}

const ConfigInfoBanner = memo(function ConfigInfoBanner({ messageId }: ConfigInfoBannerProps) {
  const { formatMessage } = useIntl();
  return (
    <Box background="primary100" padding={3} hasRadius>
      <Flex gap={3} alignItems="center">
        <Information fill="primary600" />
        <Typography textColor="primary600">{formatMessage(getTrad(messageId))}</Typography>
      </Flex>
    </Box>
  );
});

interface UnsavedWarningProps {
  messageId: string;
}

const UnsavedWarning = memo(function UnsavedWarning({ messageId }: UnsavedWarningProps) {
  const { formatMessage } = useIntl();
  return (
    <Box background="danger100" padding={3} hasRadius>
      <Flex gap={3} alignItems="center">
        <WarningCircle fill="danger600" />
        <Typography textColor="danger600">{formatMessage(getTrad(messageId))}</Typography>
      </Flex>
    </Box>
  );
});

interface SettingsSwitchProps {
  titleId: string;
  checked: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  enabledLabelId: string;
  disabledLabelId: string;
}

const SettingsSwitch = memo(function SettingsSwitch({
  titleId,
  checked,
  onChange,
  disabled,
  enabledLabelId,
  disabledLabelId,
}: SettingsSwitchProps) {
  const { formatMessage } = useIntl();
  return (
    <Flex alignItems="center" gap={3} wrap="wrap">
      <Typography variant="omega" style={{ minWidth: '280px' }}>
        {formatMessage(getTrad(titleId))}
      </Typography>
      <Box minWidth="160px">
        <CustomSwitch
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          label={
            checked
              ? formatMessage(getTrad(enabledLabelId))
              : formatMessage(getTrad(disabledLabelId))
          }
        />
      </Box>
    </Flex>
  );
});

interface LoginSettingsSectionProps {
  enforceOIDC: boolean;
  enforceOIDCConfig: boolean | null;
  initialEnforceOIDC: boolean;
  useWhitelist: boolean;
  users: WhitelistUser[];
  skipLoginPage: boolean;
  skipLoginPageConfig: boolean | null;
  initialSkipLoginPage: boolean;
  onToggleEnforce: (e: ChangeEvent<HTMLInputElement>) => void;
  onToggleSkipLoginPage: (e: ChangeEvent<HTMLInputElement>) => void;
}

export const LoginSettingsSection = memo(function LoginSettingsSection({
  enforceOIDC,
  enforceOIDCConfig,
  initialEnforceOIDC,
  useWhitelist,
  users,
  skipLoginPage,
  skipLoginPageConfig,
  initialSkipLoginPage,
  onToggleEnforce,
  onToggleSkipLoginPage,
}: LoginSettingsSectionProps) {
  const { formatMessage } = useIntl();
  return (
    <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
      <Box paddingBottom={6}>
        <Typography variant="beta" tag="h2">
          {formatMessage(getTrad('login.settings.title'))}
        </Typography>
      </Box>
      <Flex direction="column" alignItems="stretch" gap={2}>
        <SettingsSwitch
          titleId="enforce.title"
          checked={enforceOIDC}
          onChange={onToggleEnforce}
          disabled={enforceOIDCConfig !== null || (useWhitelist && users.length === 0)}
          enabledLabelId="enforce.toggle.enabled"
          disabledLabelId="enforce.toggle.disabled"
        />
        {enforceOIDCConfig !== null && <ConfigInfoBanner messageId="enforce.config.info" />}
        {enforceOIDCConfig === null && enforceOIDC && enforceOIDC !== initialEnforceOIDC && (
          <UnsavedWarning messageId="enforce.warning" />
        )}
        <SettingsSwitch
          titleId="skipLoginPage.title"
          checked={skipLoginPage}
          onChange={onToggleSkipLoginPage}
          disabled={skipLoginPageConfig !== null}
          enabledLabelId="skipLoginPage.toggle.enabled"
          disabledLabelId="skipLoginPage.toggle.disabled"
        />
        {skipLoginPageConfig !== null && <ConfigInfoBanner messageId="skipLoginPage.config.info" />}
        {skipLoginPageConfig === null &&
          skipLoginPage &&
          skipLoginPage !== initialSkipLoginPage && (
            <UnsavedWarning messageId="skipLoginPage.warning" />
          )}
      </Flex>
    </Box>
  );
});

interface SaveBarProps {
  isDirty: boolean;
  loading: boolean;
  onSave: () => void;
}

export const SaveBar = memo(function SaveBar({ isDirty, loading, onSave }: SaveBarProps) {
  const { formatMessage } = useIntl();
  return (
    <Flex justifyContent="flex-end" marginBottom={8}>
      <Button size="L" onClick={onSave} disabled={!isDirty || loading} loading={loading}>
        {formatMessage(getTrad('page.save'))}
      </Button>
    </Flex>
  );
});

interface AuditLogSectionProps {
  title: ReactNode;
}

export const AuditLogSection = memo(function AuditLogSection({ title }: AuditLogSectionProps) {
  return (
    <Box background="neutral0" hasRadius shadow="filterShadow" padding={6}>
      <AuditLog title={title} />
    </Box>
  );
});

interface UnsavedChangesDialogProps {
  blocker: Blocker;
}

export const UnsavedChangesDialog = memo(function UnsavedChangesDialog({
  blocker,
}: UnsavedChangesDialogProps) {
  const { formatMessage } = useIntl();
  return (
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
  );
});
