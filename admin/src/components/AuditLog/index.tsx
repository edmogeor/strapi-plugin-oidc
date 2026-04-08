import {
  Box,
  Button,
  Dialog,
  Flex,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tooltip,
  Tr,
  Typography,
  Pagination,
  PreviousLink,
  NextLink,
  PageLink,
} from '@strapi/design-system';
import styled from 'styled-components';
import { useCallback, useEffect, useState } from 'react';
import { Download, Information, Trash, WarningCircle } from '@strapi/icons';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';

const CustomTable = styled(Table)`
  th,
  td,
  th span,
  td span {
    font-size: 1.3rem !important;
  }
`;

interface AuditLogRecord {
  id: number;
  action: string;
  email?: string;
  ip?: string;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

function LocalizedDate({ date }: { date: string }) {
  const userLocale = navigator.language || 'en-US';
  return new Intl.DateTimeFormat(userLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(date));
}

const PAGE_SIZE = 10;

export default function AuditLog() {
  const { formatMessage } = useIntl();
  const { get, del } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    pageCount: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const response = await get(
          `/strapi-plugin-oidc/audit-logs?page=${p}&pageSize=${PAGE_SIZE}`,
        );
        setRecords(response.data.results ?? []);
        setPagination(
          response.data.pagination ?? { page: p, pageSize: PAGE_SIZE, total: 0, pageCount: 1 },
        );
      } catch {
        setRecords([]);
      } finally {
        setLoading(false);
      }
    },
    [get],
  );

  useEffect(() => {
    fetchLogs(page);
  }, [fetchLogs, page]);

  const handleClearAll = async () => {
    try {
      await del('/strapi-plugin-oidc/audit-logs');
      toggleNotification({
        type: 'success',
        message: formatMessage(getTrad('auditlog.clear.success')),
      });
      fetchLogs(1);
    } catch {
      toggleNotification({
        type: 'danger',
        message: formatMessage(getTrad('auditlog.clear.error')),
      });
    }
  };

  const handleExport = async () => {
    try {
      // Extract token from cookie (how Strapi stores it) and send as Bearer header.
      // The admin::isAuthenticatedAdmin policy only reads Authorization header, not cookies.
      const cookieMatch = document.cookie.match(/(?:^|;\s*)jwtToken=([^;]+)/);
      const token = cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
      const response = await fetch('/strapi-plugin-oidc/audit-logs/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        toggleNotification({
          type: 'danger',
          message: formatMessage(getTrad('auditlog.export.error')),
        });
        return;
      }
      const text = await response.text();
      const blob = new Blob([text], { type: 'application/x-ndjson' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oidc-audit-log-${new Date().toISOString().slice(0, 10)}.ndjson`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toggleNotification({
        type: 'danger',
        message: formatMessage(getTrad('auditlog.export.error')),
      });
    }
  };

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
        <Typography variant="pi" textColor="neutral600">
          {pagination.total} {pagination.total === 1 ? 'entry' : 'entries'}
        </Typography>
        <Flex gap={2}>
          <Button
            size="S"
            variant="tertiary"
            startIcon={<Download />}
            onClick={handleExport}
            disabled={pagination.total === 0}
          >
            {formatMessage(getTrad('auditlog.export'))}
          </Button>
          <Dialog.Root>
            <Dialog.Trigger>
              <Button
                size="S"
                variant="danger-light"
                startIcon={<Trash />}
                disabled={pagination.total === 0}
              >
                {formatMessage(getTrad('auditlog.clear'))}
              </Button>
            </Dialog.Trigger>
            <Dialog.Content>
              <Dialog.Header>{formatMessage(getTrad('auditlog.clear.title'))}</Dialog.Header>
              <Dialog.Body icon={<WarningCircle fill="danger600" />}>
                <Flex justifyContent="center">
                  <Typography textColor="neutral800" textAlign="center">
                    {formatMessage(getTrad('auditlog.clear.description'), {
                      count: pagination.total,
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
                  <Button fullWidth variant="danger" onClick={handleClearAll}>
                    {formatMessage(getTrad('auditlog.clear'))}
                  </Button>
                </Dialog.Action>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Root>
        </Flex>
      </Flex>

      <CustomTable colCount={4} rowCount={records.length}>
        <Thead>
          <Tr>
            <Th>{formatMessage(getTrad('auditlog.table.timestamp'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.action'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.email'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.ip'))}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {loading && (
            <Tr>
              <Td colSpan={4}>
                <Flex justifyContent="center" padding={4}>
                  <Typography textColor="neutral600">Loading…</Typography>
                </Flex>
              </Td>
            </Tr>
          )}
          {!loading && records.length === 0 && (
            <Tr>
              <Td colSpan={4}>
                <Flex justifyContent="center" padding={4}>
                  <Typography textColor="neutral600">
                    {formatMessage(getTrad('auditlog.table.empty'))}
                  </Typography>
                </Flex>
              </Td>
            </Tr>
          )}
          {!loading &&
            records.map((record) => (
              <Tr key={record.id}>
                <Td>
                  <Typography variant="omega">
                    <LocalizedDate date={record.createdAt} />
                  </Typography>
                </Td>
                <Td>
                  <Flex gap={2} alignItems="center">
                    <Typography variant="omega">{record.action}</Typography>
                    <Tooltip label={formatMessage(getTrad(`auditlog.action.${record.action}`))}>
                      <Information
                        aria-hidden
                        style={{ cursor: 'help' }}
                        width="1.4rem"
                        height="1.4rem"
                        fill="primary600"
                      />
                    </Tooltip>
                  </Flex>
                </Td>
                <Td>
                  <Typography variant="omega">{record.email ?? '—'}</Typography>
                </Td>
                <Td>
                  <Typography variant="omega">{record.ip ?? '—'}</Typography>
                </Td>
              </Tr>
            ))}
        </Tbody>
      </CustomTable>

      {pagination.pageCount > 1 && (
        <Box paddingTop={4}>
          <Flex justifyContent="flex-end">
            <Pagination activePage={page} pageCount={pagination.pageCount}>
              <PreviousLink
                href="#"
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  setPage((p) => Math.max(1, p - 1));
                }}
              >
                {formatMessage(getTrad('pagination.previous'))}
              </PreviousLink>
              {pagination.pageCount <= 10 ? (
                Array.from({ length: pagination.pageCount }).map((_, i) => (
                  <PageLink
                    key={i + 1}
                    number={i + 1}
                    href="#"
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      setPage(i + 1);
                    }}
                  >
                    {formatMessage(getTrad('pagination.page'), { page: i + 1 })}
                  </PageLink>
                ))
              ) : (
                <>
                  {page <= 6 ? (
                    <>
                      {Array.from({ length: 9 }).map((_, i) => (
                        <PageLink
                          key={i + 1}
                          number={i + 1}
                          href="#"
                          onClick={(e: React.MouseEvent) => {
                            e.preventDefault();
                            setPage(i + 1);
                          }}
                        >
                          {formatMessage(getTrad('pagination.page'), { page: i + 1 })}
                        </PageLink>
                      ))}
                      <Typography textColor="neutral600" paddingX={2}>
                        …
                      </Typography>
                      <PageLink
                        number={pagination.pageCount}
                        href="#"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          setPage(pagination.pageCount);
                        }}
                      >
                        {formatMessage(getTrad('pagination.page'), { page: pagination.pageCount })}
                      </PageLink>
                    </>
                  ) : page >= pagination.pageCount - 5 ? (
                    <>
                      <PageLink
                        number={1}
                        href="#"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          setPage(1);
                        }}
                      >
                        {formatMessage(getTrad('pagination.page'), { page: 1 })}
                      </PageLink>
                      <Typography textColor="neutral600" paddingX={2}>
                        …
                      </Typography>
                      {Array.from({ length: 9 }).map((_, i) => {
                        const pageNum = pagination.pageCount - 8 + i;
                        return (
                          <PageLink
                            key={pageNum}
                            number={pageNum}
                            href="#"
                            onClick={(e: React.MouseEvent) => {
                              e.preventDefault();
                              setPage(pageNum);
                            }}
                          >
                            {formatMessage(getTrad('pagination.page'), { page: pageNum })}
                          </PageLink>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <PageLink
                        number={1}
                        href="#"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          setPage(1);
                        }}
                      >
                        {formatMessage(getTrad('pagination.page'), { page: 1 })}
                      </PageLink>
                      <Typography textColor="neutral600" paddingX={2}>
                        …
                      </Typography>
                      {Array.from({ length: 7 }).map((_, i) => {
                        const pageNum = page - 3 + i + 1;
                        return (
                          <PageLink
                            key={pageNum}
                            number={pageNum}
                            href="#"
                            onClick={(e: React.MouseEvent) => {
                              e.preventDefault();
                              setPage(pageNum);
                            }}
                          >
                            {formatMessage(getTrad('pagination.page'), { page: pageNum })}
                          </PageLink>
                        );
                      })}
                      <Typography textColor="neutral600" paddingX={2}>
                        …
                      </Typography>
                      <PageLink
                        number={pagination.pageCount}
                        href="#"
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          setPage(pagination.pageCount);
                        }}
                      >
                        {formatMessage(getTrad('pagination.page'), { page: pagination.pageCount })}
                      </PageLink>
                    </>
                  )}
                </>
              )}
              <NextLink
                href="#"
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  setPage((p) => Math.min(pagination.pageCount, p + 1));
                }}
              >
                {formatMessage(getTrad('pagination.next'))}
              </NextLink>
            </Pagination>
          </Flex>
        </Box>
      )}
    </Box>
  );
}
