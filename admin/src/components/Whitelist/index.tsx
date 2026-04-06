import {
  Box,
  Button,
  Divider,
  Field,
  Flex,
  Grid,
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
import React, { useCallback, useState } from 'react';
import { Check, Plus, Trash, WarningCircle } from '@strapi/icons';
import { Dialog } from '@strapi/design-system';
import getTrad from '../../utils/getTrad';
import { useIntl } from 'react-intl';
import { OIDCRole, RoleDef } from '../Role';

const CustomTable = styled(Table)`
  th,
  td,
  th span,
  td span {
    font-size: 1.3rem !important;
  }
`;

const LocalizedDate = ({ date }: { date: string }) => {
  const userLocale = navigator.language || 'en-US';
  return new Intl.DateTimeFormat(userLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

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
  onSave: (email: string, roles: string[]) => Promise<void>;
  onDelete: (email: string) => Promise<void>;
}

export default function Whitelist({
  users,
  roles,
  oidcRoles = [],
  useWhitelist,
  loading,
  onSave,
  onDelete,
}: WhitelistProps) {
  const [email, setEmail] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const { formatMessage } = useIntl();
  const PAGE_SIZE = 10;

  const pageCount = Math.ceil(users.length / PAGE_SIZE) || 1;
  const paginatedUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const onSaveEmail = useCallback(async () => {
    const emailText = email.trim();
    if (users.some((user) => user.email === emailText)) {
      alert(formatMessage(getTrad('whitelist.error.unique')));
    } else {
      await onSave(emailText, selectedRoles);
      setEmail('');
      setSelectedRoles([]);
    }
  }, [email, selectedRoles, users, onSave, formatMessage]);

  const isValidEmail = useCallback(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }, [email]);

  return (
    <>
      <Box>
        <Typography tag="p" variant="omega" textColor="neutral600" marginBottom={4}>
          {formatMessage(getTrad('whitelist.description'))}
        </Typography>

        {useWhitelist && (
          <>
            <Flex gap={4} marginTop={5} marginBottom={5} alignItems="flex-start">
              <Box style={{ flex: 1 }}>
                <Field.Root>
                  <Field.Input
                    type={'text'}
                    disabled={loading}
                    value={email}
                    hasError={Boolean(email && !isValidEmail())}
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
                  disabled={loading || email.trim() === '' || !isValidEmail()}
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
                    const getRoleNames = (roleIds: string[]) =>
                      roleIds
                        .map((roleId) => {
                          const r = roles.find((ro) => String(ro.id) === String(roleId));
                          return r ? r.name : roleId;
                        })
                        .join(', ');

                    let userRolesNames = getRoleNames(user.roles || []);

                    if (!userRolesNames) {
                      const defaultRolesIds = oidcRoles.reduce<string[]>((acc, oidc) => {
                        if (oidc.role) acc.push(...oidc.role);
                        return acc;
                      }, []);
                      userRolesNames = getRoleNames(defaultRolesIds);
                    }

                    return (
                      <Tr key={user.email}>
                        <Td>{index + 1 + (page - 1) * PAGE_SIZE}</Td>
                        <Td>{user.email}</Td>
                        <Td>{userRolesNames || '-'}</Td>
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
                      Go to previous page
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
                        Go to page {i + 1}
                      </PageLink>
                    ))}
                    <NextLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setPage((p) => Math.min(pageCount, p + 1));
                      }}
                    >
                      Go to next page
                    </NextLink>
                  </Pagination>
                </Flex>
              </Box>
            )}
          </>
        )}
      </Box>
    </>
  );
}
