import {
  Box,
  Button,
  Flex,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
  Pagination,
  PreviousLink,
  NextLink,
  PageLink,
} from '@strapi/design-system';
import styled from 'styled-components';
import { useCallback, useEffect, useState } from 'react';
import { Download } from '@strapi/icons';
import { useFetchClient } from '@strapi/strapi/admin';
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
  userId?: number;
  ip?: string;
  reason?: string;
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

export default function AuditLog() {
  const { formatMessage } = useIntl();
  const { get } = useFetchClient();

  const [records, setRecords] = useState<AuditLogRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 25,
    total: 0,
    pageCount: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const response = await get(`/strapi-plugin-oidc/audit-logs?page=${p}&pageSize=25`);
        setRecords(response.data.results ?? []);
        setPagination(
          response.data.pagination ?? { page: p, pageSize: 25, total: 0, pageCount: 1 },
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

  const handleExport = async () => {
    try {
      const rawToken = localStorage.getItem('jwtToken');
      const token = rawToken ? JSON.parse(rawToken) : '';
      const response = await fetch('/strapi-plugin-oidc/audit-logs/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      const blob = new Blob([text], { type: 'application/x-ndjson' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oidc-audit-log-${new Date().toISOString().slice(0, 10)}.ndjson`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — download is best-effort
    }
  };

  return (
    <Box>
      <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
        <Typography variant="pi" textColor="neutral600">
          {pagination.total} {pagination.total === 1 ? 'entry' : 'entries'}
        </Typography>
        <Button
          size="S"
          variant="tertiary"
          startIcon={<Download />}
          onClick={handleExport}
          disabled={pagination.total === 0}
        >
          {formatMessage(getTrad('auditlog.export'))}
        </Button>
      </Flex>

      <CustomTable colCount={6} rowCount={records.length}>
        <Thead>
          <Tr>
            <Th>{formatMessage(getTrad('auditlog.table.timestamp'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.action'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.email'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.userId'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.ip'))}</Th>
            <Th>{formatMessage(getTrad('auditlog.table.reason'))}</Th>
          </Tr>
        </Thead>
        <Tbody>
          {loading && (
            <Tr>
              <Td colSpan={6}>
                <Flex justifyContent="center" padding={4}>
                  <Typography textColor="neutral600">Loading…</Typography>
                </Flex>
              </Td>
            </Tr>
          )}
          {!loading && records.length === 0 && (
            <Tr>
              <Td colSpan={6}>
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
                  <Typography variant="omega">{record.action}</Typography>
                </Td>
                <Td>
                  <Typography variant="omega">{record.email ?? '—'}</Typography>
                </Td>
                <Td>
                  <Typography variant="omega">{record.userId ?? '—'}</Typography>
                </Td>
                <Td>
                  <Typography variant="omega">{record.ip ?? '—'}</Typography>
                </Td>
                <Td>
                  <Typography variant="omega">{record.reason ?? '—'}</Typography>
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
              {Array.from({ length: pagination.pageCount }).map((_, i) => (
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
