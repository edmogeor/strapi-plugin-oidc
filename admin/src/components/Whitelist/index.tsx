import {
  Box,
  Button,
  Dialog,
  Divider,
  Field,
  Flex,
  IconButton,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
  MultiSelect,
  MultiSelectOption,
  Pagination,
  PreviousLink,
  NextLink,
  PageLink,
} from '@strapi/design-system';
import styled from 'styled-components';
import { useCallback, useRef, useState } from 'react';
import { Download, Plus, Trash, Upload, WarningCircle } from '@strapi/icons';
import { useNotification } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import { OIDCRole, RoleDef } from '../Role';
import getTrad from '../../utils/getTrad';

const CustomTable = styled(Table)`
  th,
  td,
  th span,
  td span {
    font-size: 1.3rem !important;
  }
`;

function LocalizedDate({ date }: { date: string }) {
  const userLocale = navigator.language || 'en-US';
  return new Intl.DateTimeFormat(userLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export interface WhitelistUser {
  email: string;
  roles?: string[];
  createdAt: string;
}

interface WhitelistProps {
  users: WhitelistUser[];
  roles: RoleDef[];
  oidcRoles?: OIDCRole[];
  useWhitelist: boolean;
  loading: boolean;
  onSave: (email: string, roles: string[]) => void;
  onDelete: (email: string) => void;
  onDeleteAll: () => void;
  onImport: (entries: { email: string; roles: string[] }[]) => Promise<number>;
  onExport: () => void;
}

export default function Whitelist({
  users,
  roles,
  oidcRoles = [],
  useWhitelist,
  loading,
  onSave,
  onDelete,
  onDeleteAll,
  onImport,
  onExport,
}: WhitelistProps) {
  const [email, setEmail] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 10;

  const pageCount = Math.ceil(users.length / PAGE_SIZE) || 1;
  const paginatedUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const getRoleNames = (roleIds: string[]): string =>
    roleIds
      .map((roleId) => {
        const r = roles.find((ro) => String(ro.id) === String(roleId));
        return r ? r.name : roleId;
      })
      .join(', ');

  const defaultRoleNames = getRoleNames(oidcRoles.flatMap((oidc) => oidc.role ?? []));

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValidEmail = emailRegex.test(email);

  const onSaveEmail = useCallback(() => {
    const emailText = email.trim();
    if (users.some((user) => user.email === emailText)) {
      toggleNotification({
        type: 'warning',
        message: formatMessage(getTrad('whitelist.error.unique')),
      });
    } else {
      onSave(emailText, selectedRoles);
      setEmail('');
      setSelectedRoles([]);
    }
  }, [email, selectedRoles, users, onSave, formatMessage, toggleNotification]);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!fileInputRef.current) return;
      fileInputRef.current.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error();
        const entries = parsed
          .filter((item: any) => item?.email)
          .map((item: any) => ({
            email: String(item.email),
            roles: Array.isArray(item.roles) ? item.roles : [],
          }));
        const count = await onImport(entries);
        if (count === 0) {
          toggleNotification({
            type: 'info',
            message: formatMessage(getTrad('whitelist.import.none')),
          });
        } else {
          toggleNotification({
            type: 'success',
            message: formatMessage(getTrad('whitelist.import.success'), { count }),
          });
        }
      } catch {
        toggleNotification({
          type: 'warning',
          message: formatMessage(getTrad('whitelist.import.error')),
        });
      }
    },
    [onImport, formatMessage, toggleNotification],
  );

  return (
    <Box>
      <Typography tag="p" variant="omega" textColor="neutral600" marginBottom={4}>
        {formatMessage(getTrad('whitelist.description'))}
      </Typography>

      {useWhitelist && (
        <>
          <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
            <Typography variant="pi" textColor="neutral600">
              {formatMessage(getTrad('whitelist.count'), { count: users.length })}
            </Typography>
            <Flex gap={2}>
              <Button
                size="S"
                variant="tertiary"
                startIcon={<Download />}
                onClick={onExport}
                disabled={users.length === 0}
              >
                {formatMessage(getTrad('whitelist.export'))}
              </Button>
              <Button
                size="S"
                variant="tertiary"
                startIcon={<Upload />}
                onClick={() => fileInputRef.current?.click()}
              >
                {formatMessage(getTrad('whitelist.import'))}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleImport}
              />
              {users.length > 0 && (
                <Dialog.Root>
                  <Dialog.Trigger>
                    <Button size="S" variant="danger-light" startIcon={<Trash />}>
                      {formatMessage(getTrad('whitelist.delete.all.label'))}
                    </Button>
                  </Dialog.Trigger>
                  <Dialog.Content>
                    <Dialog.Header>
                      {formatMessage(getTrad('whitelist.delete.all.title'))}
                    </Dialog.Header>
                    <Dialog.Body icon={<WarningCircle fill="danger600" />}>
                      <Flex justifyContent="center">
                        <Typography textColor="neutral800" textAlign="center">
                          {formatMessage(getTrad('whitelist.delete.all.description'), {
                            count: users.length,
                          })}
                        </Typography>
                      </Flex>
                    </Dialog.Body>
                    <Dialog.Footer>
                      <Dialog.Cancel>
                        <Button fullWidth variant="tertiary">
                          {formatMessage(getTrad('page.cancel'))}
                        </Button>
                      </Dialog.Cancel>
                      <Dialog.Action>
                        <Button fullWidth variant="danger" onClick={onDeleteAll}>
                          {formatMessage(getTrad('whitelist.delete.all.label'))}
                        </Button>
                      </Dialog.Action>
                    </Dialog.Footer>
                  </Dialog.Content>
                </Dialog.Root>
              )}
            </Flex>
          </Flex>
          <Flex gap={4} marginTop={5} marginBottom={5} alignItems="flex-start">
            <Box style={{ flex: 1 }}>
              <Field.Root>
                <Field.Input
                  type="text"
                  disabled={loading}
                  value={email}
                  hasError={Boolean(email && !isValidEmail)}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                  placeholder={formatMessage(getTrad('whitelist.email.placeholder'))}
                />
              </Field.Root>
            </Box>
            <Box style={{ flex: 1 }}>
              <Field.Root>
                <MultiSelect
                  withTags
                  placeholder={formatMessage(getTrad('whitelist.roles.placeholder'))}
                  value={selectedRoles}
                  onChange={(value) => {
                    setSelectedRoles(value || []);
                  }}
                >
                  {roles.map((role) => (
                    <MultiSelectOption key={role.id} value={role.id.toString()}>
                      {role.name}
                    </MultiSelectOption>
                  ))}
                </MultiSelect>
              </Field.Root>
            </Box>
            <Box>
              <Button
                size="L"
                startIcon={<Plus />}
                disabled={loading || email.trim() === '' || !isValidEmail}
                loading={loading}
                onClick={onSaveEmail}
              >
                {formatMessage(getTrad('page.add'))}
              </Button>
            </Box>
          </Flex>

          <Divider />
          <CustomTable colCount={5} rowCount={users.length}>
            <Thead>
              <Tr>
                <Th>{formatMessage(getTrad('whitelist.table.no'))}</Th>
                <Th>{formatMessage(getTrad('whitelist.table.email'))}</Th>
                <Th>{formatMessage(getTrad('whitelist.table.roles'))}</Th>
                <Th>{formatMessage(getTrad('whitelist.table.created'))}</Th>
                <Th style={{ paddingRight: 0 }}>&nbsp;</Th>
              </Tr>
            </Thead>
            <Tbody>
              {users.length === 0 ? (
                <Tr>
                  <Td colSpan={5}>
                    <Flex justifyContent="center" padding={4}>
                      <Typography textColor="neutral600">
                        {formatMessage(getTrad('whitelist.table.empty'))}
                      </Typography>
                    </Flex>
                  </Td>
                </Tr>
              ) : (
                paginatedUsers.map((user, index) => {
                  const explicitRoleNames = getRoleNames(user.roles || []);
                  const isDefault = !explicitRoleNames && Boolean(defaultRoleNames);
                  const userRolesNames = explicitRoleNames || defaultRoleNames;

                  return (
                    <Tr key={user.email}>
                      <Td>{index + 1 + (page - 1) * PAGE_SIZE}</Td>
                      <Td>{user.email}</Td>
                      <Td>
                        {userRolesNames ? (
                          <Flex gap={2} alignItems="center">
                            <span>{userRolesNames}</span>
                            {isDefault && (
                              <Typography variant="pi" textColor="neutral500">
                                {formatMessage(getTrad('whitelist.table.roles.default'))}
                              </Typography>
                            )}
                          </Flex>
                        ) : (
                          '-'
                        )}
                      </Td>
                      <Td>
                        <LocalizedDate date={user.createdAt} />
                      </Td>
                      <Td style={{ paddingRight: 0 }}>
                        <Flex
                          justifyContent="flex-end"
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: '100%' }}
                        >
                          <Dialog.Root>
                            <Dialog.Trigger>
                              <IconButton
                                label={formatMessage(getTrad('whitelist.delete.label'))}
                                withTooltip={false}
                              >
                                <Trash />
                              </IconButton>
                            </Dialog.Trigger>
                            <Dialog.Content>
                              <Dialog.Header>
                                {formatMessage(getTrad('whitelist.delete.title'))}
                              </Dialog.Header>
                              <Dialog.Body icon={<WarningCircle fill="danger600" />}>
                                <Flex direction="column" alignItems="center" gap={2}>
                                  <Flex justifyContent="center">
                                    <Typography id="confirm-description">
                                      {formatMessage(getTrad('whitelist.delete.description'))}
                                    </Typography>
                                  </Flex>
                                  <Flex justifyContent="center">
                                    <Typography variant="omega" fontWeight="bold">
                                      {user.email}
                                    </Typography>
                                  </Flex>
                                  <Flex justifyContent="center" marginTop={2}>
                                    <Typography variant="pi" textColor="neutral600">
                                      {formatMessage(getTrad('whitelist.delete.note'))}
                                    </Typography>
                                  </Flex>
                                </Flex>
                              </Dialog.Body>
                              <Dialog.Footer>
                                <Dialog.Cancel>
                                  <Button fullWidth variant="tertiary">
                                    {formatMessage(getTrad('page.cancel'))}
                                  </Button>
                                </Dialog.Cancel>
                                <Dialog.Action>
                                  <Button
                                    fullWidth
                                    variant="danger-light"
                                    onClick={() => onDelete(user.email)}
                                  >
                                    {formatMessage(getTrad('page.ok'))}
                                  </Button>
                                </Dialog.Action>
                              </Dialog.Footer>
                            </Dialog.Content>
                          </Dialog.Root>
                        </Flex>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </Tbody>
          </CustomTable>
          {pageCount > 1 && (
            <Box paddingTop={4}>
              <Flex justifyContent="flex-end">
                <Pagination activePage={page} pageCount={pageCount}>
                  <PreviousLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.max(1, p - 1));
                    }}
                  >
                    {formatMessage(getTrad('pagination.previous'))}
                  </PreviousLink>
                  {Array.from({ length: pageCount }).map((_, i) => (
                    <PageLink
                      key={i + 1}
                      number={i + 1}
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setPage(i + 1);
                      }}
                    >
                      {formatMessage(getTrad('pagination.page'), { page: i + 1 })}
                    </PageLink>
                  ))}
                  <NextLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage((p) => Math.min(pageCount, p + 1));
                    }}
                  >
                    {formatMessage(getTrad('pagination.next'))}
                  </NextLink>
                </Pagination>
              </Flex>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
