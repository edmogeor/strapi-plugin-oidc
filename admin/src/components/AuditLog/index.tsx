import {
  Box,
  Button,
  Flex,
  Tbody,
  Td,
  Th,
  Thead,
  Tooltip,
  Tr,
  Typography,
} from '@strapi/design-system';
import { useCallback, useEffect, useState } from 'react';
import { Download, Information, Trash } from '@strapi/icons';
import { useFetchClient, useNotification } from '@strapi/strapi/admin';
import { useIntl } from 'react-intl';
import getTrad from '../../utils/getTrad';
import { ConfirmDialog, CustomTable, LocalizedDate, TablePagination } from '../shared';

interface AuditLogRecord {
  id: number;
  action: string;
  email?: string;
  ip?: string;
  details?: string;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
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
          <ConfirmDialog
            trigger={
              <Button
                size="S"
                variant="danger-light"
                startIcon={<Trash />}
                disabled={pagination.total === 0}
              >
                {formatMessage(getTrad('auditlog.clear'))}
              </Button>
            }
            title={formatMessage(getTrad('auditlog.clear.title'))}
            body={
              <Flex justifyContent="center">
                <Typography textColor="neutral800" textAlign="center">
                  {formatMessage(getTrad('auditlog.clear.description'), {
                    count: pagination.total,
                  })}
                </Typography>
              </Flex>
            }
            confirmLabel={formatMessage(getTrad('auditlog.clear'))}
            onConfirm={handleClearAll}
          />
        </Flex>
      </Flex>

      <CustomTable colCount={5} rowCount={records.length}>
        <Thead>
          <Tr>
            <Th>{formatMessage(getTrad('auditlog.table.timestamp'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.action'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.email'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.ip'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.details'))}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {loading && (
            <Tr>
              <Td colSpan={5}>
                <Flex justifyContent="center" padding={4}>
                  <Typography textColor="neutral600">Loading…</Typography>
                </Flex>
              </Td>
            </Tr>
          )}
          {!loading && records.length === 0 && (
            <Tr>
              <Td colSpan={5}>
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
                    <LocalizedDate date={record.createdAt} options={{ second: '2-digit' }} />
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
                <Td style={{ maxWidth: '200px' }}>
                  {record.details ? (
                    <Tooltip label={record.details} side="top">
                      <Typography
                        variant="omega"
                        textColor="neutral600"
                        style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '180px',
                          cursor: 'help',
                        }}
                      >
                        {record.details}
                      </Typography>
                    </Tooltip>
                  ) : (
                    <Typography variant="omega" textColor="neutral600">
                      —
                    </Typography>
                  )}
                </Td>
              </Tr>
            ))}
        </Tbody>
      </CustomTable>

      <TablePagination page={page} pageCount={pagination.pageCount} onPageChange={setPage} />
    </Box>
  );
}
