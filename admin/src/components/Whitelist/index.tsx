import {
  Box,
  Divider,
  Field,
  Flex,
  IconButton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from '@strapi/design-system';
import React, { useCallback, useRef, useState } from 'react';
import { Download, Plus, Trash, Upload } from '@strapi/icons';
import { useNotification } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';
import { ConfirmDialog, CustomTable, LocalizedDate, SizedButton, TablePagination } from '../shared';

import type { WhitelistUser } from '../../types';
import { EMAIL_REGEX } from '../../../../shared/constants';

interface WhitelistProps {
  users: WhitelistUser[];
  useWhitelist: boolean;
  loading: boolean;
  onSave: (email: string) => void;
  onDelete: (email: string) => void;
  onDeleteAll: () => void;
  onImport: (emails: string[]) => Promise<number>;
  onExport: () => void;
}

const PAGE_SIZE = 10;

export default function Whitelist({
  users,
  useWhitelist,
  loading,
  onSave,
  onDelete,
  onDeleteAll,
  onImport,
  onExport,
}: WhitelistProps) {
  const [email, setEmail] = useState('');
  const [page, setPage] = useState(1);
  const { formatMessage } = useIntl();
  const { toggleNotification } = useNotification();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pageCount = Math.ceil(users.length / PAGE_SIZE) || 1;
  const paginatedUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const onSaveEmail = useCallback(() => {
    const emailText = email.trim();
    if (users.some((user) => user.email === emailText)) {
      toggleNotification({
        type: 'warning',
        message: formatMessage(getTrad('whitelist.error.unique')),
      });
    } else {
      onSave(emailText);
      setEmail('');
    }
  }, [email, users, onSave, formatMessage, toggleNotification]);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!fileInputRef.current || !file) return;
      fileInputRef.current.value = '';
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error();
        const emails = parsed
          .filter((item: unknown) => (item as { email?: string })?.email)
          .map((item: unknown) =>
            String((item as { email: string }).email)
              .trim()
              .toLowerCase(),
          )
          .filter((email: string) => EMAIL_REGEX.test(email));
        const count = await onImport(emails);
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
          <Flex
            gap={8}
            marginTop={5}
            marginBottom={5}
            alignItems="stretch"
            wrap="wrap"
            style={{ rowGap: '0.8rem' }}
          >
            <Flex gap={2} alignItems="center" style={{ minWidth: '280px', flex: '1 1 280px' }}>
              <Box style={{ flex: 1, minWidth: '200px' }}>
                <Field.Root>
                  <Field.Input
                    type="text"
                    disabled={loading}
                    value={email}
                    hasError={Boolean(email && !EMAIL_REGEX.test(email))}
                    onChange={(e) => setEmail(e.currentTarget.value)}
                    placeholder={formatMessage(getTrad('whitelist.email.placeholder'))}
                    style={{ fontSize: '1.4rem', lineHeight: '2.2rem' }}
                  />
                </Field.Root>
              </Box>
              <SizedButton
                size="S"
                startIcon={<Plus />}
                disabled={loading || email.trim() === '' || !EMAIL_REGEX.test(email)}
                loading={loading}
                onClick={onSaveEmail}
              >
                {formatMessage(getTrad('page.add'))}
              </SizedButton>
            </Flex>
            <Flex gap={2} alignItems="center">
              <SizedButton
                size="S"
                variant="tertiary"
                startIcon={<Download />}
                onClick={onExport}
                disabled={users.length === 0}
              >
                {formatMessage(getTrad('button.export'))}
              </SizedButton>
              <SizedButton
                size="S"
                variant="tertiary"
                startIcon={<Upload />}
                onClick={() => fileInputRef.current?.click()}
              >
                {formatMessage(getTrad('whitelist.import'))}
              </SizedButton>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleImport}
              />
              <ConfirmDialog
                trigger={
                  <SizedButton
                    size="S"
                    variant="danger-light"
                    startIcon={<Trash />}
                    disabled={users.length === 0}
                  >
                    {formatMessage(getTrad('button.deleteAll'))}
                  </SizedButton>
                }
                title={formatMessage(getTrad('whitelist.delete.all.title'))}
                body={
                  <Flex justifyContent="center">
                    <Typography textColor="neutral800" textAlign="center">
                      {formatMessage(getTrad('whitelist.delete.all.description'), {
                        count: users.length,
                      })}
                    </Typography>
                  </Flex>
                }
                confirmLabel={formatMessage(getTrad('button.deleteAll'))}
                onConfirm={onDeleteAll}
              />
            </Flex>
          </Flex>

          <Divider />
          <CustomTable colCount={4} rowCount={users.length}>
            <Thead>
              <Tr>
                <Th>{formatMessage(getTrad('whitelist.table.no'))}</Th>
                <Th>{formatMessage(getTrad('whitelist.table.email'))}</Th>
                <Th>{formatMessage(getTrad('whitelist.table.created'))}</Th>
                <Th style={{ paddingRight: 0 }}>&nbsp;</Th>
              </Tr>
            </Thead>
            <Tbody>
              {users.length === 0 ? (
                <Tr>
                  <Td colSpan={4}>
                    <Flex justifyContent="center" alignItems="center" style={{ minHeight: '80px' }}>
                      <Typography textColor="neutral600">
                        {formatMessage(getTrad('whitelist.table.empty'))}
                      </Typography>
                    </Flex>
                  </Td>
                </Tr>
              ) : (
                paginatedUsers.map((user, index) => (
                  <Tr key={user.email}>
                    <Td>{index + 1 + (page - 1) * PAGE_SIZE}</Td>
                    <Td>{user.email}</Td>
                    <Td>
                      <LocalizedDate date={user.createdAt} options={{ second: '2-digit' }} />
                    </Td>
                    <Td style={{ paddingRight: 0 }}>
                      <Flex
                        justifyContent="flex-end"
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '100%' }}
                      >
                        <ConfirmDialog
                          trigger={
                            <IconButton
                              label={formatMessage(getTrad('whitelist.delete.label'))}
                              withTooltip={false}
                            >
                              <Trash />
                            </IconButton>
                          }
                          title={formatMessage(getTrad('whitelist.delete.title'))}
                          body={
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
                          }
                          confirmLabel={formatMessage(getTrad('page.ok'))}
                          onConfirm={() => onDelete(user.email)}
                          confirmVariant="danger-light"
                        />
                      </Flex>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </CustomTable>

          <TablePagination
            page={page}
            pageCount={pageCount}
            onPageChange={setPage}
            total={users.length}
          />
        </>
      )}
    </Box>
  );
}
